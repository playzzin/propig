import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Action, Snapshot } from "./types";
export { fetchTaskHistory } from "./taskHistoryApi.js";

const capability = z.object({
  name: z.string(),
  kind: z.string(),
  description: z.string(),
  version: z.string(),
  status: z.string(),
  source: z.string(),
});
const taskStatus = z.enum([
  "queued",
  "running",
  "blocked",
  "review",
  "approval",
  "completed",
  "failed",
  "cancel_requested",
  "cancelled",
]);
const observation = z.object({
  status: z.enum(["unknown", "success", "failure", "running", "idle"]).default("unknown"),
  observedAt: z.string().nullable().default(null),
  source: z.string().nullable().default(null),
  evidenceRef: z.string().nullable().default(null),
  validUntil: z.string().nullable().default(null),
  reasonCode: z.string().default("evidence_missing"),
});
const deliveryEvidence = z.object({
  id: z.string(),
  stage: z.enum(["implementation", "typecheck", "test", "ui", "source-integration", "deployment"]),
  status: z.enum(["unverified", "pass", "fail", "blocked"]),
  observedAt: z.string().nullable(),
  source: z.string().nullable(),
  evidenceRef: z.string().nullable(),
  scope: z.string(),
  sourceRevision: z.string().nullable(),
  attempt: z.number().int().nonnegative(),
  artifactRef: z.string().nullable(),
});
const employee = z.object({
  observations: z.object({
    gateway: observation.optional(),
    modelCall: observation.optional(),
    telegramReceive: observation.optional(),
    telegramSend: observation.optional(),
    work: observation.optional(),
  }).optional(),
  revision: z.number().int().default(1),
  accessory: z.enum(["none", "glasses", "headset", "tie"]).default("none"),
  joinedAt: z.string().default(""),
  runtime: z
    .object({ status: z.string(), lastSeen: z.string(), summary: z.string() })
    .optional(),
  id: z.string(),
  botId: z.string(),
  name: z.string(),
  username: z.string(),
  avatar: z.string(),
  character: z.string(),
  color: z.string(),
  departmentId: z.string(),
  title: z.string(),
  managerId: z.string(),
  hostId: z.string(),
  profile: z.string(),
  model: z.string(),
  status: z.string(),
  seat: z.number().int().min(0).max(99),
  lastSeen: z.string(),
  createdAt: z.string(),
  capabilities: z.array(capability),
  instructions: z.array(capability),
});
const task = z.object({
  deliveryEvidence: z.array(deliveryEvidence).default([]),
  dependencyStale: z.boolean().default(false),
  dependencySnapshots: z
    .array(
      z.object({
        taskId: z.string(),
        revision: z.number(),
        attempt: z.number(),
        result: z.string(),
        at: z.string(),
        consumedByAttempt: z.number(),
        stale: z.boolean(),
        staleAt: z.string().optional(),
      }),
    )
    .default([]),
  planningWorkflowId: z.string().default(""),
  resultVersions: z
    .array(
      z.object({
        result: z.string(),
        at: z.string(),
        attempt: z.number(),
        usage: z.object({
          inputTokens: z.number().nullable(),
          outputTokens: z.number().nullable(),
          costUsd: z.number().nullable(),
        }),
      }),
    )
    .default([]),
  workflowId: z.string().default(""),
  stage: z.string().default(""),
  activity: z.string().default(""),
  dependencyPolicy: z.string().default("completed"),
  startedAt: z.string().default(""),
  finishedAt: z.string().default(""),
  attempts: z.number().default(0),
  reworkCount: z.number().default(0),
  qualityScore: z.number().nullable().default(null),
  reviewNote: z.string().default(""),
  telemetrySource: z.string().default(""),
  usage: z
    .object({
      inputTokens: z.number().nullable(),
      outputTokens: z.number().nullable(),
      costUsd: z.number().nullable(),
    })
    .default({ inputTokens: 0, outputTokens: 0, costUsd: null }),
  id: z.string(),
  title: z.string(),
  request: z.string(),
  employeeId: z.string(),
  projectId: z.string(),
  status: taskStatus,
  criteria: z.string(),
  summary: z.string(),
  nextAction: z.string(),
  result: z.string(),
  dependencies: z.array(z.string()),
  participants: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  dueAt: z.string(),
  revision: z.number().int(),
  source: z.string(),
});
const snapshotSchema = z.object({
  generatedAt: z.string().optional(),
  workflows: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        sourceTaskId: z.string().default(""),
        goal: z.string(),
        kind: z.enum(["project", "meeting"]),
        status: z.string(),
        projectId: z.string(),
        createdAt: z.string(),
        revision: z.number(),
        steps: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            request: z.string(),
            employeeId: z.string(),
            criteria: z.string(),
            dependencies: z.array(z.string()),
            taskId: z.string(),
            stage: z.string(),
          }),
        ),
      }),
    )
    .default([]),
  training: z
    .array(
      z.object({
        id: z.string(),
        recordId: z.string(),
        employeeId: z.string(),
        content: z.string(),
        evidence: z.string(),
        status: z.enum(["active", "rolled_back"]),
        createdAt: z.string(),
        rolledBackAt: z.string(),
        version: z.number(),
      }),
    )
    .default([]),
  rooms: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.enum(["work", "meeting", "training", "lounge", "awards"]),
        floor: z.number(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
    )
    .default([]),
  revision: z.number().int(),
  employees: z.array(employee),
  departments: z.array(
    z.object({ id: z.string(), name: z.string(), description: z.string() }),
  ),
  hosts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lastSeen: z.string(),
      status: z.string(),
    }),
  ),
  tasks: z.array(task),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      goal: z.string(),
      ownerId: z.string(),
      createdAt: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      employeeId: z.string(),
      taskId: z.string(),
      summary: z.string(),
      at: z.string(),
    }),
  ),
  records: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["award", "feedback", "education", "knowledge", "meeting"]),
      title: z.string(),
      employeeId: z.string(),
      taskId: z.string(),
      content: z.string(),
      status: z.string(),
      evidence: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      revision: z.number().int(),
    }),
  ),
  settings: z.object({
    autoDiscover: z.boolean().default(true),
    discoveryIntervalMinutes: z.number().default(10),
    dispatchPaused: z.boolean().default(true),
    dailyRunLimit: z.number().default(20),
    taskTimeoutMinutes: z.number().default(20),
    companyName: z.string(),
    maxConcurrent: z.number(),
    maxEmployees: z.number(),
  }),
});
async function request(path: string, action?: Action): Promise<unknown> {
  const response = await fetch(
    path,
    action
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        }
      : { cache: "no-store" },
  );
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(data);
    throw new Error(
      parsed.success
        ? parsed.data.error
        : "연결하지 못했습니다. 다시 시도하세요.",
    );
  }
  return data;
}
export async function discover() {
  return z
    .object({ found: z.number(), warnings: z.array(z.string()) })
    .parse(await request("/api/discover", { type: "discover" }));
}
export function useOffice() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const update = useCallback((data: unknown) => {
    const parsed: Snapshot = snapshotSchema.parse(data);
    if (mounted.current)
      setState((previous) =>
        !previous || parsed.revision >= previous.revision ? parsed : previous,
      );
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      update(await request("/api/state"));
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "상태를 불러오지 못했습니다.",
        );
    } finally {
      pending.current = false;
    }
  }, [update]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const stream = new EventSource("/api/stream");
    stream.onopen = () => {
      setConnected(true);
    };
    stream.onerror = () => {
      setConnected(false);
    };
    stream.addEventListener("revision", () => {
      void refresh();
    });
    const retry = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      mounted.current = false;
      stream.close();
      window.clearInterval(retry);
    };
  }, [refresh]);
  const act = useCallback(
    async (action: Action) => {
      if (busy) return false;
      setBusy(true);
      setError("");
      try {
        update(await request("/api/action", action));
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "저장하지 못했습니다.",
        );
        await refresh();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh, update],
  );
  return { state, error, busy, connected, act, refresh };
}
