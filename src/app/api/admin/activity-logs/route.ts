import { NextResponse, type NextRequest } from "next/server";
import { db as adminDb } from "@/lib/firebase-admin";
import { mapActivityLogSnapshot } from "@/lib/server/activity-log";
import {
  MAX_ACTIVITY_LOG_LIMIT,
  activityLogMatchesFilters,
  getActivityLogResultLimit,
  normalizeActivityLogParam,
  parseActivityLogFilters,
  parseActivityLogLimit,
} from "@/lib/server/activity-log-query";
import { requireAdminAuth } from "@/lib/server/admin-auth";
import type { ActivityLogRecord, ActivityLogsResponse } from "@/types/activityLog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  const limit = parseActivityLogLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = normalizeActivityLogParam(request.nextUrl.searchParams.get("cursor"));
  const filters = parseActivityLogFilters(request.nextUrl.searchParams);
  const collection = adminDb.collection("activityLogs");
  const cursorSnapshotPromise = cursor ? collection.doc(cursor).get() : Promise.resolve(null);
  const selectedSnapshotPromise = filters.selectedLogId ? collection.doc(filters.selectedLogId).get() : Promise.resolve(null);
  const [cursorSnapshot, selectedSnapshot] = await Promise.all([cursorSnapshotPromise, selectedSnapshotPromise]);
  let query: FirebaseFirestore.Query = collection.orderBy("createdAt", "desc");

  if (cursorSnapshot?.exists) {
    query = query.startAfter(cursorSnapshot);
  }

  const selectedLog = selectedSnapshot?.exists ? mapActivityLogSnapshot(selectedSnapshot) : null;
  const selectedLogMatched = selectedLog ? activityLogMatchesFilters(selectedLog, filters) : filters.selectedLogId ? false : null;
  const resultLimit = getActivityLogResultLimit(limit, Boolean(selectedLog && selectedLogMatched), Boolean(cursor));
  const logs: ActivityLogRecord[] = [];
  let scannedCount = 0;
  let nextCursor: string | null = null;
  let hasMoreRawLogs = false;
  let lastScannedSnapshot: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (logs.length < resultLimit && scannedCount < filters.scanLimit) {
    const batchLimit = Math.min(Math.max(limit * 2, 50), MAX_ACTIVITY_LOG_LIMIT, filters.scanLimit - scannedCount);
    if (batchLimit <= 0) break;

    const snapshot = await query.limit(batchLimit + 1).get();
    const docs = snapshot.docs.slice(0, batchLimit);
    let stoppedWithUnscannedDocs = false;
    hasMoreRawLogs = snapshot.docs.length > batchLimit;

    for (const [index, doc] of docs.entries()) {
      lastScannedSnapshot = doc;
      scannedCount += 1;
      const log = mapActivityLogSnapshot(doc);
      if (!activityLogMatchesFilters(log, filters)) continue;
      if (log.id !== selectedLog?.id && logs.length < resultLimit) {
        logs.push(log);
      }
      if (logs.length >= resultLimit) {
        stoppedWithUnscannedDocs = index < docs.length - 1;
        break;
      }
    }

    hasMoreRawLogs = hasMoreRawLogs || stoppedWithUnscannedDocs;
    if (!hasMoreRawLogs || !lastScannedSnapshot) break;
    query = collection.orderBy("createdAt", "desc").startAfter(lastScannedSnapshot);
  }

  if (selectedLog && selectedLogMatched && !cursor) {
    const selectedAlreadyLoaded = logs.some((log) => log.id === selectedLog.id);
    if (!selectedAlreadyLoaded) {
      logs.unshift(selectedLog);
    }
  }

  if (hasMoreRawLogs && lastScannedSnapshot) {
    nextCursor = lastScannedSnapshot.id;
  }

  return NextResponse.json<ActivityLogsResponse>({
    logs,
    nextCursor,
    matchedCount: logs.length,
    scannedCount,
    scanLimitReached: Boolean(nextCursor),
    selectedLogMatched,
  });
}
