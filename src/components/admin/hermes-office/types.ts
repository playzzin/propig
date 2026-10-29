export type TaskStatus =
  | "queued"
  | "running"
  | "blocked"
  | "review"
  | "approval"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled";
export interface Capability {
  name: string;
  kind: string;
  description: string;
  version: string;
  status: string;
  source: string;
}
export type ObservationChannel =
  | "gateway"
  | "modelCall"
  | "telegramReceive"
  | "telegramSend"
  | "work";
export interface Observation {
  status: "unknown" | "success" | "failure" | "running" | "idle";
  observedAt: string | null;
  source: string | null;
  evidenceRef: string | null;
  validUntil: string | null;
  reasonCode: string;
}
export interface DeliveryEvidence {
  id: string;
  stage: "implementation" | "typecheck" | "test" | "ui" | "source-integration" | "deployment";
  status: "unverified" | "pass" | "fail" | "blocked";
  observedAt: string | null;
  source: string | null;
  evidenceRef: string | null;
  scope: string;
  sourceRevision: string | null;
  attempt: number;
  artifactRef: string | null;
}
export interface Employee {
  observations?: Partial<Record<ObservationChannel, Observation>>;
  revision?: number;
  accessory?: "none" | "glasses" | "headset" | "tie";
  joinedAt?: string;
  runtime?: { status: string; lastSeen: string; summary: string };
  id: string;
  botId: string;
  name: string;
  username: string;
  avatar: string;
  character: string;
  color: string;
  departmentId: string;
  title: string;
  managerId: string;
  hostId: string;
  profile: string;
  model: string;
  status: string;
  seat: number;
  lastSeen: string;
  createdAt: string;
  capabilities: Capability[];
  instructions: Capability[];
}
export interface Department {
  id: string;
  name: string;
  description: string;
}
export interface Host {
  id: string;
  name: string;
  lastSeen: string;
  status: string;
}
export interface Task {
  deliveryEvidence?: DeliveryEvidence[];
  dependencyStale?: boolean;
  dependencySnapshots?: {
    taskId: string;
    revision: number;
    attempt: number;
    result: string;
    at: string;
    consumedByAttempt: number;
    stale: boolean;
    staleAt?: string;
  }[];
  planningWorkflowId?: string;
  resultVersions?: {
    result: string;
    at: string;
    attempt: number;
    usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      costUsd: number | null;
    };
  }[];
  workflowId?: string;
  stage?: string;
  activity?: string;
  dependencyPolicy?: string;
  startedAt?: string;
  finishedAt?: string;
  attempts?: number;
  reworkCount?: number;
  qualityScore?: number | null;
  reviewNote?: string;
  telemetrySource?: string;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
  };
  id: string;
  title: string;
  request: string;
  employeeId: string;
  projectId: string;
  status: TaskStatus;
  criteria: string;
  summary: string;
  nextAction: string;
  result: string;
  dependencies: string[];
  participants: string[];
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  revision: number;
  source: string;
}
export interface Project {
  id: string;
  name: string;
  goal: string;
  ownerId: string;
  createdAt: string;
}
export interface OfficeEvent {
  id: string;
  kind: string;
  employeeId: string;
  taskId: string;
  summary: string;
  at: string;
}
export interface CompanyRecord {
  id: string;
  kind: "award" | "feedback" | "education" | "knowledge" | "meeting";
  title: string;
  employeeId: string;
  taskId: string;
  content: string;
  status: string;
  evidence: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export interface WorkflowStep {
  id: string;
  title: string;
  request: string;
  employeeId: string;
  criteria: string;
  dependencies: string[];
  taskId: string;
  stage: string;
}
export interface Workflow {
  sourceTaskId?: string;
  id: string;
  name: string;
  goal: string;
  kind: "project" | "meeting";
  status: string;
  projectId: string;
  createdAt: string;
  revision: number;
  steps: WorkflowStep[];
}
export interface Training {
  id: string;
  recordId: string;
  employeeId: string;
  content: string;
  evidence: string;
  status: "active" | "rolled_back";
  createdAt: string;
  rolledBackAt: string;
  version: number;
}
export interface OfficeRoom {
  id: string;
  name: string;
  kind: "work" | "meeting" | "training" | "lounge" | "awards";
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Snapshot {
  /** Response generation time, never an observation timestamp. */
  generatedAt?: string;
  workflows: Workflow[];
  training: Training[];
  rooms: OfficeRoom[];
  revision: number;
  employees: Employee[];
  departments: Department[];
  hosts: Host[];
  tasks: Task[];
  projects: Project[];
  events: OfficeEvent[];
  records: CompanyRecord[];
  settings: {
    autoDiscover: boolean;
    discoveryIntervalMinutes: number;
    dispatchPaused: boolean;
    dailyRunLimit: number;
    taskTimeoutMinutes: number;
    companyName: string;
    maxConcurrent: number;
    maxEmployees: number;
  };
}
export type Action = { type: string; [key: string]: unknown };

/** H1 stored-audit projection; never a legacy OfficeEvent or current task state. */
export interface TaskHistoryEvent {
  id: string;
  kind: keyof typeof import("./taskHistoryApi.js").historyLabels;
  employeeId: string | null;
  taskId: string;
  at: string | null;
  safeLabel: string;
  attempt: null;
  evidenceRef: string;
  legacy: true;
}
export interface TaskHistoryPage {
  events: TaskHistoryEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  snapshotRevision: number;
  coverage: "stored-audit-only";
}
