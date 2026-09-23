import type { User } from "firebase/auth";
import type { ActivityLogInput } from "@/types/activityLog";

export async function recordActivityLog(currentUser: User | null, input: ActivityLogInput): Promise<void> {
  if (!currentUser) return;

  try {
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/activity-logs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        route:
          input.route ??
          (typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      console.warn("[ActivityLog] Failed to record activity:", payload.error || response.statusText);
    }
  } catch (error) {
    console.warn("[ActivityLog] Failed to record activity:", error);
  }
}
