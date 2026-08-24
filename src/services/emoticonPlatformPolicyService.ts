import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
  getFallbackEmoticonPlatformPolicyPresets,
  getEmoticonPlatformProfile,
  toEmoticonPlatformProfileFromPolicyPreset,
  type EmoticonPlatformProfile,
} from '@/lib/emoticonPlatformProfiles';
import type {
  EmoticonProjectPlatform,
  EmoticonProjectType,
} from '@/schemas/emoticonProject';
import {
  platformPolicyPresetSchema,
  type PlatformPolicyPreset,
} from '@/schemas/emoticonStudioV2';

export const EMOTICON_PLATFORM_POLICY_COLLECTION = 'emoticonStudioPlatformPolicies';

export type ResolvedEmoticonPlatformPolicy = {
  id: PlatformPolicyPreset['id'];
  preset: PlatformPolicyPreset;
  storedPreset: PlatformPolicyPreset | null;
  profile: EmoticonPlatformProfile;
  source: 'fallback' | 'firestore';
};

function resolvePolicies(
  storedById: ReadonlyMap<string, PlatformPolicyPreset>,
): ResolvedEmoticonPlatformPolicy[] {
  return getFallbackEmoticonPlatformPolicyPresets().map((fallback) => {
    const storedPreset = storedById.get(fallback.id) ?? null;
    const usesStoredPolicy = storedPreset?.enabled === true;
    const preset = usesStoredPolicy ? storedPreset : fallback;
    return {
      id: fallback.id,
      preset,
      storedPreset,
      profile: toEmoticonPlatformProfileFromPolicyPreset(preset),
      source: usesStoredPolicy ? 'firestore' : 'fallback',
    };
  });
}

export function getFallbackResolvedEmoticonPlatformPolicies(): ResolvedEmoticonPlatformPolicy[] {
  return resolvePolicies(new Map());
}

/**
 * Resolves the policy used for a single generation request. Firestore is an
 * optional override: missing, disabled, malformed, or unreadable documents
 * always fall back to the versioned profile shipped with the application.
 */
export async function resolveEmoticonPlatformProfile(params: {
  platform: EmoticonProjectPlatform;
  type: EmoticonProjectType;
}): Promise<EmoticonPlatformProfile> {
  const fallback = getEmoticonPlatformProfile(params.platform, params.type);
  if (!['kakao', 'line', 'custom'].includes(params.platform)) return fallback;

  try {
    const policyId = `${params.platform}-${params.type}`;
    const snapshot = await getDoc(doc(db, EMOTICON_PLATFORM_POLICY_COLLECTION, policyId));
    if (!snapshot.exists()) return fallback;
    const parsed = platformPolicyPresetSchema.safeParse({
      ...snapshot.data(),
      id: snapshot.id,
    });
    if (!parsed.success || !parsed.data.enabled) return fallback;
    return toEmoticonPlatformProfileFromPolicyPreset(parsed.data);
  } catch {
    return fallback;
  }
}

export function subscribeEmoticonPlatformPolicies(params: {
  onChange: (policies: ResolvedEmoticonPlatformPolicy[]) => void;
  onError?: (error: Error) => void;
  onInvalidPolicy?: (documentId: string) => void;
}): Unsubscribe {
  return onSnapshot(
    collection(db, EMOTICON_PLATFORM_POLICY_COLLECTION),
    (snapshot) => {
      const storedById = new Map<string, PlatformPolicyPreset>();
      snapshot.docs.forEach((policyDocument) => {
        const parsed = platformPolicyPresetSchema.safeParse({
          ...policyDocument.data(),
          id: policyDocument.id,
        });
        if (!parsed.success) {
          params.onInvalidPolicy?.(policyDocument.id);
          return;
        }
        storedById.set(parsed.data.id, parsed.data);
      });
      params.onChange(resolvePolicies(storedById));
    },
    (cause) => {
      params.onChange(getFallbackResolvedEmoticonPlatformPolicies());
      params.onError?.(cause instanceof Error ? cause : new Error('플랫폼 정책을 불러오지 못했습니다.'));
    },
  );
}

export async function saveEmoticonPlatformPolicyPreset(params: {
  preset: PlatformPolicyPreset;
  expectedRevision: number;
  actorId: string;
}): Promise<PlatformPolicyPreset> {
  if (!Number.isInteger(params.expectedRevision) || params.expectedRevision < 0) {
    throw new Error('플랫폼 정책 버전이 올바르지 않습니다.');
  }
  const nextPreset = platformPolicyPresetSchema.parse({
    ...params.preset,
    revision: params.expectedRevision + 1,
    updatedBy: params.actorId,
  });
  const policyReference = doc(db, EMOTICON_PLATFORM_POLICY_COLLECTION, nextPreset.id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(policyReference);
    if (!snapshot.exists()) {
      if (params.expectedRevision !== 0) {
        throw new Error('플랫폼 정책이 다른 관리자에 의해 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
      }
    } else {
      const current = platformPolicyPresetSchema.safeParse({
        ...snapshot.data(),
        id: snapshot.id,
      });
      if (!current.success) throw new Error('저장된 플랫폼 정책 데이터가 손상되었습니다.');
      if (current.data.revision !== params.expectedRevision) {
        throw new Error('플랫폼 정책이 다른 관리자에 의해 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
      }
    }

    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...serializablePreset
    } = nextPreset;
    transaction.set(policyReference, {
      ...serializablePreset,
      createdAt: snapshot.exists() ? snapshot.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return nextPreset;
}
