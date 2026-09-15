import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import admin, { db } from "@/lib/firebase-admin";
import { requireUserAuth } from "@/lib/server/user-auth";
import {
  VIDEO_STUDIO_CLIPS_COLLECTION,
  VIDEO_STUDIO_JOBS_COLLECTION,
  VIDEO_STUDIO_PROJECTS_COLLECTION,
} from "@/lib/video-studio";

export const runtime = "nodejs";

const StoryboardIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !value.includes("/") && value !== "." && value !== "..");
const ACTIVE_JOB_STATUSES = new Set(["queued", "running", "uploading"]);
const FIRESTORE_BATCH_SIZE = 400;
const AI_GENERATIONS_COLLECTION = "ai_generations";
const CLEANUP_CANDIDATES_COLLECTION = "storyboardArtifactCleanupCandidates";

type StoryboardGenerationLink = {
  generationId: string;
  sceneId: string;
};

function isSafeFirestoreDocumentId(value: string): boolean {
  return value.length > 0 && value.length <= 240 && !value.includes("/") && value !== "." && value !== "..";
}

function cleanupCandidateId(storyboardId: string, generationId: string): string {
  return createHash("sha256")
    .update(`${storyboardId}\0${generationId}`)
    .digest("hex");
}

function collectStoryboardGenerationLinks(
  storyboard: Record<string, unknown>,
): StoryboardGenerationLink[] {
  if (!Array.isArray(storyboard.scenes)) return [];
  return storyboard.scenes.flatMap((rawScene) => {
    if (!rawScene || typeof rawScene !== "object") return [];
    const scene = rawScene as Record<string, unknown>;
    const generatedImage =
      scene.generatedImage && typeof scene.generatedImage === "object"
        ? (scene.generatedImage as Record<string, unknown>)
        : null;
    const generationId =
      typeof generatedImage?.id === "string" ? generatedImage.id.trim() : "";
    const sceneId = typeof scene.id === "string" ? scene.id.trim() : "";
    return isSafeFirestoreDocumentId(generationId) && isSafeFirestoreDocumentId(sceneId)
      ? [{ generationId, sceneId }]
      : [];
  });
}

async function recordGenerationCleanupCandidates(params: {
  userId: string;
  storyboardId: string;
  storyboard: Record<string, unknown>;
}): Promise<{ deferred: number; untracked: number }> {
  const links = collectStoryboardGenerationLinks(params.storyboard);
  const uniqueLinks = new Map<string, Set<string>>();
  links.forEach(({ generationId, sceneId }) => {
    const sceneIds = uniqueLinks.get(generationId) ?? new Set<string>();
    sceneIds.add(sceneId);
    uniqueLinks.set(generationId, sceneIds);
  });
  if (!uniqueLinks.size) return { deferred: 0, untracked: 0 };

  const entries = [...uniqueLinks.entries()];
  const historySnapshots = await db.getAll(
    ...entries.map(([generationId]) =>
      db.collection(AI_GENERATIONS_COLLECTION).doc(generationId),
    ),
  );
  const batch = db.batch();
  let deferred = 0;

  historySnapshots.forEach((snapshot, index) => {
    if (!snapshot.exists) return;
    const history = snapshot.data() || {};
    const provenance =
      history.artifactProvenance && typeof history.artifactProvenance === "object"
        ? (history.artifactProvenance as Record<string, unknown>)
        : {};
    const storagePath =
      typeof history.storagePath === "string" ? history.storagePath.trim() : "";
    if (
      history.userId !== params.userId ||
      provenance.kind !== "storyboard-scene" ||
      provenance.storyboardId !== params.storyboardId ||
      !storagePath.startsWith(`ai_generations/${params.userId}/`) ||
      storagePath.includes("..")
    ) {
      return;
    }

    const [generationId, sceneIds] = entries[index];
    const candidateRef = db
      .collection("users")
      .doc(params.userId)
      .collection(CLEANUP_CANDIDATES_COLLECTION)
      .doc(cleanupCandidateId(params.storyboardId, generationId));
    batch.set(
      candidateRef,
      {
        userId: params.userId,
        storyboardId: params.storyboardId,
        generationHistoryId: generationId,
        sceneIds: [...sceneIds],
        storagePath,
        status: "reference_audit_required",
        automaticDeletionAllowed: false,
        reason:
          "AI generation URLs may be reused by albums or site branding, so deletion is deferred until a complete reference audit is available.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    deferred += 1;
  });

  if (deferred) await batch.commit();
  return { deferred, untracked: uniqueLinks.size - deferred };
}

async function deleteDocuments(
  documents: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<void> {
  for (
    let offset = 0;
    offset < documents.length;
    offset += FIRESTORE_BATCH_SIZE
  ) {
    const batch = db.batch();
    documents
      .slice(offset, offset + FIRESTORE_BATCH_SIZE)
      .forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ storyboardId: string }> },
) {
  const auth = await requireUserAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.message },
      { status: auth.status },
    );
  }

  const parsedId = StoryboardIdSchema.safeParse(
    (await context.params).storyboardId,
  );
  if (!parsedId.success) {
    return NextResponse.json(
      { success: false, error: "삭제할 프로젝트를 확인하지 못했습니다." },
      { status: 400 },
    );
  }

  const storyboardId = parsedId.data;
  const storyboardRef = db
    .collection("users")
    .doc(auth.uid)
    .collection("imageStoryboards")
    .doc(storyboardId);

  try {
    const storyboardSnapshot = await storyboardRef.get();
    if (!storyboardSnapshot.exists) {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }

    const storyboard = storyboardSnapshot.data() || {};
    const videoProduction =
      storyboard.videoProduction &&
      typeof storyboard.videoProduction === "object"
        ? (storyboard.videoProduction as Record<string, unknown>)
        : {};
    const projectId =
      typeof videoProduction.projectId === "string"
        ? videoProduction.projectId
        : null;

    await storyboardRef.set(
      {
        cleanupStatus: "pending",
        cleanupErrorMessage: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    let clipDocuments: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let jobDocuments: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let projectRef: FirebaseFirestore.DocumentReference | null = null;

    if (projectId) {
      projectRef = db.collection(VIDEO_STUDIO_PROJECTS_COLLECTION).doc(projectId);
      const [projectSnapshot, clipsSnapshot, jobsSnapshot] = await Promise.all([
        projectRef.get(),
        db
          .collection(VIDEO_STUDIO_CLIPS_COLLECTION)
          .where("projectId", "==", projectId)
          .get(),
        db
          .collection(VIDEO_STUDIO_JOBS_COLLECTION)
          .where("projectId", "==", projectId)
          .get(),
      ]);
      if (
        projectSnapshot.exists &&
        projectSnapshot.data()?.userId !== auth.uid
      ) {
        return NextResponse.json(
          { success: false, error: "영상 프로젝트 소유권을 확인하지 못했습니다." },
          { status: 403 },
        );
      }
      clipDocuments = clipsSnapshot.docs.filter(
        (document) => document.data().userId === auth.uid,
      );
      jobDocuments = jobsSnapshot.docs.filter(
        (document) => document.data().userId === auth.uid,
      );

      const cancellationBatch = db.batch();
      let hasCancellation = false;
      jobDocuments.forEach((document) => {
        if (!ACTIVE_JOB_STATUSES.has(String(document.data().status || ""))) {
          return;
        }
        hasCancellation = true;
        cancellationBatch.set(
          document.ref,
          {
            status: "canceled",
            message: "프로젝트 삭제로 작업이 취소되었습니다.",
            errorMessage: "프로젝트 삭제로 작업이 취소되었습니다.",
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
      if (hasCancellation) await cancellationBatch.commit();
    }

    const generationCleanup = await recordGenerationCleanupCandidates({
      userId: auth.uid,
      storyboardId,
      storyboard,
    });

    const bucket = admin.storage().bucket();
    const storagePrefixes = [
      `users/${auth.uid}/storyboards/${storyboardId}/`,
      ...(projectId ? [`video_studio/${auth.uid}/${projectId}/`] : []),
    ];
    await Promise.all(
      storagePrefixes.map((prefix) =>
        bucket.deleteFiles({ prefix, force: true }),
      ),
    );

    await Promise.all([
      deleteDocuments(clipDocuments),
      deleteDocuments(jobDocuments),
    ]);
    if (projectRef) await projectRef.delete();
    await db.recursiveDelete(storyboardRef);

    return NextResponse.json({
      success: true,
      deleted: {
        clips: clipDocuments.length,
        jobs: jobDocuments.length,
        storagePrefixes,
        deferredGenerationAssets: generationCleanup.deferred,
        untrackedGenerationAssets: generationCleanup.untracked,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "프로젝트 정리에 실패했습니다.";
    await storyboardRef
      .set(
        {
          cleanupStatus: "retry",
          cleanupErrorMessage: message.slice(0, 1200),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      .catch(() => undefined);
    console.error("[Storyboard Delete] cascade failed:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          "프로젝트 파일 정리를 완료하지 못했습니다. 프로젝트 목록에서 다시 삭제해 주세요.",
      },
      { status: 500 },
    );
  }
}
