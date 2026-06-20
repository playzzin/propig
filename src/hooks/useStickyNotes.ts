
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { db, ensureFirestorePersistence } from '@/firebase/config';
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    writeBatch,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
    DocumentData
} from 'firebase/firestore';
import {
    StickyNote,
    StickyNoteColor,
    StickyNoteColorSchema,
    StickyNoteSchema
} from '@/types/stickyNote';
import {
    createId,
    clamp,
    getMaxZIndex,
    getStorageKey,
    getTagColorsStorageKey,
    normalizeTagKey,
} from '@/utils/stickyNoteUtils';

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const CANVAS_WIDTH = 4000;
const CANVAS_HEIGHT = 2400;
const FIRESTORE_BATCH_LIMIT = 450;

const StickyNotesLocalStateV1Schema = z.object({
    version: z.literal(1),
    notes: z.array(StickyNoteSchema),
}).strict();

const StickyNotesTagColorsLocalStateV1Schema = z.object({
    version: z.literal(1),
    colors: z.record(z.string(), StickyNoteColorSchema),
}).strict();

const FirestoreMillisSchema = z.unknown().transform((value, ctx) => {
    if (value === null || value === undefined) return Date.now();
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && value !== null && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid timestamp' });
    return z.NEVER;
});

const FirestoreStickyNoteSchema = z.object({
    content: z.string().default(''),
    x: z.number().default(120),
    y: z.number().default(120),
    w: z.number().default(280),
    h: z.number().default(240),
    zIndex: z.number().default(1),
    color: StickyNoteColorSchema.default('sun'),
    tags: z.array(z.string()).default([]),
    isPinned: z.boolean().default(false),
    isArchived: z.boolean().default(false),
    createdAt: FirestoreMillisSchema,
    updatedAt: FirestoreMillisSchema,
}).passthrough();

// Firestore Data Converter
const stickyNoteConverter: FirestoreDataConverter<StickyNote> = {
    toFirestore(note: StickyNote): DocumentData {
        return {
            content: note.content,
            x: note.x,
            y: note.y,
            w: note.w,
            h: note.h,
            zIndex: note.zIndex,
            color: note.color,
            tags: note.tags,
            isPinned: note.isPinned,
            isArchived: note.isArchived,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt
        };
    },
    fromFirestore(
        snapshot: QueryDocumentSnapshot,
        options: SnapshotOptions
    ): StickyNote {
        const data = snapshot.data(options);
        const parsed = FirestoreStickyNoteSchema.safeParse(data);
        if (!parsed.success) {
            console.error('StickyNote Parse Error', parsed.error);
            // Return a safe fallback to prevent app crash, or rethrow if strict
            throw new Error("Invalid Note Data");
        }
        return {
            id: snapshot.id,
            ...parsed.data
        } as StickyNote;
    }
};

export function useStickyNotes() {
    const { currentUser } = useAuth();

    const [notes, setNotes] = useState<StickyNote[]>([]);
    const [tagColors, setTagColors] = useState<Record<string, StickyNoteColor>>({});
    const [storageError, setStorageError] = useState<string | null>(null);

    const notesRef = useRef<StickyNote[]>([]);
    const pendingFirestoreWritesRef = useRef<Map<string, Record<string, unknown>>>(new Map());
    const inFlightFirestoreWritesRef = useRef<Set<string>>(new Set());
    const pendingDeletedNoteIdsRef = useRef<Set<string>>(new Set());
    const firestoreWriteTimerRef = useRef<number | null>(null);
    const didAutoImportRef = useRef<Record<string, boolean>>({});
    const didAutoImportTagColorsRef = useRef<Record<string, boolean>>({});
    const pendingUserDocWritesRef = useRef<Record<string, unknown> | null>(null);
    const userDocWriteTimerRef = useRef<number | null>(null);

    const storageKey = useMemo(() => getStorageKey(currentUser?.uid ?? null), [currentUser?.uid]);
    const tagColorsStorageKey = useMemo(() => getTagColorsStorageKey(currentUser?.uid ?? null), [currentUser?.uid]);

    const clearPendingWrites = useCallback(() => {
        if (typeof window !== 'undefined' && firestoreWriteTimerRef.current !== null) {
            window.clearTimeout(firestoreWriteTimerRef.current);
            firestoreWriteTimerRef.current = null;
        }
        if (typeof window !== 'undefined' && userDocWriteTimerRef.current !== null) {
            window.clearTimeout(userDocWriteTimerRef.current);
            userDocWriteTimerRef.current = null;
        }
        pendingFirestoreWritesRef.current.clear();
        inFlightFirestoreWritesRef.current.clear();
        pendingDeletedNoteIdsRef.current.clear();
        pendingUserDocWritesRef.current = null;
    }, []);

    const deleteStickyNoteDocs = useCallback(async (uid: string) => {
        await ensureFirestorePersistence();
        const snapshot = await getDocs(collection(db, 'users', uid, 'stickyNotes'));

        for (let index = 0; index < snapshot.docs.length; index += FIRESTORE_BATCH_LIMIT) {
            const batch = writeBatch(db);
            snapshot.docs.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach((noteDoc) => {
                batch.delete(noteDoc.ref);
            });
            await batch.commit();
        }
    }, []);

    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    // Clean up timers on unmount or user change
    useEffect(() => {
        const pendingFirestoreWrites = pendingFirestoreWritesRef.current;
        const inFlightFirestoreWrites = inFlightFirestoreWritesRef.current;
        const pendingDeletedNoteIds = pendingDeletedNoteIdsRef.current;
        return () => {
            if (typeof window !== 'undefined' && firestoreWriteTimerRef.current !== null) {
                window.clearTimeout(firestoreWriteTimerRef.current);
                firestoreWriteTimerRef.current = null;
            }
            if (typeof window !== 'undefined' && userDocWriteTimerRef.current !== null) {
                window.clearTimeout(userDocWriteTimerRef.current);
                userDocWriteTimerRef.current = null;
            }
            pendingFirestoreWrites.clear();
            inFlightFirestoreWrites.clear();
            pendingDeletedNoteIds.clear();
            pendingUserDocWritesRef.current = null;
        };
    }, [currentUser]);

    // Load from Local Storage (Notes)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        queueMicrotask(() => {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) {
                setNotes([]);
                setStorageError(null);
                return;
            }
            try {
                const parsedJson = JSON.parse(raw);
                const parsed = StickyNotesLocalStateV1Schema.safeParse(parsedJson);

                if (!parsed.success) {
                    setNotes([]);
                    setStorageError('저장된 메모 데이터 형식이 변경되어 초기화되었습니다.');
                    return;
                }
                setNotes(parsed.data.notes);
                setStorageError(null);
            } catch {
                setNotes([]);
            }
        });
    }, [storageKey]);

    // Load from Local Storage (Tag Colors)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        queueMicrotask(() => {
            const raw = window.localStorage.getItem(tagColorsStorageKey);
            if (!raw) {
                setTagColors({});
                return;
            }
            try {
                const parsedJson = JSON.parse(raw);
                const parsed = StickyNotesTagColorsLocalStateV1Schema.safeParse(parsedJson);
                if (!parsed.success) {
                    setTagColors({});
                    return;
                }
                const normalized: Record<string, StickyNoteColor> = {};
                for (const k of Object.keys(parsed.data.colors)) {
                    const v = parsed.data.colors[k];
                    const key = normalizeTagKey(k);
                    if (key) normalized[key] = v;
                }
                setTagColors(normalized);
            } catch {
                setTagColors({});
            }
        });
    }, [tagColorsStorageKey]);

    // Save to Local Storage (Notes)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handle = window.setTimeout(() => {
            const payload = { version: 1, notes } as const;
            try {
                window.localStorage.setItem(storageKey, JSON.stringify(payload));
                setStorageError(null);
            } catch {
                setStorageError('저장 공간 부족으로 로컬 저장 실패');
            }
        }, 250);
        return () => window.clearTimeout(handle);
    }, [notes, storageKey]);

    // Save to Local Storage (Tag Colors)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handle = window.setTimeout(() => {
            const payload = { version: 1, colors: tagColors } as const;
            try {
                window.localStorage.setItem(tagColorsStorageKey, JSON.stringify(payload));
            } catch {
                // ignore
            }
        }, 250);
        return () => window.clearTimeout(handle);
    }, [tagColors, tagColorsStorageKey]);

    const queueUserDocWrite = useCallback((patch: Record<string, unknown>) => {
        if (!currentUser) return;
        if (typeof window === 'undefined') return;

        const prev = pendingUserDocWritesRef.current ?? {};
        pendingUserDocWritesRef.current = { ...prev, ...patch };

        if (userDocWriteTimerRef.current !== null) return;

        userDocWriteTimerRef.current = window.setTimeout(() => {
            const p = pendingUserDocWritesRef.current;
            pendingUserDocWritesRef.current = null;
            userDocWriteTimerRef.current = null;
            if (!p) return;

            const uid = currentUser.uid;
            ensureFirestorePersistence().then(() => {
                setDoc(doc(db, 'users', uid), p, { merge: true }).catch(() => setStorageError('Firestore 동기화 실패'));
            });
        }, 450);
    }, [currentUser]);

    const mergeSyncedNotes = useCallback((currentNotes: StickyNote[], syncedNotes: StickyNote[]): StickyNote[] => {
        const currentById = new Map(currentNotes.map((note) => [note.id, note]));
        const syncedIds = new Set(syncedNotes.map((note) => note.id));
        const protectedIds = new Set<string>([
            ...pendingFirestoreWritesRef.current.keys(),
            ...inFlightFirestoreWritesRef.current,
        ]);
        const deletedIds = pendingDeletedNoteIdsRef.current;

        const merged = syncedNotes
            .filter((note) => !deletedIds.has(note.id))
            .map((syncedNote) => {
                const currentNote = currentById.get(syncedNote.id);
                if (currentNote && protectedIds.has(syncedNote.id)) {
                    return currentNote;
                }
                return syncedNote;
            });

        for (const currentNote of currentNotes) {
            if (!protectedIds.has(currentNote.id) || syncedIds.has(currentNote.id) || deletedIds.has(currentNote.id)) {
                continue;
            }
            merged.push(currentNote);
        }

        return merged;
    }, []);

    // Firestore Sync Setup
    useEffect(() => {
        if (!currentUser) return;
        if (typeof window === 'undefined') return;

        let unsubscribeNotes: (() => void) | null = null;
        let unsubscribeUserDoc: (() => void) | null = null;
        let didCancel = false;

        const bootstrap = async () => {
            try {
                await ensureFirestorePersistence();
                if (didCancel) return;
                setStorageError(null);

                const col = collection(db, 'users', currentUser.uid, 'stickyNotes').withConverter(stickyNoteConverter);
                const q = query(col);

                unsubscribeNotes = onSnapshot(q, (snapshot) => {
                    // Auto Import Logic
                    if (snapshot.empty && !didAutoImportRef.current[currentUser.uid]) {
                        didAutoImportRef.current[currentUser.uid] = true;
                        // ... Auto import logic (omitted for brevity in replacement, but needs to be kept? 
                        // The tool replaces chunk. I must include the auto import logic if I want to keep it.
                        // Wait, I can just keep the auto import logic inside the if block.
                        // Re-implementing auto-import briefly for safety:
                        const rawLocal = window.localStorage.getItem(getStorageKey(currentUser.uid));
                        if (rawLocal) {
                            const parsedJson = JSON.parse(rawLocal);
                            const parsedLocal = StickyNotesLocalStateV1Schema.safeParse(parsedJson);
                            if (parsedLocal.success && parsedLocal.data.notes.length > 0) {
                                Promise.all(parsedLocal.data.notes.map(async (n) => {
                                    const ref = doc(db, 'users', currentUser.uid, 'stickyNotes', n.id).withConverter(stickyNoteConverter);
                                    await setDoc(ref, n); // Converter handles it!
                                })).catch(() => setStorageError('Import failed'));
                            }
                        }
                    }

                    const next: StickyNote[] = [];
                    snapshot.forEach(d => {
                        // withConverter handles parsing!
                        next.push(d.data());
                    });
                    setNotes((currentNotes) => mergeSyncedNotes(currentNotes, next));
                }, (err) => {
                    console.error(err);
                    setStorageError('Firestore Connection Failed');
                });

                const userDocRef = doc(db, 'users', currentUser.uid);
                unsubscribeUserDoc = onSnapshot(userDocRef, (snap) => {
                    const rawData = snap.data({ serverTimestamps: 'estimate' }) as unknown;
                    const rawColors = isPlainRecord(rawData) ? rawData.stickyNotesTagColors : undefined;

                    if (rawColors === undefined) {
                        if (!didAutoImportTagColorsRef.current[currentUser.uid]) {
                            didAutoImportTagColorsRef.current[currentUser.uid] = true;
                            const rawLocal = window.localStorage.getItem(getTagColorsStorageKey(currentUser.uid));
                            if (rawLocal) {
                                try {
                                    const parsedLocal = StickyNotesTagColorsLocalStateV1Schema.parse(JSON.parse(rawLocal));
                                    const normalized: Record<string, StickyNoteColor> = {};
                                    for (const k of Object.keys(parsedLocal.colors)) {
                                        const key = normalizeTagKey(k);
                                        if (key) normalized[key] = parsedLocal.colors[k];
                                    }
                                    if (Object.keys(normalized).length > 0) {
                                        queueUserDocWrite({ stickyNotesTagColors: normalized });
                                    }
                                } catch { }
                            }
                        }
                        return;
                    }

                    const parsed = z.record(z.string(), StickyNoteColorSchema).safeParse(rawColors);
                    if (parsed.success) {
                        const normalized: Record<string, StickyNoteColor> = {};
                        for (const k of Object.keys(parsed.data)) {
                            const key = normalizeTagKey(k);
                            if (key) normalized[key] = parsed.data[k];
                        }
                        setTagColors(normalized);
                    }
                }, () => setStorageError('User data sync fail'));

            } catch {
                if (!didCancel) setStorageError('Init fail');
            }
        };

        bootstrap();

        return () => {
            didCancel = true;
            unsubscribeNotes?.();
            unsubscribeUserDoc?.();
        };
    }, [currentUser, mergeSyncedNotes, queueUserDocWrite]);

    const queueFirestoreWrite = useCallback((noteId: string, patch: Record<string, unknown>) => {
        if (!currentUser) return;
        if (typeof window === 'undefined') return;

        const prev = pendingFirestoreWritesRef.current.get(noteId) ?? {};
        pendingFirestoreWritesRef.current.set(noteId, { ...prev, ...patch });

        if (firestoreWriteTimerRef.current !== null) return;

        firestoreWriteTimerRef.current = window.setTimeout(() => {
            const entries = Array.from(pendingFirestoreWritesRef.current.entries());
            pendingFirestoreWritesRef.current.clear();
            firestoreWriteTimerRef.current = null;
            const uid = currentUser.uid;
            const writeIds = entries.map(([id]) => id);

            writeIds.forEach((id) => inFlightFirestoreWritesRef.current.add(id));

            void Promise.all(entries.map(async ([id, p]) => {
                try {
                    await ensureFirestorePersistence();
                    await setDoc(doc(db, 'users', uid, 'stickyNotes', id), { ...p, updatedAt: serverTimestamp() }, { merge: true });
                } catch { setStorageError('Sync failed'); }
            })).finally(() => {
                writeIds.forEach((id) => inFlightFirestoreWritesRef.current.delete(id));
            });
        }, 450);
    }, [currentUser]);

    // Actions
    const createNote = useCallback((viewport?: { scrollLeft: number, scrollTop: number, clientWidth?: number, clientHeight?: number }) => {
        const nextId = createId();

        setNotes(prev => {
            const maxZ = getMaxZIndex(prev);
            const isCompactViewport = typeof viewport?.clientWidth === 'number' && viewport.clientWidth <= 520;
            const noteWidth = isCompactViewport
                ? clamp((viewport?.clientWidth ?? 320) - 32, 240, 320)
                : 280;
            const noteHeight = isCompactViewport ? 340 : 240;
            const baseX = viewport ? viewport.scrollLeft + (isCompactViewport ? 16 : 80) : 120;
            const baseY = viewport ? viewport.scrollTop + (isCompactViewport ? 16 : 80) : 120;
            const stagger = (prev.length % 10) * 22;

            const next: StickyNote = {
                id: nextId,
                content: '',
                x: clamp(baseX + stagger, 0, CANVAS_WIDTH - noteWidth),
                y: clamp(baseY + stagger, 0, CANVAS_HEIGHT - noteHeight),
                w: noteWidth, h: noteHeight, zIndex: maxZ + 1,
                color: 'sun', tags: [], isPinned: false, isArchived: false,
                createdAt: Date.now(), updatedAt: Date.now()
            };

            if (currentUser) {
                queueFirestoreWrite(next.id, {
                    content: next.content, x: next.x, y: next.y, w: next.w, h: next.h,
                    zIndex: next.zIndex, color: next.color, tags: next.tags,
                    isPinned: next.isPinned, isArchived: next.isArchived,
                    createdAt: serverTimestamp()
                });
            }
            return [...prev, next];
        });

        return nextId;
    }, [currentUser, queueFirestoreWrite]);

    const updateNote = useCallback((noteId: string, patch: Partial<StickyNote>) => {
        setNotes(prev => prev.map(n => {
            if (n.id !== noteId) return n;
            const next = { ...n, ...patch, updatedAt: Date.now() };
            if (currentUser) {
                const firestorePatch: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(patch)) {
                    if (value === undefined || key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
                    firestorePatch[key] = value;
                }
                if (Object.keys(firestorePatch).length > 0) queueFirestoreWrite(noteId, firestorePatch);
            }
            return next;
        }));
    }, [currentUser, queueFirestoreWrite]);

    const deleteNote = useCallback((noteId: string) => {
        setNotes(prev => prev.filter(n => n.id !== noteId));
        if (currentUser) {
            pendingDeletedNoteIdsRef.current.add(noteId);
            ensureFirestorePersistence()
                .then(() => deleteDoc(doc(db, 'users', currentUser.uid, 'stickyNotes', noteId)))
                .catch(() => setStorageError('Delete failed'))
                .finally(() => {
                    pendingDeletedNoteIdsRef.current.delete(noteId);
                });
        }
    }, [currentUser]);

    const clearNotes = useCallback(async () => {
        clearPendingWrites();
        setNotes([]);

        if (!currentUser) return;

        didAutoImportRef.current[currentUser.uid] = true;
        await deleteStickyNoteDocs(currentUser.uid);
    }, [clearPendingWrites, currentUser, deleteStickyNoteDocs]);

    const clearAllNotesData = useCallback(async () => {
        clearPendingWrites();
        setNotes([]);
        setTagColors({});

        if (!currentUser) return;

        didAutoImportRef.current[currentUser.uid] = true;
        didAutoImportTagColorsRef.current[currentUser.uid] = true;
        await deleteStickyNoteDocs(currentUser.uid);
        await setDoc(doc(db, 'users', currentUser.uid), { stickyNotesTagColors: {} }, { merge: true });
    }, [clearPendingWrites, currentUser, deleteStickyNoteDocs]);

    const bringToFront = useCallback((noteId: string) => {
        setNotes(prev => {
            const maxZ = getMaxZIndex(prev);
            const next = prev.map(n => n.id === noteId ? { ...n, zIndex: maxZ + 1, updatedAt: Date.now() } : n);
            if (currentUser) queueFirestoreWrite(noteId, { zIndex: maxZ + 1 });
            return next;
        });
    }, [currentUser, queueFirestoreWrite]);

    return {
        notes,
        storageError,
        createNote,
        updateNote,
        deleteNote,
        clearNotes,
        clearAllNotesData,
        bringToFront,
        setNotes
    };
}
