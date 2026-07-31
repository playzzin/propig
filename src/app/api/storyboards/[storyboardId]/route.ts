import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import admin, { db } from "@/lib/firebase-admin";
import { requireUserAuth } from "@/lib/server/user-auth";
import {
  VIDEO_STUDIO_CLIPS_COLLECTION,
  VIDEO_STUDIO_JOBS_COLLECTION,
  VIDEO_STUDIO_PROJECTS_COLLECTION,
} from "@/lib/video-studio";

export const runtime = "nodejs";

const StoryboardIdSchema = z.string().trim().min(1).max(240);
const ACTIVE_JOB_STATUSES = new Set(["queued", "running", "uploading"]);
const FIRESTORE_BATCH_SIZE = 400;

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
