'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Ban,
  Building2,
  Check,
  Clock3,
  KeyRound,
  LockKeyhole,
  Mail,
  Menu as MenuIcon,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMenuContext } from '@/contexts/MenuContext';
import { useCurrentUserAccess } from '@/hooks/useCurrentUserAccess';
import { useMenuSitesQuery } from '@/hooks/useMenuSitesQuery';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import type { MenuItem } from '@/types/menu';
import {
  DEFAULT_USER_PERMISSIONS,
  USER_POSITION_OPTIONS,
  USER_ROLE_OPTIONS,
  type AdminUserUpdateResponse,
  type AdminUsersResponse,
  type ManagedUserMenuAccess,
  type ManagedUserPermissionKey,
  type ManagedUserPermissions,
  type ManagedUserPosition,
  type ManagedUserRecord,
  type ManagedUserRole,
  type ManagedUserSiteAccess,
} from '@/types/userAccess';

type FilterRole = ManagedUserRole | 'all';
type UserDraft = {
  role: ManagedUserRole;
  position: ManagedUserPosition;
  siteAccess: ManagedUserSiteAccess;
  menuAccess: ManagedUserMenuAccess;
  permissions: ManagedUserPermissions;
  disabled: boolean;
};

type MenuAccessOption = {
  key: string;
  siteId: string;
  id: string;
  text: string;
  path?: string;
  depth: number;
  item: MenuItem;
};

const ROLE_LABELS: Record<ManagedUserRole, string> = {
  admin: '관리자',
  user: '사용자',
  partner: '파트너',
  guest: '게스트',
};

const POSITION_LABELS: Record<ManagedUserPosition, string> = {
  ceo: '최고 관리자',
  manager: '매니저',
  staff: '스태프',
  intern: '인턴',
};

const PERMISSION_ITEMS: Array<{
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

const USERS_QUERY_KEY = ['admin-users'] as const;

function isManagedUserRole(value: string): value is ManagedUserRole {
  return USER_ROLE_OPTIONS.includes(value as ManagedUserRole);
}

function getInitial(user: ManagedUserRecord): string {
  return (user.displayName || user.email || user.uid).trim().charAt(0).toUpperCase() || 'U';
}

function formatDate(value: string | null): string {
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

function getAllTruePermissions(): ManagedUserPermissions {
  return {
    menuManagement: true,
    userManagement: true,
    projectBoardManagement: true,
    photoManagement: true,
    storageManagement: true,
  };
}

function getMenuAccessKey(siteId: string, item: MenuItem): string {
  return `${siteId}:${item.id}`;
}

function flattenMenuAccessOptions(siteId: string, items: MenuItem[], depth = 0): MenuAccessOption[] {
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

function getDefaultMenuAccess(draft: UserDraft, option: MenuAccessOption): boolean {
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

function buildDraft(user: ManagedUserRecord, siteIds: string[]): UserDraft {
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

async function fetchAdminUsers(currentUser: NonNullable<ReturnType<typeof useAuth>['currentUser']>) {
  const token = await currentUser.getIdToken();
  const response = await fetch('/api/admin/users', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || '사용자 목록을 불러오지 못했습니다.');
  }

  return (await response.json()) as AdminUsersResponse;
}

async function saveUserAccess({
  currentUser,
  uid,
  draft,
}: {
  currentUser: NonNullable<ReturnType<typeof useAuth>['currentUser']>;
  uid: string;
  draft: UserDraft;
}) {
  const token = await currentUser.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uid,
      role: draft.role,
      position: draft.position,
      siteAccess: draft.siteAccess,
      menuAccess: draft.menuAccess,
      permissions: draft.role === 'admin' ? getAllTruePermissions() : draft.permissions,
      disabled: draft.disabled,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || '사용자 권한을 저장하지 못했습니다.');
  }

  return (await response.json()) as AdminUserUpdateResponse;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { loginWithGoogle, isConfigured } = useAuth();
  const { siteData: contextSiteData } = useMenuContext();
  const { currentUser, access, isLoading: isAccessLoading, refetch: refetchUserAccess } = useCurrentUserAccess();
  const menuSitesQuery = useMenuSitesQuery();
  const [selectedUid, setSelectedUid] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<FilterRole>('all');
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [selectedMenuSiteId, setSelectedMenuSiteId] = useState('');
  const isFullAdmin = access.role === 'admin';
  const canManageUsers = isFullAdmin || access.permissions.userManagement;

  const menuSites = useMemo(() => {
    const queryData = menuSitesQuery.data;
    return queryData && Object.keys(queryData).length > 0 ? queryData : contextSiteData;
  }, [contextSiteData, menuSitesQuery.data]);
  const siteEntries = useMemo(() => getSwitchableSiteEntries(menuSites), [menuSites]);
  const menuSiteEntries = useMemo(() => Object.entries(menuSites), [menuSites]);
  const siteIds = useMemo(() => siteEntries.map(([siteId]) => siteId), [siteEntries]);
  const menuAccessGroups = useMemo(
    () =>
      menuSiteEntries.map(([siteId, site]) => ({
        siteId,
        siteName: site.name || siteId,
        options: flattenMenuAccessOptions(siteId, site.menu),
      })),
    [menuSiteEntries],
  );
  const menuAccessCount = useMemo(
    () => menuAccessGroups.reduce((total, group) => total + group.options.length, 0),
    [menuAccessGroups],
  );
  const selectedMenuAccessGroup = useMemo(() => {
    if (menuAccessGroups.length === 0) return null;
    return menuAccessGroups.find((group) => group.siteId === selectedMenuSiteId) ?? menuAccessGroups[0];
  }, [menuAccessGroups, selectedMenuSiteId]);
  const permissionManagedMenuKeys = useMemo(
    () =>
      new Set(
        menuAccessGroups.flatMap((group) =>
          group.options
            .filter((option) => (option.item.permissions || []).length > 0)
            .map((option) => option.key),
        ),
      ),
    [menuAccessGroups],
  );
  const isMenuAccessLoading = menuSitesQuery.isLoading && Object.keys(contextSiteData).length === 0;

  const usersQuery = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: () => fetchAdminUsers(currentUser!),
    enabled: Boolean(currentUser && canManageUsers),
    retry: false,
  });

  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users]);
  const selectedUser = users.find((user) => user.uid === selectedUid) ?? users[0] ?? null;
  const canEditSelectedUser =
    !selectedUser || isFullAdmin || (selectedUser.uid !== currentUser?.uid && selectedUser.role !== 'admin');

  useEffect(() => {
    if (!selectedUser) {
      queueMicrotask(() => {
        setSelectedUid('');
        setDraft(null);
      });
      return;
    }

    if (!selectedUid || selectedUid !== selectedUser.uid) {
      queueMicrotask(() => setSelectedUid(selectedUser.uid));
    }
  }, [selectedUid, selectedUser]);

  useEffect(() => {
    if (!selectedUser) {
      queueMicrotask(() => setDraft(null));
      return;
    }

    queueMicrotask(() => setDraft(buildDraft(selectedUser, siteIds)));
  }, [selectedUser, siteIds]);

  const updateMutation = useMutation({
    mutationFn: saveUserAccess,
    onSuccess: (payload) => {
      queryClient.setQueryData<AdminUsersResponse>(USERS_QUERY_KEY, (previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          users: previous.users.map((user) => (user.uid === payload.user.uid ? payload.user : user)),
          storage: payload.storage,
        };
      });
      toast.success('사용자 권한을 저장했습니다.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '저장에 실패했습니다.');
    },
  });

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesKeyword =
        !keyword ||
        user.email?.toLowerCase().includes(keyword) ||
        user.displayName?.toLowerCase().includes(keyword) ||
        user.uid.toLowerCase().includes(keyword);

      return matchesRole && matchesKeyword;
    });
  }, [roleFilter, search, users]);

  const stats = useMemo(() => {
    const adminCount = users.filter((user) => user.role === 'admin').length;
    const menuManagerCount = users.filter((user) => user.permissions.menuManagement).length;
    const disabledCount = users.filter((user) => user.disabled).length;

    return [
      { label: '전체 유저', value: String(users.length), icon: Users },
      { label: '관리자', value: String(adminCount), icon: ShieldCheck },
      { label: '메뉴 권한', value: String(menuManagerCount), icon: MenuIcon },
      { label: '비활성', value: String(disabledCount), icon: Ban },
    ];
  }, [users]);

  const handleRoleChange = (role: ManagedUserRole) => {
    if (!canEditSelectedUser || (!isFullAdmin && role === 'admin')) return;

    setDraft((previous) => {
      if (!previous) return previous;
      const isAdminRole = role === 'admin';
      const nextSiteAccess = siteIds.reduce<ManagedUserSiteAccess>(
        (acc, siteId) => {
          acc[siteId] = isAdminRole ? true : previous.siteAccess[siteId] ?? siteId !== 'admin';
          return acc;
        },
        { ...previous.siteAccess },
      );

      if (!isAdminRole) {
        nextSiteAccess.admin = false;
      }

      return {
        ...previous,
        role,
        siteAccess: nextSiteAccess,
        permissions: isAdminRole ? getAllTruePermissions() : previous.permissions,
      };
    });
  };

  const handlePermissionChange = (key: ManagedUserPermissionKey, enabled: boolean) => {
    if (!canEditSelectedUser) return;

    setDraft((previous) => {
      if (!previous || previous.role === 'admin') return previous;
      const nextSiteAccess = { ...previous.siteAccess };
      if (enabled && ['userManagement', 'menuManagement', 'projectBoardManagement', 'photoManagement', 'storageManagement'].includes(key)) {
        nextSiteAccess.admin = true;
      }

      return {
        ...previous,
        siteAccess: nextSiteAccess,
        permissions: {
          ...previous.permissions,
          [key]: enabled,
        },
      };
    });
  };

  const handleMenuAccessChange = (option: MenuAccessOption, enabled: boolean) => {
    if (!canEditSelectedUser) return;

    setDraft((previous) => {
      if (!previous || previous.role === 'admin') return previous;

      const requiredPermissions = option.item.permissions || [];
      if (requiredPermissions.length > 0) {
        const nextMenuAccess = { ...previous.menuAccess };
        delete nextMenuAccess[option.key];

        const nextPermissions = { ...previous.permissions };
        requiredPermissions.forEach((permission) => {
          nextPermissions[permission] = enabled;
        });

        return {
          ...previous,
          siteAccess: {
            ...previous.siteAccess,
            [option.siteId]: enabled ? true : previous.siteAccess[option.siteId],
          },
          menuAccess: nextMenuAccess,
          permissions: nextPermissions,
        };
      }

      return {
        ...previous,
        siteAccess: {
          ...previous.siteAccess,
          [option.siteId]: enabled ? true : previous.siteAccess[option.siteId],
        },
        menuAccess: {
          ...previous.menuAccess,
          [option.key]: enabled,
        },
      };
    });
  };

  const handleSave = () => {
    if (!currentUser || !selectedUser || !draft || !canEditSelectedUser) return;
    const normalizedDraft: UserDraft = {
      ...draft,
      menuAccess: Object.fromEntries(
        Object.entries(draft.menuAccess).filter(([key]) => !permissionManagedMenuKeys.has(key)),
      ),
    };
    updateMutation.mutate({ currentUser, uid: selectedUser.uid, draft: normalizedDraft });
  };

  if (!currentUser && !isAccessLoading) {
    return (
      <PageShell id="content-area">
        <GatePanel>
          <span>Admin required</span>
          <h1>로그인이 필요합니다</h1>
          <p>사용자 권한과 메뉴 관리 권한은 관리자 계정으로만 변경할 수 있습니다.</p>
          <button type="button" onClick={() => void loginWithGoogle()} disabled={!isConfigured}>
            Google로 로그인
          </button>
        </GatePanel>
      </PageShell>
    );
  }

  if (isAccessLoading) {
    return (
      <PageShell id="content-area">
        <GatePanel>
          <span>Checking access</span>
          <h1>관리자 권한 확인 중</h1>
          <p>로그인 계정의 관리자 권한과 Firestore 쓰기 권한을 확인하고 있습니다.</p>
        </GatePanel>
      </PageShell>
    );
  }

  if (!canManageUsers) {
    return (
      <PageShell id="content-area">
        <GatePanel>
          <span>Access denied</span>
          <h1>관리자 권한이 없습니다</h1>
          <p>이 페이지는 관리자 custom claim, admins 문서, 또는 서버 관리자 허용 목록에 포함된 계정만 접근할 수 있습니다.</p>
          <button type="button" onClick={() => void refetchUserAccess()}>
            권한 다시 확인
          </button>
        </GatePanel>
      </PageShell>
    );
  }

  return (
    <PageShell id="content-area">
      <Toolbar>
        <div>
          <span>User access control</span>
          <h1>유저 관리</h1>
          <p>여러 사이트 모드에 맞춰 계정 역할, 사이트 접근, 메뉴 관리 권한을 한 화면에서 정리합니다.</p>
        </div>

        <ToolbarActions>
          <StatusPill $ok={usersQuery.data?.storage.canPersist !== false}>
            <LockKeyhole size={15} />
            {usersQuery.data?.storage.canPersist === false ? 'Firestore 설정 필요' : 'Firestore 저장'}
          </StatusPill>
          <IconButton
            type="button"
            aria-label="새로고침"
            title="새로고침"
            onClick={() => void usersQuery.refetch()}
            disabled={usersQuery.isFetching}
          >
            <RefreshCw size={17} />
          </IconButton>
        </ToolbarActions>
      </Toolbar>

      <StatsGrid>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <StatItem key={stat.label}>
              <Icon size={18} />
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </StatItem>
          );
        })}
      </StatsGrid>

      <Workspace>
        <UserPanel>
          <PanelHeader>
            <div>
              <strong>사용자</strong>
              <span>{filteredUsers.length}명 표시</span>
            </div>
          </PanelHeader>

          <FilterBar>
            <SearchBox>
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="이름, 이메일, UID 검색"
              />
            </SearchBox>
            <select
              value={roleFilter}
              onChange={(event) => {
                const value = event.target.value;
                setRoleFilter(value === 'all' || isManagedUserRole(value) ? value : 'all');
              }}
              aria-label="역할 필터"
            >
              <option value="all">전체 역할</option>
              {USER_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </FilterBar>

          <UserList>
            {usersQuery.isLoading && <EmptyState>사용자 목록을 불러오는 중입니다.</EmptyState>}
            {usersQuery.error && (
              <EmptyState>
                {usersQuery.error instanceof Error ? usersQuery.error.message : '사용자 목록을 불러오지 못했습니다.'}
              </EmptyState>
            )}
            {!usersQuery.isLoading && !usersQuery.error && filteredUsers.length === 0 && (
              <EmptyState>조건에 맞는 사용자가 없습니다.</EmptyState>
            )}
            {filteredUsers.map((user) => (
              <UserRow
                key={user.uid}
                type="button"
                className={selectedUser?.uid === user.uid ? 'active' : ''}
                onClick={() => setSelectedUid(user.uid)}
              >
                <Avatar>
                  {user.photoURL ? (
                     
                    <img src={user.photoURL} alt="" />
                  ) : (
                    <span>{getInitial(user)}</span>
                  )}
                </Avatar>
                <UserIdentity>
                  <strong>{user.displayName || user.email || '이름 없음'}</strong>
                  <span>{user.email || user.uid}</span>
                </UserIdentity>
                <RoleBadge $role={user.role}>{ROLE_LABELS[user.role]}</RoleBadge>
              </UserRow>
            ))}
          </UserList>
        </UserPanel>

        <DetailPanel>
          {!selectedUser || !draft ? (
            <EmptyDetail>
              <UserCog size={34} />
              <strong>사용자를 선택하세요</strong>
            </EmptyDetail>
          ) : (
            <>
              <DetailHeader>
                <Avatar $large>
                  {selectedUser.photoURL ? (
                     
                    <img src={selectedUser.photoURL} alt="" />
                  ) : (
                    <span>{getInitial(selectedUser)}</span>
                  )}
                </Avatar>
                <div>
                  <span>Selected user</span>
                  <h2>{selectedUser.displayName || selectedUser.email || '이름 없음'}</h2>
                  <p>{selectedUser.uid}</p>
                </div>
              </DetailHeader>

              <MetaGrid>
                <MetaItem>
                  <Mail size={16} />
                  <span>{selectedUser.email || '이메일 없음'}</span>
                </MetaItem>
                <MetaItem>
                  <BadgeCheck size={16} />
                  <span>{selectedUser.emailVerified ? '이메일 인증 완료' : '이메일 미인증'}</span>
                </MetaItem>
                <MetaItem>
                  <Clock3 size={16} />
                  <span>최근 로그인 {formatDate(selectedUser.lastSignInAt)}</span>
                </MetaItem>
              </MetaGrid>

              <Section>
                <SectionTitle>
                  <ShieldCheck size={17} />
                  <strong>역할 설정</strong>
                </SectionTitle>
                <RoleGrid>
                  {USER_ROLE_OPTIONS.map((role) => (
                    <SegmentButton
                      key={role}
                      type="button"
                      className={draft.role === role ? 'active' : ''}
                      disabled={!canEditSelectedUser || (!isFullAdmin && role === 'admin')}
                      onClick={() => handleRoleChange(role)}
                    >
                      {draft.role === role && <Check size={15} />}
                      {ROLE_LABELS[role]}
                    </SegmentButton>
                  ))}
                </RoleGrid>

                <FieldRow>
                  <label htmlFor="position-select">직책</label>
                  <select
                      id="position-select"
                      value={draft.position}
                      disabled={!canEditSelectedUser}
                      onChange={(event) => {
                        const value = event.target.value as ManagedUserPosition;
                      setDraft((previous) => (previous ? { ...previous, position: value } : previous));
                    }}
                  >
                    {USER_POSITION_OPTIONS.map((position) => (
                      <option key={position} value={position}>
                        {POSITION_LABELS[position]}
                      </option>
                    ))}
                  </select>
                </FieldRow>
              </Section>

              <Section>
                <SectionTitle>
                  <Building2 size={17} />
                  <strong>사이트 모드 접근</strong>
                </SectionTitle>
                <SiteGrid>
                  {siteEntries.map(([siteId, site]) => {
                    const Icon = siteId === 'shop' ? BadgeCheck : siteId === 'admin' ? ShieldCheck : Building2;
                    const checked = draft.role === 'admin' || draft.siteAccess[siteId] === true;
                    return (
                      <ToggleCard key={siteId} className={checked ? 'active' : ''}>
                        <span className="icon" style={{ color: site.color || '#2563eb' }}>
                          <Icon size={18} />
                        </span>
                        <div>
                          <strong>{site.name || siteId}</strong>
                          <span>{siteId}</span>
                        </div>
                        <Switch
                          type="button"
                          aria-pressed={checked}
                          className={checked ? 'on' : ''}
                          disabled={draft.role === 'admin' || !canEditSelectedUser}
                          onClick={() => {
                            setDraft((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    siteAccess: {
                                      ...previous.siteAccess,
                                      [siteId]: !checked,
                                    },
                                  }
                                : previous,
                            );
                          }}
                        />
                      </ToggleCard>
                    );
                  })}
                </SiteGrid>
              </Section>

              <Section>
                <SectionTitle>
                  <MenuIcon size={17} />
                  <strong>메뉴 접근</strong>
                  <small>{menuAccessGroups.length}개 사이트 모드 / {menuAccessCount}개 메뉴</small>
                </SectionTitle>
                <MenuAccessList>
                  {isMenuAccessLoading ? (
                    <EmptyMenuAccess>메뉴 데이터를 불러오는 중입니다.</EmptyMenuAccess>
                  ) : menuAccessGroups.length === 0 ? (
                    <EmptyMenuAccess>표시할 사이트 모드 메뉴가 없습니다.</EmptyMenuAccess>
                  ) : !selectedMenuAccessGroup ? (
                    <EmptyMenuAccess>선택된 사이트 모드가 없습니다.</EmptyMenuAccess>
                  ) : (
                    <>
                      <MenuAccessModeList role="tablist" aria-label="사이트 모드별 메뉴">
                        {menuAccessGroups.map((group) => {
                          const selected = group.siteId === selectedMenuAccessGroup.siteId;
                          const checkedCount = draft
                            ? group.options.filter((option) => getDefaultMenuAccess(draft, option)).length
                            : 0;

                          return (
                            <MenuAccessModeButton
                              key={group.siteId}
                              type="button"
                              role="tab"
                              aria-selected={selected}
                              className={selected ? 'active' : ''}
                              onClick={() => setSelectedMenuSiteId(group.siteId)}
                            >
                              <span>{group.siteName}</span>
                              <small>
                                {checkedCount}/{group.options.length}
                              </small>
                            </MenuAccessModeButton>
                          );
                        })}
                      </MenuAccessModeList>
                      <MenuAccessSite key={selectedMenuAccessGroup.siteId}>
                        <h3>{selectedMenuAccessGroup.siteName}</h3>
                        {selectedMenuAccessGroup.options.length === 0 ? (
                          <EmptyMenuAccess>등록된 메뉴가 없습니다.</EmptyMenuAccess>
                        ) : (
                          selectedMenuAccessGroup.options.map((option) => {
                            const checked = Boolean(draft && getDefaultMenuAccess(draft, option));
                            return (
                              <MenuAccessRow key={option.key} $depth={option.depth} className={checked ? 'active' : ''}>
                                <div>
                                  <strong>{option.text}</strong>
                                  <span>{option.path || option.id}</span>
                                </div>
                                <Switch
                                  type="button"
                                  aria-pressed={checked}
                                  className={checked ? 'on' : ''}
                                  disabled={draft.role === 'admin' || !canEditSelectedUser}
                                  onClick={() => handleMenuAccessChange(option, !checked)}
                                />
                              </MenuAccessRow>
                            );
                          })
                        )}
                      </MenuAccessSite>
                    </>
                  )}
                </MenuAccessList>
              </Section>

              <Section>
                <SectionTitle>
                  <KeyRound size={17} />
                  <strong>관리 권한</strong>
                </SectionTitle>
                <PermissionList>
                  {PERMISSION_ITEMS.map((item) => {
                    const checked = draft.role === 'admin' || draft.permissions[item.key];
                    return (
                      <PermissionRow key={item.key}>
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.description}</span>
                        </div>
                        <Switch
                          type="button"
                          aria-pressed={checked}
                          className={checked ? 'on' : ''}
                          disabled={draft.role === 'admin' || !canEditSelectedUser}
                          onClick={() => handlePermissionChange(item.key, !checked)}
                        />
                      </PermissionRow>
                    );
                  })}
                </PermissionList>
              </Section>

              <Section>
                <SectionTitle>
                  <Ban size={17} />
                  <strong>계정 상태</strong>
                </SectionTitle>
                <PermissionRow>
                  <div>
                    <strong>계정 비활성화</strong>
                    <span>비활성화된 계정은 Firebase Auth 로그인이 차단됩니다.</span>
                  </div>
                  <Switch
                    type="button"
                    aria-pressed={draft.disabled}
                    className={draft.disabled ? 'on danger' : ''}
                    disabled={selectedUser.uid === currentUser?.uid || !canEditSelectedUser}
                    onClick={() =>
                      setDraft((previous) => (previous ? { ...previous, disabled: !previous.disabled } : previous))
                    }
                  />
                </PermissionRow>
              </Section>

              <ActionBar>
                <span>마지막 수정: {formatDate(selectedUser.updatedAt)}</span>
                <SaveButton type="button" onClick={handleSave} disabled={updateMutation.isPending || !canEditSelectedUser}>
                  {updateMutation.isPending ? <RefreshCw size={17} /> : <Save size={17} />}
                  저장
                </SaveButton>
              </ActionBar>
            </>
          )}
        </DetailPanel>
      </Workspace>
    </PageShell>
  );
}

const PageShell = styled.main`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f5f7fb;
  color: #17211d;
`;

const Toolbar = styled.header`
  flex: 0 0 auto;
  padding: 20px 28px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.1);
  background: #ffffff;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;

  span {
    color: #0f766e;
    font-size: 0.75rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  h1 {
    margin: 5px 0 0;
    font-size: clamp(1.45rem, 2.5vw, 2.1rem);
    line-height: 1.08;
    font-weight: 950;
    letter-spacing: 0;
  }

  p {
    margin: 7px 0 0;
    color: #5d6c66;
    line-height: 1.5;
    word-break: keep-all;
  }

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
    padding: 18px 16px;
  }
`;

const ToolbarActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const StatusPill = styled.div<{ $ok?: boolean }>`
  min-height: 38px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid ${({ $ok }) => ($ok ? 'rgba(15, 118, 110, 0.18)' : 'rgba(185, 28, 28, 0.18)')};
  background: ${({ $ok }) => ($ok ? '#ecfdf5' : '#fef2f2')};
  color: ${({ $ok }) => ($ok ? '#0f766e' : '#b91c1c')};
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.82rem;
  font-weight: 900;
`;

const IconButton = styled.button`
  width: 38px;
  height: 38px;
  border: 1px solid rgba(23, 33, 29, 0.12);
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const StatsGrid = styled.section`
  flex: 0 0 auto;
  padding: 14px 28px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 12px 16px;
  }
`;

const StatItem = styled.div`
  min-height: 82px;
  border: 1px solid rgba(23, 33, 29, 0.08);
  border-radius: 8px;
  background: #ffffff;
  padding: 14px;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  gap: 8px 10px;
  align-items: center;

  svg {
    color: #2563eb;
  }

  span {
    color: #66756f;
    font-size: 0.82rem;
    font-weight: 800;
  }

  strong {
    grid-column: 1 / -1;
    color: #17211d;
    font-size: 1.55rem;
    font-weight: 950;
  }
`;

const Workspace = styled.section`
  flex: 1;
  min-height: 0;
  padding: 0 28px 24px;
  display: grid;
  grid-template-columns: minmax(300px, 390px) minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    overflow-y: auto;
    padding: 0 16px 20px;
  }
`;

const UserPanel = styled.aside`
  min-height: 0;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const DetailPanel = styled.section`
  min-height: 0;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;

  @media (max-width: 980px) {
    min-height: 760px;
  }
`;

const PanelHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.08);

  div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  strong {
    font-size: 1rem;
    font-weight: 950;
  }

  span {
    color: #72817a;
    font-size: 0.78rem;
    font-weight: 800;
  }
`;

const FilterBar = styled.div`
  padding: 12px 14px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.08);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 8px;

  select {
    min-width: 0;
    height: 38px;
    border-radius: 8px;
    border: 1px solid rgba(23, 33, 29, 0.12);
    background: #ffffff;
    color: #17211d;
    padding: 0 10px;
    font-weight: 800;
  }
`;

const SearchBox = styled.label`
  min-width: 0;
  height: 38px;
  border: 1px solid rgba(23, 33, 29, 0.12);
  border-radius: 8px;
  background: #f8fafc;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;

  input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: #17211d;
    font-weight: 750;
  }
`;

const UserList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  align-content: start;
  gap: 6px;
`;

const UserRow = styled.button`
  width: 100%;
  min-height: 64px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  padding: 8px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;

  &:hover,
  &.active {
    border-color: rgba(37, 99, 235, 0.16);
    background: #eff6ff;
  }
`;

const Avatar = styled.div<{ $large?: boolean }>`
  width: ${({ $large }) => ($large ? '62px' : '42px')};
  height: ${({ $large }) => ($large ? '62px' : '42px')};
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(135deg, #0f766e, #2563eb);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 950;
  flex: 0 0 auto;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const UserIdentity = styled.div`
  min-width: 0;

  strong,
  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #17211d;
    font-size: 0.9rem;
    font-weight: 950;
  }

  span {
    margin-top: 3px;
    color: #687872;
    font-size: 0.76rem;
  }
`;

const RoleBadge = styled.span<{ $role: ManagedUserRole }>`
  min-width: 58px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $role }) =>
    $role === 'admin' ? '#dcfce7' : $role === 'partner' ? '#fef3c7' : $role === 'guest' ? '#f1f5f9' : '#e0f2fe'};
  color: ${({ $role }) =>
    $role === 'admin' ? '#047857' : $role === 'partner' ? '#92400e' : $role === 'guest' ? '#475569' : '#0369a1'};
  font-size: 0.7rem;
  font-weight: 950;
`;

const DetailHeader = styled.header`
  padding: 18px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.08);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;

  span {
    color: #0f766e;
    font-size: 0.74rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  h2 {
    margin: 4px 0 0;
    color: #17211d;
    font-size: 1.3rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  p {
    margin: 5px 0 0;
    color: #687872;
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }
`;

const MetaGrid = styled.div`
  padding: 12px 18px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.08);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const MetaItem = styled.div`
  min-height: 38px;
  border: 1px solid rgba(23, 33, 29, 0.08);
  border-radius: 8px;
  background: #f8fafc;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #51615b;
  font-size: 0.78rem;
  font-weight: 800;
  min-width: 0;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Section = styled.section`
  padding: 16px 18px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.08);
`;

const SectionTitle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #17211d;
  margin-bottom: 12px;

  svg {
    color: #2563eb;
  }

  strong {
    font-size: 0.94rem;
    font-weight: 950;
  }

  small {
    color: #687872;
    font-size: 0.74rem;
    font-weight: 850;
  }
`;

const RoleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SegmentButton = styled.button`
  min-height: 40px;
  border: 1px solid rgba(23, 33, 29, 0.12);
  border-radius: 8px;
  background: #ffffff;
  color: #52645e;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-weight: 950;
  cursor: pointer;

  &.active {
    border-color: rgba(15, 118, 110, 0.28);
    background: #0f766e;
    color: #ffffff;
  }
`;

const FieldRow = styled.div`
  margin-top: 12px;
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 10px;
  align-items: center;

  label {
    color: #52645e;
    font-size: 0.84rem;
    font-weight: 900;
  }

  select {
    height: 40px;
    border: 1px solid rgba(23, 33, 29, 0.12);
    border-radius: 8px;
    background: #ffffff;
    color: #17211d;
    padding: 0 12px;
    font-weight: 900;
  }
`;

const SiteGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
`;

const ToggleCard = styled.div`
  min-height: 60px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #ffffff;
  padding: 10px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;

  &.active {
    background: #f0fdfa;
    border-color: rgba(15, 118, 110, 0.18);
  }

  .icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: rgba(15, 118, 110, 0.08);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  strong,
  span {
    display: block;
  }

  strong {
    color: #17211d;
    font-size: 0.86rem;
    font-weight: 950;
  }

  span {
    color: #687872;
    font-size: 0.74rem;
    margin-top: 3px;
  }
`;

const MenuAccessList = styled.div`
  display: grid;
  gap: 12px;
`;

const MenuAccessModeList = styled.div`
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 2px;
`;

const MenuAccessModeButton = styled.button`
  min-width: 112px;
  max-width: 168px;
  min-height: 42px;
  border: 1px solid rgba(23, 33, 29, 0.12);
  border-radius: 8px;
  background: #ffffff;
  color: #52645e;
  padding: 7px 10px;
  display: grid;
  gap: 2px;
  flex: 0 0 auto;
  text-align: left;
  cursor: pointer;

  &.active {
    background: #0f766e;
    border-color: rgba(15, 118, 110, 0.3);
    color: #ffffff;
  }

  span,
  small {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    font-size: 0.82rem;
    font-weight: 950;
  }

  small {
    font-size: 0.7rem;
    font-weight: 850;
    opacity: 0.74;
  }
`;

const MenuAccessSite = styled.div`
  display: grid;
  gap: 7px;

  h3 {
    margin: 0;
    color: #52645e;
    font-size: 0.78rem;
    font-weight: 950;
  }
`;

const MenuAccessRow = styled.div<{ $depth: number }>`
  min-height: 52px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #ffffff;
  padding: 9px 10px 9px ${({ $depth }) => 10 + $depth * 16}px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;

  &.active {
    background: #f8fffd;
    border-color: rgba(15, 118, 110, 0.14);
  }

  strong,
  span {
    display: block;
  }

  strong {
    color: #17211d;
    font-size: 0.84rem;
    font-weight: 950;
  }

  span {
    margin-top: 3px;
    color: #687872;
    font-size: 0.72rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
`;

const EmptyMenuAccess = styled.div`
  min-height: 42px;
  border: 1px dashed rgba(23, 33, 29, 0.14);
  border-radius: 8px;
  color: #687872;
  display: grid;
  place-items: center;
  font-size: 0.78rem;
  font-weight: 800;
`;

const PermissionList = styled.div`
  display: grid;
  gap: 8px;
`;

const PermissionRow = styled.div`
  min-height: 58px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;

  strong,
  span {
    display: block;
  }

  strong {
    color: #17211d;
    font-size: 0.88rem;
    font-weight: 950;
  }

  span {
    margin-top: 4px;
    color: #687872;
    font-size: 0.76rem;
    line-height: 1.35;
  }
`;

const Switch = styled.button`
  width: 42px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: #cbd5e1;
  padding: 3px;
  cursor: pointer;
  position: relative;

  &::after {
    content: '';
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #ffffff;
    position: absolute;
    top: 3px;
    left: 3px;
    transition: transform 0.16s ease;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.22);
  }

  &.on {
    background: #0f766e;
  }

  &.on.danger {
    background: #b91c1c;
  }

  &.on::after {
    transform: translateX(18px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ActionBar = styled.footer`
  margin-top: auto;
  position: sticky;
  bottom: 0;
  padding: 14px 18px;
  border-top: 1px solid rgba(23, 33, 29, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #ffffff;

  span {
    color: #687872;
    font-size: 0.78rem;
    font-weight: 800;
  }
`;

const SaveButton = styled.button`
  min-width: 96px;
  min-height: 40px;
  border: 0;
  border-radius: 8px;
  background: #0f766e;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 950;
  cursor: pointer;

  &:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  padding: 22px 12px;
  color: #687872;
  text-align: center;
  font-size: 0.86rem;
  font-weight: 800;
`;

const EmptyDetail = styled.div`
  margin: auto;
  color: #687872;
  display: grid;
  justify-items: center;
  gap: 10px;

  svg {
    color: #2563eb;
  }

  strong {
    color: #17211d;
    font-weight: 950;
  }
`;

const GatePanel = styled.section`
  width: min(560px, calc(100% - 32px));
  margin: auto;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #ffffff;
  padding: 30px;
  box-shadow: 0 24px 70px rgba(23, 33, 29, 0.12);

  span {
    color: #0f766e;
    font-size: 0.78rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  h1 {
    margin: 8px 0 0;
    color: #17211d;
    font-size: 1.8rem;
    letter-spacing: 0;
  }

  p {
    margin: 12px 0 0;
    color: #52645e;
    line-height: 1.6;
  }

  button {
    min-height: 42px;
    margin-top: 20px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: #0f766e;
    color: #ffffff;
    font-weight: 900;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
`;
