import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeActivityLog } from "@/lib/server/activity-log";
import { requireUserAuth } from "@/lib/server/user-auth";

export const dynamic = "force-dynamic";

const ActivityLogTargetSchema = z.object({
  type: z.string().min(1).max(80),
  id: z.string().max(240).optional().nullable(),
  path: z.string().max(500).optional().nullable(),
  label: z.string().max(240).optional().nullable(),
});

const ActivityLogSchema = z.object({
  action: z.string().min(1).max(120),
  target: ActivityLogTargetSchema,
  summary: z.string().max(700).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  route: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const authResult = await requireUserAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  const payload = ActivityLogSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ ok: false, error: "Invalid activity log payload." }, { status: 400 });
  }

  const id = await writeActivityLog({
    auth: {
      uid: authResult.uid,
      email: authResult.email,
    },
    request,
    action: payload.data.action,
    target: payload.data.target,
    summary: payload.data.summary,
    metadata: payload.data.metadata,
    route: payload.data.route,
  });

  return NextResponse.json({ ok: true, id });
}
