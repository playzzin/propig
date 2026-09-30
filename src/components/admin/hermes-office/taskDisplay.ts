import type { Task } from "./types";
import { attentionReasons } from "./dashboardEvidence";

// A completed clarify tool event is not proof that a reply is still pending.
export function awaitingReply(task?: Task): boolean {
  return task?.status === "running" && task.activity === "input_wait";
}

export const taskDisplayStatus = (task: Task) =>
  awaitingReply(task) ? "waiting_reply" : task.status;

export const needsAttention = (task: Task) =>
  attentionReasons(task).length > 0;
