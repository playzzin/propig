export type ActivityLogActor = {
  uid: string;
  email?: string | null;
  role?: string | null;
  isAdmin?: boolean;
};

export type ActivityLogTarget = {
  type: string;
  id?: string | null;
  path?: string | null;
  label?: string | null;
};

export type ActivityLogRecord = {
  id: string;
  action: string;
  actor: ActivityLogActor;
  target: ActivityLogTarget;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  route?: string | null;
  userAgent?: string | null;
  createdAt?: string | null;
};

export type ActivityLogInput = {
  action: string;
  target: ActivityLogTarget;
  summary?: string;
  metadata?: Record<string, unknown>;
  route?: string;
};

export type ActivityLogsResponse = {
  logs: ActivityLogRecord[];
  nextCursor: string | null;
  matchedCount?: number;
  scannedCount?: number;
  scanLimitReached?: boolean;
  selectedLogMatched?: boolean | null;
};
