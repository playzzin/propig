import { z } from 'zod';
import type { MenuItem } from '@/types/menu';
import { DEFAULT_USER_PERMISSIONS, USER_PERMISSION_KEYS, USER_ROLE_OPTIONS, USER_POSITION_OPTIONS,
  type ManagedUserPermissions, type ManagedUserRole, type ManagedUserPosition,
  type ManagedUserSiteAccess, type ManagedUserMenuAccess, type ManagedUserRecord,
} from '@/types/userAccess';
export type UserDraft = {
  role: ManagedUserRole;
  position: ManagedUserPosition;
  siteAccess: ManagedUserSiteAccess;
  menuAccess: ManagedUserMenuAccess;
  permissions: ManagedUserPermissions;
  disabled: boolean;
};

export type MenuAccessOption = {
  key: string;
  siteId: string;
  id: string;
  text: string;
  path?: string;
  depth: number;
  item: MenuItem;
};

export const ROLE_LABELS: Record<ManagedUserRole, string> = {
  admin: '관리자',
  user: '사용자',
  partner: '파트너',
  guest: '게스트',
};

export const POSITION_LABELS: Record<ManagedUserPosition, string> = {
  ceo: '최고 관리자',
  manager: '매니저',
  staff: '스태프',
  intern: '인턴',
};

export function isManagedUserRole(value: string): value is ManagedUserRole {
  return USER_ROLE_OPTIONS.includes(value as ManagedUserRole);
}

export function getInitial(user: ManagedUserRecord): string {
  return (user.displayName || user.email || user.uid).trim().charAt(0).toUpperCase() || 'U';
}

export function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function getAllTruePermissions(): ManagedUserPermissions {
  return Object.fromEntries(USER_PERMISSION_KEYS.map(key => [key, true])) as ManagedUserPermissions;
}

export function getMenuAccessKey(siteId: string, item: MenuItem): string {
  return `${siteId}:${item.id}`;
}

export function flattenMenuAccessOptions(siteId: string, items: MenuItem[], depth = 0): MenuAccessOption[] {
  return items.flatMap((item) => {
    if (item.type === 'divider' || item.hidden) return [];

    const current: MenuAccessOption = {
      key: getMenuAccessKey(siteId, item),
      siteId,
      id: item.id,
      text: item.text,
      path: item.path,
      depth,
      item,
    };
    const children = (item.sub || []).flatMap((subItem) =>
      typeof subItem === 'string' ? [] : flattenMenuAccessOptions(siteId, [subItem], depth + 1),
    );

    return [current, ...children];
  });
}

export function getDefaultMenuAccess(draft: UserDraft, option: MenuAccessOption): boolean {
  if (draft.role === 'admin') return true;
  if (draft.siteAccess[option.siteId] === false) return false;

  const requiredPermissions = option.item.permissions || [];
  if (requiredPermissions.length > 0) {
    return requiredPermissions.some((permission) => draft.permissions[permission] === true);
  }

  const explicitAccess = draft.menuAccess[option.key];
  if (explicitAccess !== undefined) return explicitAccess;

  const hasRoleAccess =
    !option.item.roles ||
    option.item.roles.length === 0 ||
    option.item.roles.includes(draft.role);
  if (!hasRoleAccess) return false;

  return (
    !option.item.position ||
    option.item.position.length === 0 ||
    option.item.position.includes(draft.position)
  );
}

export function buildDraft(user: ManagedUserRecord, siteIds: string[]): UserDraft {
  const isAdmin = user.role === 'admin';
  const siteAccess = siteIds.reduce<ManagedUserSiteAccess>(
    (acc, siteId) => {
      const defaultAccess = isAdmin || siteId !== 'admin';
      acc[siteId] = isAdmin ? true : user.siteAccess[siteId] ?? defaultAccess;
      return acc;
    },
    { ...user.siteAccess },
  );

  return {
    role: user.role,
    position: user.position,
    siteAccess,
    menuAccess: { ...user.menuAccess },
    permissions: isAdmin ? getAllTruePermissions() : { ...DEFAULT_USER_PERMISSIONS, ...user.permissions },
    disabled: user.disabled,
  };
}


const flags = z.record(z.string(), z.boolean());
export const managedUserSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  uid: z.string().min(1), email: z.string().nullable(), displayName: z.string().nullable(),
  photoURL: z.string().nullable(), role: z.enum(USER_ROLE_OPTIONS), position: z.enum(USER_POSITION_OPTIONS),
  disabled: z.boolean(), emailVerified: z.boolean(), siteAccess: flags, menuAccess: flags,
  permissions: z.object(Object.fromEntries(USER_PERMISSION_KEYS.map(key => [key, z.boolean()])) as Record<(typeof USER_PERMISSION_KEYS)[number], z.ZodBoolean>),
  providerIds: z.array(z.string()), createdAt: z.string().nullable(), lastSignInAt: z.string().nullable(),
  updatedAt: z.string().nullable(), updatedBy: z.string().nullable(), isAdminDocLinked: z.boolean(),
});
const storageSchema = z.object({canPersist: z.boolean(), credentialMode: z.string(), message: z.string().nullable()});
export const usersPageSchema = z.object({users: z.array(managedUserSchema), storage: storageSchema, nextPageToken: z.string().min(1).nullable().optional()});
export const userAckSchema = z.object({ok: z.literal(true), user: managedUserSchema, storage: storageSchema});
export type UsersPage = z.infer<typeof usersPageSchema>;
export type StatusFilter = 'all' | 'active' | 'disabled' | 'unverified';
export type UserSort = 'name' | 'recent' | 'created';

export function equalDraft(a: UserDraft, b: UserDraft): boolean {
  const sameMap = (x: Record<string, boolean>, y: Record<string, boolean>) =>
    Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(key => x[key] === y[key]);
  return a.role === b.role && a.position === b.position && a.disabled === b.disabled &&
    sameMap(a.siteAccess, b.siteAccess) && sameMap(a.menuAccess, b.menuAccess) && sameMap(a.permissions, b.permissions);
}
export function changeSummary(base: UserDraft, draft: UserDraft): string[] {
  const result: string[] = [];
  if (base.role !== draft.role) result.push(`역할: ${ROLE_LABELS[base.role]} → ${ROLE_LABELS[draft.role]}`);
  if (base.position !== draft.position) result.push(`직책: ${POSITION_LABELS[base.position]} → ${POSITION_LABELS[draft.position]}`);
  if (base.disabled !== draft.disabled) result.push(`계정: ${draft.disabled ? '비활성화 (로그인 차단)' : '활성화'}`);
  for (const [key, label] of [['siteAccess', '사이트 접근'], ['menuAccess', '메뉴 접근'], ['permissions', '관리 권한']] as const) {
    const before = base[key] as Record<string, boolean>;
    const after = draft[key] as Record<string, boolean>;
    const count = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [...count].filter(k => before[k] !== after[k]).length;
    if (changed) result.push(`${label}: ${changed}개 변경`);
  }
  return result;
}
export function filterUsers(users: ManagedUserRecord[], search: string, role: ManagedUserRole | 'all', status: StatusFilter, sort: UserSort) {
  const keyword = search.trim().toLocaleLowerCase();
  const date = (value: string | null) => value ? Date.parse(value) || 0 : 0;
  return users.filter(user => (role === 'all' || user.role === role) &&
    (status === 'all' || (status === 'active' ? !user.disabled : status === 'disabled' ? user.disabled : !user.emailVerified)) &&
    (!keyword || [user.displayName, user.email, user.uid].some(value => value?.toLocaleLowerCase().includes(keyword))))
    .sort((a, b) => (sort === 'name' ? (a.displayName || a.email || a.uid).localeCompare(b.displayName || b.email || b.uid, 'ko') :
      sort === 'recent' ? date(b.lastSignInAt) - date(a.lastSignInAt) : date(b.createdAt) - date(a.createdAt)) || a.uid.localeCompare(b.uid));
}
