'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { toast } from 'sonner';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { buildJsonAuthHeaders } from '@/lib/client-auth';
import {
  MandalartBoard,
  MandalartBoardInput,
  MandalartBoardSchema,
  MandalartSubGoal,
  MandalartTaskItem,
  createEmptyTask,
} from '@/types/mandalart';

// ─── Layout ─────────────────────────────────────────────

const PageContainer = styled.div`
  display: flex;
  height: 100%;
  background: var(--bg-base);
`;

const SidebarWrap = styled.aside`
  width: 280px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SidebarTitle = styled.h2`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-bright);
`;

const AddBoardButton = styled.button`
  border: none;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: var(--text-bright);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 26px var(--primary-glow);
  }
`;

const BoardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
`;

const BoardItem = styled.button<{ $active: boolean }>`
  border: 1px solid ${p => (p.$active ? 'rgba(16, 185, 129, 0.45)' : 'var(--border-subtle)')};
  background: ${p => (p.$active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)')};
  border-radius: 10px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.14);
  }
`;

const BoardItemTitle = styled.div`
  font-weight: 600;
  color: var(--text-main);
`;

const BoardMeta = styled.div`
  font-size: 0.8rem;
  color: var(--text-muted);
`;

const MiniProgress = styled.div`
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
`;

const MiniProgressFill = styled.div<{ width: number }>`
  height: 100%;
  width: ${p => p.width}%;
  background: linear-gradient(90deg, #10b981, #34d399);
  border-radius: 2px;
  transition: width 0.3s ease;
`;

const BoardActions = styled.div`
  margin-top: auto;
  display: flex;
  gap: 8px;
`;

const DeleteBoardButton = styled.button`
  flex: 1;
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.03);
  color: #ef4444;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  font-size: 0.85rem;

  &:hover {
    border-color: rgba(239, 68, 68, 0.55);
    background: rgba(239, 68, 68, 0.12);
  }
`;

// ─── Content ────────────────────────────────────────────

const Content = styled.main`
  flex: 1;
  padding: 32px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  flex-wrap: wrap;
`;

const HeaderInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 200px;
`;

const TitleInput = styled.input`
  font-size: 1.6rem;
  font-weight: 700;
  border: none;
  outline: none;
  padding: 0;
  color: var(--text-bright);
  background: transparent;
`;

const DescriptionInput = styled.textarea`
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px;
  min-height: 50px;
  resize: vertical;
  font-size: 0.95rem;
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.03);

  &::placeholder { color: var(--text-dim); }
  &:focus {
    outline: none;
    border-color: rgba(16, 185, 129, 0.45);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
  }
`;

const SaveStatus = styled.div`
  font-size: 0.85rem;
  color: var(--text-muted);
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ disabled?: boolean; $variant?: 'primary' | 'secondary' | 'ai' }>`
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  cursor: ${p => (p.disabled ? 'not-allowed' : 'pointer')};
  font-size: 0.85rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;

  ${p => {
    if (p.$variant === 'ai') return css`
      border: 1px solid rgba(99, 102, 241, 0.35);
      background: ${p.disabled ? 'rgba(255, 255, 255, 0.03)' : 'rgba(99, 102, 241, 0.14)'};
      color: ${p.disabled ? 'var(--text-dim)' : '#a5b4fc'};
      &:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: rgba(99, 102, 241, 0.6);
        background: rgba(99, 102, 241, 0.2);
      }
    `;
    if (p.$variant === 'secondary') return css`
      border: 1px solid var(--border-subtle);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      &:hover:not(:disabled) {
        border-color: rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.08);
      }
    `;
    // primary
    return css`
      background: ${p.disabled ? 'rgba(255, 255, 255, 0.08)' : 'linear-gradient(135deg, var(--primary), var(--primary-dark))'};
      color: var(--text-bright);
      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 12px 26px var(--primary-glow);
      }
    `;
  }}
`;

// ─── Progress Bar ───────────────────────────────────────

const ProgressContainer = styled.div`
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
`;

const ProgressBarTrack = styled.div`
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  overflow: hidden;
`;

const ProgressBarFill = styled.div<{ width: number }>`
  height: 100%;
  width: ${p => p.width}%;
  background: linear-gradient(90deg, #10b981, #34d399);
  border-radius: 4px;
  transition: width 0.4s ease;
`;

const ProgressText = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
`;

// ─── View Toggle ────────────────────────────────────────

const ViewToggle = styled.div`
  display: flex;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  overflow: hidden;
`;

const ViewToggleButton = styled.button<{ $active: boolean }>`
  border: none;
  background: ${p => (p.$active ? 'rgba(16, 185, 129, 0.15)' : 'transparent')};
  color: ${p => (p.$active ? '#10b981' : 'var(--text-muted)')};
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${p => (p.$active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)')};
  }
`;

// ─── Detail View (existing 3x3 grids) ──────────────────

const GridSection = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const GridCard = styled.div`
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 1.05rem;
  color: var(--text-bright);
`;

const SmallGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 8px;
`;

const GridCell = styled.div<{ $highlight?: boolean; $completed?: boolean }>`
  border: 1px solid ${p => (p.$highlight ? 'rgba(16, 185, 129, 0.45)' : 'var(--border-subtle)')};
  background: ${p => {
    if (p.$completed) return 'rgba(16, 185, 129, 0.08)';
    if (p.$highlight) return 'rgba(16, 185, 129, 0.12)';
    return 'rgba(255, 255, 255, 0.02)';
  }};
  border-radius: 10px;
  padding: 8px;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: border-color 0.15s, background 0.15s;
`;

const CellInput = styled.textarea`
  width: 100%;
  height: 100%;
  border: none;
  resize: none;
  outline: none;
  background: transparent;
  font-size: 0.85rem;
  text-align: center;
  color: var(--text-main);
  &::placeholder { color: var(--text-dim); }
`;

const TaskCellInput = styled.textarea`
  width: 100%;
  height: 100%;
  border: none;
  resize: none;
  outline: none;
  background: transparent;
  font-size: 0.8rem;
  text-align: center;
  color: var(--text-muted);
  &::placeholder { color: var(--text-dim); }
`;

const CellCheckbox = styled.input.attrs({ type: 'checkbox' })`
  position: absolute;
  top: 4px;
  left: 4px;
  width: 14px;
  height: 14px;
  accent-color: #10b981;
  cursor: pointer;
  opacity: 0.7;
  &:hover { opacity: 1; }
`;

const AiCellButton = styled.button`
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.5);
  color: #10b981;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  cursor: pointer;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, background 0.15s;

  &:hover {
    transform: scale(1.15);
    background: rgba(16, 185, 129, 0.35);
  }
`;

// ─── Overview (9x9 full grid) ───────────────────────────

const OverviewContainer = styled.div`
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 20px;
  overflow-x: auto;
`;

const FullGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(9, minmax(64px, 1fr));
  grid-template-rows: repeat(9, minmax(48px, auto));
  gap: 2px;
`;

const FullGridCell = styled.div<{ isCenter?: boolean; isSubGoal?: boolean; isCompleted?: boolean }>`
  padding: 6px 4px;
  font-size: 0.7rem;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  border-radius: 6px;
  position: relative;
  cursor: default;
  word-break: keep-all;
  line-height: 1.3;
  transition: background 0.15s, border-color 0.15s;

  ${p => {
    if (p.isCenter) return css`
      background: rgba(16, 185, 129, 0.2);
      border: 2px solid rgba(16, 185, 129, 0.6);
      color: var(--text-bright);
      font-weight: 700;
      font-size: 0.75rem;
    `;
    if (p.isSubGoal) return css`
      background: rgba(99, 102, 241, 0.12);
      border: 1.5px solid rgba(99, 102, 241, 0.35);
      color: #a5b4fc;
      font-weight: 600;
    `;
    if (p.isCompleted) return css`
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: var(--text-muted);
      text-decoration: line-through;
      opacity: 0.8;
    `;
    return css`
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
    `;
  }}
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 1rem;
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
`;

// ─── Constants ──────────────────────────────────────────

const SUBGOAL_POSITIONS = [0, 1, 2, 3, 5, 6, 7, 8];
const TASK_POSITIONS = [0, 1, 2, 3, 5, 6, 7, 8];

type ViewMode = 'detail' | 'overview';

// ─── Helpers ────────────────────────────────────────────

const createSubGoal = (index: number): MandalartSubGoal => ({
  id: `sub-${index}`,
  title: '',
  tasks: Array.from({ length: 8 }, () => createEmptyTask()),
});

const createEmptyBoard = (userId: string): MandalartBoardInput => ({
  userId,
  title: '새 만다라트',
  description: '',
  template: 'custom',
  mainGoal: '',
  subGoals: Array.from({ length: 8 }, (_, i) => createSubGoal(i)),
});

function getTaskText(task: MandalartTaskItem): string {
  return task.text;
}

function isTaskCompleted(task: MandalartTaskItem): boolean {
  return task.completed;
}

function computeProgress(subGoals: MandalartSubGoal[]): { completed: number; total: number; percent: number } {
  let completed = 0;
  let total = 0;
  for (const sg of subGoals) {
    for (const task of sg.tasks) {
      if (getTaskText(task)) {
        total++;
        if (isTaskCompleted(task)) completed++;
      }
    }
  }
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

// Build the 9x9 overview grid data
interface OverviewCell {
  row: number;
  col: number;
  type: 'center' | 'subgoal' | 'task' | 'subgoal-center';
  text: string;
  subGoalIndex?: number;
  taskIndex?: number;
  completed?: boolean;
}

function buildOverviewGrid(mainGoal: string, subGoals: MandalartSubGoal[]): OverviewCell[] {
  const cells: OverviewCell[] = [];
  const sgMapping = [0, 1, 2, 3, -1, 4, 5, 6, 7];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      // Center block (rows 3-5, cols 3-5)
      if (r >= 3 && r <= 5 && c >= 3 && c <= 5) {
        const lr = r - 3;
        const lc = c - 3;
        const localIdx = lr * 3 + lc;
        if (localIdx === 4) {
          cells.push({ row: r, col: c, type: 'center', text: mainGoal });
        } else {
          const sgIdx = SUBGOAL_POSITIONS.indexOf(localIdx);
          cells.push({
            row: r, col: c, type: 'subgoal', text: subGoals[sgIdx]?.title || '',
            subGoalIndex: sgIdx,
          });
        }
      } else {
        const blockRow = Math.floor(r / 3);
        const blockCol = Math.floor(c / 3);
        const blockIdx = blockRow * 3 + blockCol;
        const sgIdx = sgMapping[blockIdx];

        if (sgIdx === -1) continue;

        const lr = r - blockRow * 3;
        const lc = c - blockCol * 3;
        const localIdx = lr * 3 + lc;

        if (localIdx === 4) {
          cells.push({
            row: r, col: c, type: 'subgoal-center', text: subGoals[sgIdx]?.title || '',
            subGoalIndex: sgIdx,
          });
        } else {
          const taskIdx = TASK_POSITIONS.indexOf(localIdx);
          const task = subGoals[sgIdx]?.tasks[taskIdx];
          cells.push({
            row: r, col: c, type: 'task', text: task ? getTaskText(task) : '',
            subGoalIndex: sgIdx, taskIndex: taskIdx,
            completed: task ? isTaskCompleted(task) : false,
          });
        }
      }
    }
  }

  return cells;
}

// ─── Component ──────────────────────────────────────────

export const MandalartApp: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const [boards, setBoards] = useState<MandalartBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [draftBoard, setDraftBoard] = useState<MandalartBoard | null>(null);
  const [activeSubGoalIndex, setActiveSubGoalIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saved'>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('detail');

  const selectedBoard = useMemo(
    () => boards.find(b => b.id === selectedBoardId) || null,
    [boards, selectedBoardId],
  );

  const progress = useMemo(
    () => draftBoard ? computeProgress(draftBoard.subGoals) : { completed: 0, total: 0, percent: 0 },
    [draftBoard],
  );

  // Firestore subscription
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'mandalartBoards'),
      where('userId', '==', currentUser.uid),
      orderBy('updatedAt', 'desc'),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const nextBoards: MandalartBoard[] = [];
      snapshot.forEach(docSnap => {
        const parsed = MandalartBoardSchema.safeParse({ id: docSnap.id, ...docSnap.data() });
        if (parsed.success) nextBoards.push(parsed.data);
      });
      setBoards(nextBoards);
    });
    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    if (!selectedBoardId && boards.length > 0) setSelectedBoardId(boards[0].id);
  }, [boards, selectedBoardId]);

  useEffect(() => {
    if (selectedBoard) {
      setDraftBoard(selectedBoard);
      setActiveSubGoalIndex(0);
      setSaveState('idle');
    }
  }, [selectedBoard]);

  // Draft helpers
  const updateDraft = useCallback(
    (updater: (prev: MandalartBoard) => MandalartBoard) => {
      setDraftBoard(prev => {
        if (!prev) return prev;
        setSaveState('dirty');
        return updater(prev);
      });
    },
    [],
  );

  // Board CRUD
  const handleCreateBoard = useCallback(async () => {
    if (!currentUser) return;
    const board = createEmptyBoard(currentUser.uid);
    const docRef = await addDoc(collection(db, 'mandalartBoards'), {
      ...board,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    setSelectedBoardId(docRef.id);
  }, [currentUser]);

  const handleDeleteBoard = useCallback(async () => {
    if (!selectedBoardId) return;
    if (!window.confirm('선택한 만다라트를 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'mandalartBoards', selectedBoardId));
    setSelectedBoardId(null);
    setDraftBoard(null);
  }, [selectedBoardId]);

  const handleSave = useCallback(async () => {
    if (!draftBoard || !currentUser) return;
    setIsSaving(true);
    try {
      const payload: MandalartBoardInput = {
        userId: currentUser.uid,
        title: draftBoard.title,
        description: draftBoard.description,
        template: draftBoard.template,
        mainGoal: draftBoard.mainGoal,
        subGoals: draftBoard.subGoals,
      };
      await updateDoc(doc(db, 'mandalartBoards', draftBoard.id), {
        ...payload,
        updatedAt: Timestamp.now(),
      });
      setSaveState('saved');
      toast.success('저장 완료');
    } catch (e) {
      toast.error('저장 실패');
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  }, [currentUser, draftBoard]);

  // Field changes
  const handleSubGoalTitleChange = useCallback(
    (index: number, value: string) => {
      updateDraft(prev => {
        const next = [...prev.subGoals];
        next[index] = { ...next[index], title: value };
        return { ...prev, subGoals: next };
      });
    },
    [updateDraft],
  );

  const handleTaskTextChange = useCallback(
    (sgIndex: number, taskIndex: number, value: string) => {
      updateDraft(prev => {
        const nextSGs = [...prev.subGoals];
        const nextTasks = [...nextSGs[sgIndex].tasks];
        nextTasks[taskIndex] = { ...nextTasks[taskIndex], text: value };
        nextSGs[sgIndex] = { ...nextSGs[sgIndex], tasks: nextTasks };
        return { ...prev, subGoals: nextSGs };
      });
    },
    [updateDraft],
  );

  const handleTaskToggle = useCallback(
    (sgIndex: number, taskIndex: number) => {
      updateDraft(prev => {
        const nextSGs = [...prev.subGoals];
        const nextTasks = [...nextSGs[sgIndex].tasks];
        nextTasks[taskIndex] = { ...nextTasks[taskIndex], completed: !nextTasks[taskIndex].completed };
        nextSGs[sgIndex] = { ...nextSGs[sgIndex], tasks: nextTasks };
        return { ...prev, subGoals: nextSGs };
      });
    },
    [updateDraft],
  );

  // AI Generation: Full (sub-goals + all tasks)
  const handleFullGenerate = useCallback(async () => {
    if (!draftBoard || !draftBoard.mainGoal.trim()) {
      toast.error('메인 목표를 먼저 입력하세요.');
      return;
    }
    if (!window.confirm(`'${draftBoard.mainGoal}'에 대한 8개 서브목표 + 64개 실행계획을 AI로 자동 생성합니까?\n(기존 내용이 덮어씌워집니다)`)) return;

    setIsGenerating(true);
    const loadingToast = toast.loading('AI가 전체 만다라트를 생성 중...');
    try {
      const res = await fetch('/api/generate-mandalart', {
        method: 'POST',
        headers: await buildJsonAuthHeaders(currentUser),
        body: JSON.stringify({ goal: draftBoard.mainGoal, mode: 'full' }),
      });
      if (!res.ok) throw new Error('AI 요청 실패');
      const data = await res.json();

      if (data.subGoals && Array.isArray(data.subGoals) && data.subGoals[0]?.title) {
        updateDraft(prev => {
          const nextSGs = prev.subGoals.map((sg, idx) => {
            const aiSG = data.subGoals[idx];
            if (!aiSG) return sg;
            return {
              ...sg,
              title: aiSG.title,
              tasks: (aiSG.tasks as string[]).map((t: string) => ({ text: t, completed: false })),
            };
          });
          return { ...prev, subGoals: nextSGs };
        });
        toast.success('전체 만다라트가 생성되었습니다!', { id: loadingToast });
      } else {
        throw new Error('응답 형식 오류');
      }
    } catch (e) {
      toast.error('생성 실패: 다시 시도해주세요.', { id: loadingToast });
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  }, [currentUser, draftBoard, updateDraft]);

  // AI Generation: Sub-goals only
  const handleGenerateSubGoals = useCallback(async () => {
    if (!draftBoard || !draftBoard.mainGoal.trim()) return;
    if (!window.confirm(`'${draftBoard.mainGoal}'를 위한 8개 서브 목표를 자동 생성할까요?`)) return;

    const loadingToast = toast.loading('AI가 서브 목표를 생성 중...');
    try {
      const res = await fetch('/api/generate-mandalart', {
        method: 'POST',
        headers: await buildJsonAuthHeaders(currentUser),
        body: JSON.stringify({ goal: draftBoard.mainGoal, mode: 'subgoals' }),
      });
      if (!res.ok) throw new Error('AI 요청 실패');
      const data = await res.json();

      if (data.subGoals && Array.isArray(data.subGoals)) {
        updateDraft(prev => {
          const nextSGs = prev.subGoals.map((sg, idx) => ({
            ...sg,
            title: (typeof data.subGoals[idx] === 'string' ? data.subGoals[idx] : data.subGoals[idx]?.title) || sg.title,
          }));
          return { ...prev, subGoals: nextSGs };
        });
        toast.success('8가지 서브 목표가 생성되었습니다!', { id: loadingToast });
      }
    } catch (e) {
      toast.error('생성 실패: 다시 시도해주세요.', { id: loadingToast });
      console.error(e);
    }
  }, [currentUser, draftBoard, updateDraft]);

  // AI Generation: Tasks for one sub-goal
  const handleGenerateTasksForSubGoal = useCallback(async (sgIndex: number) => {
    if (!draftBoard) return;
    const sg = draftBoard.subGoals[sgIndex];
    if (!sg.title.trim()) {
      toast.error('서브 목표 제목을 먼저 입력하세요.');
      return;
    }

    setIsGeneratingTasks(sgIndex);
    const loadingToast = toast.loading(`'${sg.title}' 실행계획 생성 중...`);
    try {
      const res = await fetch('/api/generate-mandalart', {
        method: 'POST',
        headers: await buildJsonAuthHeaders(currentUser),
        body: JSON.stringify({
          goal: `${draftBoard.mainGoal} > ${sg.title}`,
          mode: 'full',
        }),
      });
      if (!res.ok) throw new Error('AI 요청 실패');
      const data = await res.json();

      if (data.subGoals?.[0]?.tasks) {
        const aiTasks = data.subGoals[0].tasks as string[];
        updateDraft(prev => {
          const nextSGs = [...prev.subGoals];
          nextSGs[sgIndex] = {
            ...nextSGs[sgIndex],
            tasks: aiTasks.slice(0, 8).map(t => ({ text: t, completed: false })),
          };
          return { ...prev, subGoals: nextSGs };
        });
        toast.success('실행계획이 생성되었습니다!', { id: loadingToast });
      } else {
        throw new Error('응답 형식 오류');
      }
    } catch (e) {
      toast.error('생성 실패: 다시 시도해주세요.', { id: loadingToast });
      console.error(e);
    } finally {
      setIsGeneratingTasks(null);
    }
  }, [currentUser, draftBoard, updateDraft]);

  const saveStatusText = useMemo(() => {
    if (saveState === 'saved') return '저장 완료';
    if (saveState === 'dirty') return '저장되지 않은 변경사항';
    return '';
  }, [saveState]);

  // ─── Render ─────────────────────────────────────────

  if (loading) return <EmptyState>로딩 중...</EmptyState>;
  if (!currentUser) return <EmptyState>로그인 후 만다라트 보드를 사용할 수 있습니다.</EmptyState>;

  if (!draftBoard) {
    return (
      <PageContainer>
        <SidebarWrap>
          <SidebarHeader>
            <SidebarTitle>만다라트 보드</SidebarTitle>
            <AddBoardButton onClick={handleCreateBoard}>
              <i className="fa-solid fa-plus" /> 새 보드
            </AddBoardButton>
          </SidebarHeader>
          <BoardList />
        </SidebarWrap>
        <Content>
          <EmptyState>새 보드를 만들어 만다라트를 시작하세요.</EmptyState>
        </Content>
      </PageContainer>
    );
  }

  const overviewCells = viewMode === 'overview' ? buildOverviewGrid(draftBoard.mainGoal, draftBoard.subGoals) : [];

  return (
    <PageContainer>
      {/* Sidebar */}
      <SidebarWrap>
        <SidebarHeader>
          <SidebarTitle>만다라트 보드</SidebarTitle>
          <AddBoardButton onClick={handleCreateBoard}>
            <i className="fa-solid fa-plus" /> 새 보드
          </AddBoardButton>
        </SidebarHeader>
        <BoardList>
          {boards.map(board => {
            const bp = computeProgress(board.subGoals);
            return (
              <BoardItem
                key={board.id}
                $active={board.id === selectedBoardId}
                onClick={() => setSelectedBoardId(board.id)}
              >
                <BoardItemTitle>{board.title}</BoardItemTitle>
                <BoardMeta>{board.mainGoal || '메인 목표를 입력하세요'}</BoardMeta>
                {bp.total > 0 && (
                  <MiniProgress>
                    <MiniProgressFill width={bp.percent} />
                  </MiniProgress>
                )}
              </BoardItem>
            );
          })}
        </BoardList>
        <BoardActions>
          <DeleteBoardButton onClick={handleDeleteBoard}>보드 삭제</DeleteBoardButton>
        </BoardActions>
      </SidebarWrap>

      {/* Content */}
      <Content>
        {/* Header */}
        <Header>
          <HeaderInfo>
            <TitleInput
              value={draftBoard.title}
              onChange={e => updateDraft(prev => ({ ...prev, title: e.target.value }))}
              placeholder="보드 제목을 입력하세요"
            />
            <DescriptionInput
              value={draftBoard.description || ''}
              onChange={e => updateDraft(prev => ({ ...prev, description: e.target.value }))}
              placeholder="보드 설명을 입력하세요"
              rows={2}
            />
            {saveStatusText && <SaveStatus>{saveStatusText}</SaveStatus>}
          </HeaderInfo>
          <HeaderActions>
            <ViewToggle>
              <ViewToggleButton $active={viewMode === 'detail'} onClick={() => setViewMode('detail')}>
                상세
              </ViewToggleButton>
              <ViewToggleButton $active={viewMode === 'overview'} onClick={() => setViewMode('overview')}>
                전체보기
              </ViewToggleButton>
            </ViewToggle>
            <ActionButton
              $variant="ai"
              disabled={isGenerating || !draftBoard.mainGoal.trim()}
              onClick={handleFullGenerate}
            >
              {isGenerating ? <Spinner /> : <i className="fa-solid fa-wand-magic-sparkles" />}
              {isGenerating ? '생성 중...' : 'AI 전체 생성'}
            </ActionButton>
            <ActionButton
              $variant="primary"
              disabled={isSaving || saveState === 'idle'}
              onClick={handleSave}
            >
              {isSaving ? '저장 중...' : '저장'}
            </ActionButton>
          </HeaderActions>
        </Header>

        {/* Progress Bar */}
        {progress.total > 0 && (
          <ProgressContainer>
            <ProgressText>{progress.completed}/{progress.total} 완료 ({progress.percent}%)</ProgressText>
            <ProgressBarTrack>
              <ProgressBarFill width={progress.percent} />
            </ProgressBarTrack>
          </ProgressContainer>
        )}

        {/* Detail View */}
        {viewMode === 'detail' && (
          <GridSection>
            {/* Left: Main Goal + Sub Goals */}
            <GridCard>
              <CardHeader>
                <CardTitle>메인 목표 / 서브 목표</CardTitle>
              </CardHeader>
              <SmallGrid>
                {Array.from({ length: 9 }, (_, cellIndex) => {
                  if (cellIndex === 4) {
                    return (
                      <GridCell key={cellIndex} $highlight>
                        <CellInput
                          value={draftBoard.mainGoal}
                          onChange={e => updateDraft(prev => ({ ...prev, mainGoal: e.target.value }))}
                          placeholder="메인 목표"
                        />
                        {draftBoard.mainGoal && (
                          <AiCellButton onClick={handleGenerateSubGoals} title="AI 서브 목표 생성">
                            <i className="fa-solid fa-wand-magic-sparkles" />
                          </AiCellButton>
                        )}
                      </GridCell>
                    );
                  }
                  const sgIdx = SUBGOAL_POSITIONS.indexOf(cellIndex);
                  return (
                    <GridCell
                      key={cellIndex}
                      $highlight={activeSubGoalIndex === sgIdx}
                      onClick={() => setActiveSubGoalIndex(sgIdx)}
                      style={{ cursor: 'pointer' }}
                    >
                      <CellInput
                        value={draftBoard.subGoals[sgIdx].title}
                        onChange={e => handleSubGoalTitleChange(sgIdx, e.target.value)}
                        placeholder={`서브 목표 ${sgIdx + 1}`}
                      />
                    </GridCell>
                  );
                })}
              </SmallGrid>
            </GridCard>

            {/* Right: Tasks for selected sub-goal */}
            <GridCard>
              <CardHeader>
                <CardTitle>
                  실행 계획: {draftBoard.subGoals[activeSubGoalIndex].title || `서브 목표 ${activeSubGoalIndex + 1}`}
                </CardTitle>
                <ActionButton
                  $variant="ai"
                  disabled={isGeneratingTasks !== null || !draftBoard.subGoals[activeSubGoalIndex].title.trim()}
                  onClick={() => handleGenerateTasksForSubGoal(activeSubGoalIndex)}
                  style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                >
                  {isGeneratingTasks === activeSubGoalIndex ? <Spinner /> : <i className="fa-solid fa-wand-magic-sparkles" />}
                  AI 실행계획
                </ActionButton>
              </CardHeader>
              <SmallGrid>
                {Array.from({ length: 9 }, (_, cellIndex) => {
                  if (cellIndex === 4) {
                    return (
                      <GridCell key={cellIndex} $highlight>
                        <CellInput
                          value={draftBoard.subGoals[activeSubGoalIndex].title}
                          onChange={e => handleSubGoalTitleChange(activeSubGoalIndex, e.target.value)}
                          placeholder="서브 목표"
                        />
                      </GridCell>
                    );
                  }
                  const taskIdx = TASK_POSITIONS.indexOf(cellIndex);
                  const task = draftBoard.subGoals[activeSubGoalIndex].tasks[taskIdx];
                  return (
                    <GridCell key={cellIndex} $completed={isTaskCompleted(task)}>
                      {getTaskText(task) && (
                        <CellCheckbox
                          checked={isTaskCompleted(task)}
                          onChange={() => handleTaskToggle(activeSubGoalIndex, taskIdx)}
                        />
                      )}
                      <TaskCellInput
                        value={getTaskText(task)}
                        onChange={e => handleTaskTextChange(activeSubGoalIndex, taskIdx, e.target.value)}
                        placeholder={`실행 ${taskIdx + 1}`}
                      />
                    </GridCell>
                  );
                })}
              </SmallGrid>
            </GridCard>
          </GridSection>
        )}

        {/* Overview View (9x9 full grid) */}
        {viewMode === 'overview' && (
          <OverviewContainer>
            <FullGrid>
              {overviewCells.map((cell, i) => (
                <FullGridCell
                  key={i}
                  isCenter={cell.type === 'center'}
                  isSubGoal={cell.type === 'subgoal' || cell.type === 'subgoal-center'}
                  isCompleted={cell.completed}
                  onClick={() => {
                    if (cell.subGoalIndex !== undefined) {
                      setActiveSubGoalIndex(cell.subGoalIndex);
                      setViewMode('detail');
                    }
                  }}
                  style={{ cursor: cell.subGoalIndex !== undefined ? 'pointer' : 'default' }}
                  title={cell.text || undefined}
                >
                  {cell.text || (cell.type === 'center' ? '메인 목표' : '')}
                </FullGridCell>
              ))}
            </FullGrid>
          </OverviewContainer>
        )}
      </Content>
    </PageContainer>
  );
};
