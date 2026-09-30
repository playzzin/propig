'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { BadgeCheck, Ban, Building2, Check, Clock3, KeyRound, LockKeyhole, Mail, Menu as MenuIcon, RefreshCw, Save, Search, ShieldCheck, UserCog, Users } from 'lucide-react';
import { useMenuContext } from '@/contexts/MenuContext';
import { useMenuSitesQuery } from '@/hooks/useMenuSitesQuery';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import { USER_PERMISSION_ITEMS, USER_POSITION_OPTIONS, USER_ROLE_OPTIONS, type ManagedUserRole, type ManagedUserPosition, type ManagedUserSiteAccess, type ManagedUserPermissionKey } from '@/types/userAccess';
import { useAdminUsersController, useAdminUsersSession } from './useAdminUsersController';
import { ROLE_LABELS, POSITION_LABELS, isManagedUserRole, getInitial, formatDate, getAllTruePermissions, flattenMenuAccessOptions, getDefaultMenuAccess, filterUsers, type MenuAccessOption, type StatusFilter, type UserSort } from './userManagementModel';

type Session = ReturnType<typeof useAdminUsersSession>;
export default function AdminUsersPage() {
  const session = useAdminUsersSession();
  if (session.loading) return <PageShell id="content-area"><GatePanel><h1>관리자 권한 확인 중</h1><p>로그인과 유저 관리 권한을 확인하고 있습니다.</p><Link href="/admin">관리자 홈</Link></GatePanel></PageShell>;
  if (!session.currentUser) return <PageShell id="content-area"><GatePanel><h1>로그인이 필요합니다</h1><p>유저 관리 권한이 있는 계정으로 로그인해 주세요.</p><button type="button" disabled={!session.isConfigured} onClick={() => void session.loginWithGoogle()}>Google로 로그인</button><Link href="/admin">관리자 홈</Link></GatePanel></PageShell>;
  if (!session.allowed) return <PageShell id="content-area"><GatePanel><h1>유저 관리 권한이 없습니다</h1><p>관리자 또는 유저 관리 권한을 위임받은 계정만 사용할 수 있습니다. 계정 전환 중이라면 확인이 끝날 때까지 기다려 주세요.</p><button type="button" onClick={() => void session.accessQuery.refetch()}>권한 다시 확인</button><Link href="/admin">관리자 홈</Link></GatePanel></PageShell>;
  return <AdminUsersWorkspace key={session.sessionKey} session={session} />;
}

function AdminUsersWorkspace({ session }: { session: Session }) {
  const currentUser = session.currentUser!;
  const isFullAdmin = session.isFullAdmin;
  const { siteData: contextSiteData } = useMenuContext();
  const menuSitesQuery = useMenuSitesQuery();
  const [search, setSearch] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') ?? new URLSearchParams(window.location.search).get('search') ?? '');
  const [roleFilter, setRoleFilter] = useState<ManagedUserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<UserSort>('name');
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedMenuSiteId, setSelectedMenuSiteId] = useState('');
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
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

  const controller = useAdminUsersController({ currentUser, sdkSession: session.sdkSession, isFullAdmin, siteIds, permissionManagedMenuKeys });
  const { usersQuery, users, selectedUser, draft, setDraft, canEditSelectedUser, handleSave, dirty, summary, saving, saveError, uncertain, storage } = controller;
  const filteredUsers = useMemo(() => filterUsers(users, search, roleFilter, statusFilter, sort), [users, search, roleFilter, statusFilter, sort]);
  const initialUid = useRef(typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('uid') ?? '');
  useEffect(() => {
    // URL target selection is cancellable, one-shot, and uses the controller's atomic owner binding.
    if (!initialUid.current || !users.some(user => user.uid === initialUid.current)) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { controller.selectUser(initialUid.current); initialUid.current = ''; } });
    return () => { cancelled = true; };
  }, [controller, users]);
  const chooseUser = (uid: string) => {
    initialUid.current = '';
    if (controller.selectUser(uid)) {
      requestAnimationFrame(() => { detailRef.current?.focus(); if (window.matchMedia('(max-width: 980px)').matches) detailRef.current?.scrollIntoView({ block: 'start' }); });
    }
  };
  const stats = useMemo(() => {
    const adminCount = users.filter((user) => user.role === 'admin').length;
    const menuManagerCount = users.filter((user) => user.permissions.menuManagement).length;
    const disabledCount = users.filter((user) => user.disabled).length;

    return [
      { label: '불러온 유저', value: String(users.length), icon: Users },
      { label: '관리자', value: String(adminCount), icon: ShieldCheck },
      { label: '메뉴 권한', value: String(menuManagerCount), icon: MenuIcon },
      { label: '비활성', value: String(disabledCount), icon: Ban },
    ];
  }, [users]);

  const handleRoleChange = (role: ManagedUserRole) => {
    if (!canEditSelectedUser || (!isFullAdmin && role === 'admin') || (selectedUser?.uid === currentUser.uid && selectedUser.role === 'admin' && role !== 'admin')) return;

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

  return (
    <PageShell id="content-area" data-admin-users-ready="true">
      <Toolbar>
        <div>
          <span>User access control</span>
          <h1>유저 관리</h1>
          <p>여러 사이트 모드에 맞춰 계정 역할, 사이트 접근, 메뉴 관리 권한을 한 화면에서 정리합니다.</p>
        </div>

        <ToolbarActions>
          <Link href="/admin" onNavigate={event => { if (!controller.confirmLeave()) event.preventDefault(); }}>관리자 홈</Link>
          {isFullAdmin && <Link href="/admin/users/invitations" onNavigate={event => { if (!controller.confirmLeave()) event.preventDefault(); }}>팀원 온보딩 초대</Link>}
          {controller.targetUid && <a href="/admin/users" onClick={event => { if (!controller.confirmLeave()) event.preventDefault(); }}>전체 유저 목록으로</a>}
          <StatusPill $ok={storage?.canPersist !== false}>
            <LockKeyhole size={15} />
            {!storage ? '저장 환경 확인 중' : storage.canPersist === false ? 'Firestore 설정 필요' : '저장 가능'}
          </StatusPill>
          <IconButton
            type="button"
            aria-label="새로고침"
            title="새로고침"
            onClick={() => void controller.refresh()}
            disabled={usersQuery.isFetching || saving || controller.refreshing}
          >
            <RefreshCw size={17} />
          </IconButton>
        </ToolbarActions>
      </Toolbar>

      <p className="scope-note">검색·통계는 불러온 사용자 범위입니다. 나머지 사용자는 ‘더 불러오기’로 확인하세요.</p>
      {storage?.message && <p className="scope-note" role="status">{storage.message}</p>}
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
        <UserPanel ref={listRef} tabIndex={-1} aria-label="사용자 목록">
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
                aria-label="이름, 이메일, UID 검색"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setVisibleCount(50); }}
                placeholder="이름, 이메일, UID 검색"
              />
            </SearchBox>
            <select
              value={roleFilter}
              onChange={(event) => {
                const value = event.target.value;
                setRoleFilter(value === 'all' || isManagedUserRole(value) ? value : 'all'); setVisibleCount(50);
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
            <select aria-label="상태 필터" value={statusFilter} onChange={event => { setStatusFilter(event.target.value as StatusFilter); setVisibleCount(50); }}>
              <option value="all">전체 상태</option><option value="active">활성</option><option value="disabled">비활성</option><option value="unverified">이메일 미인증</option>
            </select>
            <select aria-label="사용자 정렬" value={sort} onChange={event => { setSort(event.target.value as UserSort); setVisibleCount(50); }}>
              <option value="name">이름순</option><option value="recent">최근 로그인순</option><option value="created">최근 가입순</option>
            </select>
          </FilterBar>

          <UserList>
            {usersQuery.isLoading && <EmptyState>사용자 목록을 불러오는 중입니다.</EmptyState>}
            {usersQuery.error && (
              <EmptyState>
                <p role="alert">사용자 목록을 불러오지 못했습니다. 연결과 권한을 확인해 주세요.</p><SegmentButton type="button" onClick={() => void (usersQuery.isFetchNextPageError ? usersQuery.fetchNextPage() : controller.refresh())} disabled={usersQuery.isFetching || saving}>목록 다시 시도</SegmentButton>
              </EmptyState>
            )}
            {!usersQuery.isLoading && !usersQuery.error && filteredUsers.length === 0 && (
              <EmptyState>{users.length === 0 ? '등록된 사용자가 없습니다.' : '불러온 사용자 중 검색 조건에 맞는 사용자가 없습니다.'}{users.length > 0 && <SegmentButton type="button" onClick={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); }}>검색 조건 초기화</SegmentButton>}</EmptyState>
            )}
            {filteredUsers.slice(0, visibleCount).map((user) => (
              <UserRow
                key={user.uid}
                type="button"
                className={selectedUser?.uid === user.uid ? 'active' : ''}
                aria-pressed={selectedUser?.uid === user.uid}
                data-user-uid={user.uid}
                onClick={() => chooseUser(user.uid)}
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
                  {user.disabled && <span className="disabled-badge">비활성 · 로그인 차단</span>}
                </UserIdentity>
                <RoleBadge $role={user.role}>{ROLE_LABELS[user.role]}</RoleBadge>
              </UserRow>
            ))}
          </UserList>
          <ListActions>
            <span role="status">{Math.min(visibleCount, filteredUsers.length)} / {filteredUsers.length}명 표시 · {users.length}명 불러옴</span>
            {filteredUsers.length > visibleCount && <SegmentButton type="button" onClick={() => setVisibleCount(count => count + 50)}>목록 50명 더 표시</SegmentButton>}
            {usersQuery.hasNextPage && <SegmentButton type="button" onClick={() => void usersQuery.fetchNextPage()} disabled={usersQuery.isFetching || saving || controller.refreshing}>{usersQuery.isFetchingNextPage ? '불러오는 중…' : '더 불러오기'}</SegmentButton>}
          </ListActions>
        </UserPanel>

        <DetailPanel ref={detailRef} tabIndex={-1} aria-label="사용자 상세" data-selected-uid={selectedUser?.uid ?? ''}>
          {!selectedUser || !draft ? (
            <EmptyDetail>
              <UserCog size={34} />
              <strong>사용자를 선택하세요</strong>
            </EmptyDetail>
          ) : (
            <>
              <ListActions>
                <SegmentButton type="button" onClick={() => { if (controller.closeEditor()) { listRef.current?.focus(); listRef.current?.scrollIntoView({ block: 'start' }); } }}>상세 닫기 · 목록으로</SegmentButton>
                <span role="status">{dirty ? '저장하지 않은 변경 사항' : '저장된 상태'}</span>
              </ListActions>
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

              <Section aria-label="권한 변경 안전 안내">
                <SectionTitle><ShieldCheck size={17} /><strong>변경 이력과 저장 보호</strong></SectionTitle>
                {isFullAdmin && <Link href={`/admin/openrouter-usage?uid=${encodeURIComponent(selectedUser.uid)}`} onNavigate={event => { if (!controller.confirmLeave()) event.preventDefault(); }}>이 사용자의 이미지 예산·비용 확인</Link>}
                <p className="scope-note">마지막 권한 변경: {formatDate(selectedUser.updatedAt)} · 변경자: {selectedUser.updatedBy || '기록 없음'}</p>
                <p className="scope-note">조회한 권한 버전을 기준으로 저장합니다. 다른 관리자가 먼저 변경하면 덮어쓰지 않고, 최신 상태 확인을 요청합니다.</p>
                {isFullAdmin && <Link href={`/admin/activity-logs?action=admin.user.update&q=${encodeURIComponent(selectedUser.uid)}`} onClick={(event) => { if (!controller.confirmLeave()) event.preventDefault(); }}>이 사용자의 권한 변경 이력 보기</Link>}
              </Section>
              {!canEditSelectedUser && <p className="scope-note">{controller.refreshing ? '서버 상태 확인 중에는 편집할 수 없습니다.' : '위임 관리자는 본인 또는 관리자 계정을 수정할 수 없습니다.'}</p>}
              {selectedUser.uid === currentUser.uid && <p className="scope-note">본인 계정의 관리자 강등 및 비활성화는 이 화면에서 할 수 없습니다.</p>}
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
                      aria-pressed={draft.role === role}
                      disabled={!canEditSelectedUser || (!isFullAdmin && role === 'admin') || (selectedUser.uid === currentUser.uid && selectedUser.role === 'admin' && role !== 'admin')}
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
                    const checked = draft.role === 'admin' || (draft.siteAccess[siteId] ?? siteId !== 'admin');
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
                          aria-label={`${site.name || siteId} 사이트 접근`}
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
                      <MenuAccessModeList role="group" aria-label="사이트 모드별 메뉴">
                        {menuAccessGroups.map((group) => {
                          const selected = group.siteId === selectedMenuAccessGroup.siteId;
                          const checkedCount = draft
                            ? group.options.filter((option) => getDefaultMenuAccess(draft, option)).length
                            : 0;

                          return (
                            <MenuAccessModeButton
                              key={group.siteId}
                              type="button"
                              aria-pressed={selected}
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
                                  aria-label={`${option.text} 메뉴 접근`}
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
                  {USER_PERMISSION_ITEMS.map((item) => {
                    const checked = draft.role === 'admin' || draft.permissions[item.key];
                    return (
                      <PermissionRow key={item.key}>
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.description}</span>
                        </div>
                        <Switch
                          type="button"
                          aria-label={`${item.title} 권한`}
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
                    aria-label="계정 비활성화"
                    aria-pressed={draft.disabled}
                    className={draft.disabled ? 'on danger' : ''}
                    disabled={selectedUser.uid === currentUser?.uid || !canEditSelectedUser}
                    onClick={() =>
                      setDraft((previous) => (previous ? { ...previous, disabled: !previous.disabled } : previous))
                    }
                  />
                </PermissionRow>
              </Section>

              <Section aria-label="변경 요약">
                <strong>변경 요약</strong>
                {summary.length ? <ul>{summary.map(item => <li key={item}>{item}</li>)}</ul> : <p>변경 사항이 없습니다.</p>}
                {(uncertain || saveError) && <p role="alert">{uncertain || saveError}</p>}
                {uncertain && <SegmentButton type="button" disabled={saving || usersQuery.isFetching} onClick={() => void controller.refresh()}>새로고침으로 저장 상태 확인</SegmentButton>}
              </Section>
              <ActionBar>
                <span>마지막 수정: {formatDate(selectedUser.updatedAt)}</span>
                <SegmentButton type="button" onClick={controller.discardDraft} disabled={!dirty || saving || controller.refreshing}>초안 폐기</SegmentButton>
                <SaveButton type="button" onClick={() => void handleSave()} disabled={saving || usersQuery.isFetching || !canEditSelectedUser || !dirty || Boolean(uncertain) || storage?.canPersist === false}>
                  {saving ? <RefreshCw size={17} /> : <Save size={17} />}
                  {saving ? '저장 중…' : '변경 사항 저장'}
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
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  background: #f5f7fb;
  color: #17211d;
  & > * { flex-shrink: 0; }
  button, select, input, a { min-height: 44px; }
  button, a { touch-action: manipulation; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, [tabindex="-1"]:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
  button:disabled { cursor: not-allowed; opacity: .6; }
  a { display: inline-flex; align-items: center; padding: 0 10px; color: #0f766e; font-weight: 800; }
  .scope-note { margin: 10px 28px; color: #52645e; line-height: 1.5; }
  .disabled-badge { color: #b91c1c; font-weight: 800; }
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
  width: 44px;
  height: 44px;
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
  flex: 0 0 auto;
  min-height: 0;
  padding: 0 28px 24px;
  display: grid;
  grid-template-columns: minmax(300px, 390px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
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

  @media (max-width: 980px) {
    min-height: 320px;
  }
`;

const DetailPanel = styled.section`
  min-height: 0;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  overflow: visible;
  min-width: 0;

  @media (max-width: 980px) {
    min-height: 200px;
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
    color: #52645e;
    font-size: 0.78rem;
    font-weight: 800;
  }
`;

const FilterBar = styled.div`
  padding: 12px 14px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.08);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(100px, .65fr);
  gap: 8px;

  select {
    min-width: 0;
    height: 44px;
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
  height: 44px;
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
    color: #52645e;
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
    color: #52645e;
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
    color: #52645e;
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
  min-height: 44px;
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
    height: 44px;
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
    color: #52645e;
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
  min-height: 44px;
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
    opacity: 1;
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
    color: #52645e;
    font-size: 0.72rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
`;

const EmptyMenuAccess = styled.div`
  min-height: 44px;
  border: 1px dashed rgba(23, 33, 29, 0.14);
  border-radius: 8px;
  color: #52645e;
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
    color: #52645e;
    font-size: 0.76rem;
    line-height: 1.35;
  }
`;

const Switch = styled.button`
  width: 48px;
  height: 44px;
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
    top: 13px;
    left: 5px;
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
    transform: translateX(20px);
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
  flex-wrap: wrap;
  border-top: 1px solid rgba(23, 33, 29, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #ffffff;

  span {
    color: #52645e;
    font-size: 0.78rem;
    font-weight: 800;
  }

  @media (max-width: 980px) {
    padding-right: 18px;
  }

  @media (max-width: 640px) {
    padding: 12px;
    flex-direction: column;
    align-items: stretch;

    span {
      line-height: 1.35;
    }
  }
`;

const SaveButton = styled.button`
  min-width: 96px;
  min-height: 44px;
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

  @media (max-width: 640px) {
    width: 100%;
  }
`;

const EmptyState = styled.div`
  padding: 22px 12px;
  color: #52645e;
  text-align: center;
  font-size: 0.86rem;
  font-weight: 800;
`;

const EmptyDetail = styled.div`
  margin: auto;
  color: #52645e;
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
    min-height: 44px;
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

const ListActions = styled.div`
  padding: 12px 14px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #e2e8f0;
  span { color: #52645e; font-size: .8rem; }
  button { padding: 8px 12px; }
`;
