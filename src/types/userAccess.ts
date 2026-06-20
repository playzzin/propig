export const USER_ROLE_OPTIONS = ['admin', 'user', 'partner', 'guest'] as const;
export type ManagedUserRole = (typeof USER_ROLE_OPTIONS)[number];

export const USER_POSITION_OPTIONS = ['ceo', 'manager', 'staff', 'intern'] as const;
export type ManagedUserPosition = (typeof USER_POSITION_OPTIONS)[number];

export const USER_PERMISSION_KEYS = [
  'menuManagement',
  'userManagement',
  'projectBoardManagement',
  'photoManagement',
  'storageManagement',
] as const;

export type ManagedUserPermissionKey = (typeof USER_PERMISSION_KEYS)[number];

export type ManagedUserPermissions = Record<ManagedUserPermissionKey, boolean>;

export const USER_PERMISSION_ITEMS: Array<{
  key: ManagedUserPermissionKey;
  title: string;
  description: string;
}> = [
  {
    key: 'userManagement',
    title: '유저 관리',
    description: '사용자 권한, 사이트 접근, 계정 상태를 관리합니다.',
  },
  {
    key: 'menuManagement',
    title: '통합 메뉴 관리',
    description: '여러 사이트 모드의 메뉴 구조를 편집합니다.',
  },
  {
    key: 'projectBoardManagement',
    title: '프로젝트 보드',
    description: '프로젝트, 포트폴리오, 과제 사진 보드를 관리합니다.',
  },
  {
    key: 'photoManagement',
    title: '사진첩 관리',
    description: '업로드 사진과 앨범 자료를 관리합니다.',
  },
  {
    key: 'storageManagement',
    title: 'Storage 관리',
    description: '공용 파일과 폴더를 관리합니다.',
  },
];

export type ManagedUserSiteAccess = Record<string, boolean>;
export type ManagedUserMenuAccess = Record<string, boolean>;

export interface ManagedUserAccess {
  role: ManagedUserRole;
  position: ManagedUserPosition;
  siteAccess: ManagedUserSiteAccess;
  menuAccess: ManagedUserMenuAccess;
  permissions: ManagedUserPermissions;
}

export interface ManagedUserRecord extends ManagedUserAccess {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  disabled: boolean;
  emailVerified: boolean;
  providerIds: string[];
  createdAt: string | null;
  lastSignInAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  isAdminDocLinked: boolean;
}

export interface AdminUsersStorageStatus {
  canPersist: boolean;
  credentialMode: string;
  message: string | null;
}

export interface AdminUsersResponse {
  users: ManagedUserRecord[];
  storage: AdminUsersStorageStatus;
}

export interface AdminUserUpdateResponse {
  ok: true;
  user: ManagedUserRecord;
  storage: AdminUsersStorageStatus;
}

export const DEFAULT_USER_PERMISSIONS: ManagedUserPermissions = {
  menuManagement: false,
  userManagement: false,
  projectBoardManagement: false,
  photoManagement: false,
  storageManagement: false,
};
