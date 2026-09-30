import type { User } from 'firebase/auth';

export interface ErpHomePreferences {
  pinnedModuleHrefs: string[];
  updatedAt: string | null;
}

const ERP_HOME_PREFERENCES_ENDPOINT = '/api/user/erp-home-preferences';

function isPreferencePayload(value: unknown): value is { pinnedModuleHrefs?: unknown; updatedAt?: unknown; error?: unknown } {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePinnedModuleHrefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

async function readPreferenceResponse(response: Response): Promise<ErpHomePreferences> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      isPreferencePayload(payload) && typeof payload.error === 'string'
        ? payload.error
        : 'ERP home preferences request failed.';
    throw new Error(message);
  }

  return {
    pinnedModuleHrefs: isPreferencePayload(payload) ? normalizePinnedModuleHrefs(payload.pinnedModuleHrefs) : [],
    updatedAt: isPreferencePayload(payload) && typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
  };
}

export async function fetchErpHomePreferences(currentUser: User, signal?: AbortSignal): Promise<ErpHomePreferences> {
  const token = await currentUser.getIdToken();
  const response = await fetch(ERP_HOME_PREFERENCES_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  return readPreferenceResponse(response);
}

export async function saveErpHomePreferences(
  currentUser: User,
  pinnedModuleHrefs: string[],
  signal?: AbortSignal,
): Promise<ErpHomePreferences> {
  const token = await currentUser.getIdToken();
  const response = await fetch(ERP_HOME_PREFERENCES_ENDPOINT, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pinnedModuleHrefs }),
    signal,
  });

  return readPreferenceResponse(response);
}
