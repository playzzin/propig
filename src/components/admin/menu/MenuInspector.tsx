import React, { useMemo, useState } from 'react';
import { MenuItem } from '@/types/menu';
import { getMenuPageIcon, MENU_PAGE_OPTIONS, MenuPageOption } from '@/constants/menuPages';
import { USER_PERMISSION_ITEMS, type ManagedUserPermissionKey } from '@/types/userAccess';
import { PageOptionPreview } from './PageOptionPreview';

interface MenuInspectorProps {
  selectedItem: MenuItem | null;
  onUpdate: (item: MenuItem) => void;
  onDelete: () => void;
  className?: string;
}

interface IconOption {
  value: string;
  label: string;
  keywords: string[];
}

const ICON_OPTIONS: IconOption[] = [
  { value: 'house', label: '홈', keywords: ['home', 'main', 'site'] },
  { value: 'shield-halved', label: '관리', keywords: ['admin', 'security'] },
  { value: 'bars', label: '메뉴', keywords: ['menu', 'navigation'] },
  { value: 'list', label: '목록', keywords: ['list', 'todo'] },
  { value: 'list-check', label: '체크목록', keywords: ['task', 'todo', 'check'] },
  { value: 'folder', label: '폴더', keywords: ['folder', 'group'] },
  { value: 'folder-open', label: '열린 폴더', keywords: ['folder', 'open'] },
  { value: 'link', label: '링크', keywords: ['link', 'url'] },
  { value: 'file', label: '파일', keywords: ['file', 'document'] },
  { value: 'book-open', label: '설명서', keywords: ['manual', 'guide', 'help'] },
  { value: 'clipboard-list', label: '클립보드', keywords: ['clipboard', 'project'] },
  { value: 'note-sticky', label: '메모', keywords: ['memo', 'sticky', 'note'] },
  { value: 'bookmark', label: '북마크', keywords: ['bookmark', 'favorite'] },
  { value: 'tag', label: '태그', keywords: ['tag', 'label'] },
  { value: 'star', label: '별', keywords: ['star', 'favorite'] },
  { value: 'heart', label: '하트', keywords: ['heart', 'like'] },
  { value: 'bell', label: '알림', keywords: ['bell', 'notification'] },
  { value: 'search', label: '검색', keywords: ['search', 'find'] },
  { value: 'gear', label: '설정', keywords: ['setting', 'system', 'cog'] },
  { value: 'gears', label: '시스템', keywords: ['settings', 'system'] },
  { value: 'key', label: '키', keywords: ['key', 'auth'] },
  { value: 'lock', label: '잠금', keywords: ['lock', 'security'] },
  { value: 'user', label: '사용자', keywords: ['user', 'person'] },
  { value: 'users', label: '사용자들', keywords: ['team', 'users'] },
  { value: 'user-shield', label: '권한', keywords: ['permission', 'admin'] },
  { value: 'user-gear', label: '계정 설정', keywords: ['account', 'setting'] },
  { value: 'user-tie', label: '대표', keywords: ['ceo', 'executive'] },
  { value: 'user-graduate', label: '인재', keywords: ['talent', 'career'] },
  { value: 'user-plus', label: '채용', keywords: ['hire', 'career'] },
  { value: 'building', label: '기업', keywords: ['company', 'corp'] },
  { value: 'store', label: '워크스페이스', keywords: ['workspace', 'store'] },
  { value: 'briefcase', label: '업무', keywords: ['business', 'work'] },
  { value: 'handshake', label: '제휴', keywords: ['partner', 'business'] },
  { value: 'hands-holding-heart', label: '공헌', keywords: ['social', 'contribution'] },
  { value: 'bullhorn', label: '광고', keywords: ['advertising', 'announce'] },
  { value: 'chart-line', label: '통계', keywords: ['chart', 'analytics', 'stats'] },
  { value: 'bullseye', label: '목표', keywords: ['goal', 'target'] },
  { value: 'calendar', label: '달력', keywords: ['date', 'calendar'] },
  { value: 'calendar-check', label: '습관', keywords: ['habit', 'routine'] },
  { value: 'clock', label: '시간', keywords: ['time', 'history'] },
  { value: 'circle-play', label: '영상', keywords: ['video', 'play', 'youtube'] },
  { value: 'images', label: '사진', keywords: ['photo', 'image', 'gallery'] },
  { value: 'wand-magic-sparkles', label: 'AI 생성', keywords: ['ai', 'magic', 'generate'] },
  { value: 'diagram-project', label: '프로젝트', keywords: ['project', 'diagram'] },
  { value: 'lightbulb', label: '아이디어', keywords: ['idea', 'vision'] },
  { value: 'microchip', label: '기술', keywords: ['technology', 'chip'] },
  { value: 'eye', label: '비전', keywords: ['vision', 'view'] },
  { value: 'globe', label: '글로벌', keywords: ['global', 'site'] },
  { value: 'hard-drive', label: '저장소', keywords: ['storage', 'drive'] },
  { value: 'box-open', label: '박스', keywords: ['box', 'package'] },
  { value: 'cart-shopping', label: '목록', keywords: ['cart', 'list'] },
  { value: 'cash-register', label: '기록', keywords: ['log', 'record'] },
  { value: 'truck', label: '진행', keywords: ['progress', 'flow'] },
  { value: 'rotate-left', label: '되돌아보기', keywords: ['review', 'undo'] },
  { value: 'calculator', label: '계산', keywords: ['tax', 'calculate'] },
  { value: 'dollar-sign', label: '금액', keywords: ['money', 'sales'] },
  { value: 'envelope', label: '메일', keywords: ['mail', 'message'] },
  { value: 'phone', label: '전화', keywords: ['phone', 'contact'] },
  { value: 'paper-plane', label: '지원', keywords: ['apply', 'send'] },
  { value: 'gift', label: '후원', keywords: ['gift', 'sponsor'] },
  { value: 'plus', label: '추가', keywords: ['add', 'plus'] },
  { value: 'minus', label: '구분선', keywords: ['minus', 'divider'] },
  { value: 'check', label: '확인', keywords: ['check', 'done'] },
  { value: 'xmark', label: '닫기', keywords: ['close', 'x'] },
  { value: 'pen-to-square', label: '편집', keywords: ['edit', 'pen'] },
  { value: 'trash', label: '삭제', keywords: ['delete', 'trash'] },
  { value: 'circle-info', label: '안내', keywords: ['info', 'help'] },
];

const AVAILABLE_ROLES = ['admin', 'user', 'partner', 'guest'];
const AVAILABLE_PERMISSIONS: Array<{ key: ManagedUserPermissionKey; label: string }> =
  USER_PERMISSION_ITEMS.map(({ key, title }) => ({ key, label: title }));

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  user: '사용자',
  partner: '파트너',
  guest: '게스트',
};

const TYPE_LABELS: Record<NonNullable<MenuItem['type']>, string> = {
  folder: '폴더',
  link: '링크',
  divider: '구분선',
};

function formatPageOption(page: MenuPageOption): string {
  return `${page.group} / ${page.label}`;
}

function matchesIconQuery(option: IconOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    option.value,
    option.label,
    ...option.keywords,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

export const MenuInspector: React.FC<MenuInspectorProps> = ({
  selectedItem,
  onUpdate,
  onDelete,
  className = '',
}) => {
  const [pageQuery, setPageQuery] = useState('');
  const [iconQuery, setIconQuery] = useState('');

  const filteredPages = useMemo(() => {
    const query = pageQuery.trim().toLowerCase();
    if (!query) return MENU_PAGE_OPTIONS;

    return MENU_PAGE_OPTIONS.filter((page) =>
      [
        page.group,
        page.label,
        page.path,
        ...(page.keywords || []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [pageQuery]);
  const filteredIcons = useMemo(
    () => ICON_OPTIONS.filter((option) => matchesIconQuery(option, iconQuery)),
    [iconQuery],
  );

  if (!selectedItem) {
    return (
      <aside className={`admin-menu-inspector admin-menu-panel is-empty ${className}`.trim()} aria-label="메뉴 상세 편집">
        <div className="admin-menu-empty">
          <i className="fa fa-hand-pointer" aria-hidden="true" />
          <strong>메뉴를 선택하세요</strong>
          <span>선택한 메뉴의 이름, 경로, 권한을 여기서 수정합니다.</span>
        </div>
      </aside>
    );
  }

  const localItem = selectedItem;
  const labelPrefix = `menu-${localItem.id}`;
  const selectedIcon = localItem.icon || '';
  const selectedIconOption = ICON_OPTIONS.find((option) => option.value === selectedIcon);

  const handleChange = <K extends keyof MenuItem>(field: K, value: MenuItem[K]) => {
    const updated = { ...localItem, [field]: value };
    onUpdate(updated);
  };

  const handleTypeChange = (type: NonNullable<MenuItem['type']>) => {
    const updated: MenuItem = {
      ...localItem,
      type,
      sub: type === 'folder' ? localItem.sub || [] : localItem.sub,
    };
    onUpdate(updated);
  };

  const handleRoleToggle = (role: string) => {
    const currentRoles = localItem.roles || [];
    const updated = currentRoles.includes(role)
      ? currentRoles.filter((currentRole) => currentRole !== role)
      : [...currentRoles, role];
    handleChange('roles', updated);
  };

  const handlePermissionToggle = (permission: ManagedUserPermissionKey) => {
    const currentPermissions = localItem.permissions || [];
    const updated = currentPermissions.includes(permission)
      ? currentPermissions.filter((currentPermission) => currentPermission !== permission)
      : [...currentPermissions, permission];
    handleChange('permissions', updated);
  };

  const handlePageSelect = (path: string) => {
    const selectedPage = MENU_PAGE_OPTIONS.find((page) => page.path === path);
    const shouldUsePageLabel = !localItem.text.trim() || localItem.text === '새 메뉴';
    const shouldUsePageIcon = !localItem.icon || localItem.icon === 'link';
    const updated = {
      ...localItem,
      path,
      text: shouldUsePageLabel && selectedPage ? selectedPage.label : localItem.text,
      icon: shouldUsePageIcon && selectedPage ? getMenuPageIcon(selectedPage) : localItem.icon,
    };
    setPageQuery('');
    onUpdate(updated);
  };
  const selectedPagePreview = MENU_PAGE_OPTIONS.find((page) => page.path === localItem.path);

  return (
    <aside className={`admin-menu-inspector admin-menu-panel ${className}`.trim()} aria-label="메뉴 상세 편집">
      <div className="admin-menu-inspector-head">
        <div>
          <h2>상세 편집</h2>
          <p>{localItem.text || '이름 없는 메뉴'}</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="admin-menu-danger"
          aria-label={`${localItem.text || '선택한 메뉴'} 삭제`}
        >
          <i className="fa fa-trash" aria-hidden="true" />
          <span>삭제</span>
        </button>
      </div>

      <div className="admin-menu-inspector-form">
        <fieldset className="admin-menu-fieldset">
          <legend>유형</legend>
          <div className="admin-menu-segmented">
            {(['folder', 'link', 'divider'] as const).map((type) => {
              const isActive = (localItem.type || 'link') === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={isActive ? 'is-active' : ''}
                  aria-pressed={isActive}
                >
                  {TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {localItem.type !== 'divider' ? (
          <>
            <label className="admin-menu-field" htmlFor={`${labelPrefix}-text`}>
              <span>메뉴명</span>
              <input
                id={`${labelPrefix}-text`}
                name="menuText"
                type="text"
                value={localItem.text}
                onChange={(event) => handleChange('text', event.target.value)}
                autoComplete="off"
              />
            </label>

            <fieldset className="admin-menu-fieldset admin-menu-icon-picker-fieldset">
              <legend>아이콘</legend>
              <div className="admin-menu-icon-picker">
                <div className="admin-menu-icon-preview" aria-live="polite">
                  <span className={`admin-menu-icon-preview-mark ${selectedIcon ? '' : 'is-empty'}`.trim()} aria-hidden="true">
                    <i className={`fa-solid fa-${selectedIcon || 'ban'}`} />
                  </span>
                  <span className="admin-menu-icon-preview-copy">
                    <strong>{selectedIconOption?.label || (selectedIcon ? selectedIcon : '아이콘 없음')}</strong>
                    <code translate="no">{selectedIcon || 'none'}</code>
                  </span>
                </div>

                <label className="admin-menu-field" htmlFor={`${labelPrefix}-icon-search`}>
                  <span>아이콘 검색</span>
                  <input
                    id={`${labelPrefix}-icon-search`}
                    name="menuIconSearch"
                    type="search"
                    value={iconQuery}
                    onChange={(event) => setIconQuery(event.target.value)}
                    autoComplete="off"
                    placeholder="이름, 용도, 아이콘 코드로 검색…"
                  />
                </label>

                <div className="admin-menu-icon-grid" role="radiogroup" aria-label="메뉴 아이콘 선택">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!selectedIcon}
                    className={`admin-menu-icon-option ${!selectedIcon ? 'is-active' : ''}`.trim()}
                    onClick={() => handleChange('icon', undefined)}
                    title="아이콘 없음"
                  >
                    <i className="fa-solid fa-ban" aria-hidden="true" />
                    <span>없음</span>
                  </button>
                  {filteredIcons.map((option) => {
                    const isSelected = selectedIcon === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`admin-menu-icon-option ${isSelected ? 'is-active' : ''}`.trim()}
                        onClick={() => handleChange('icon', option.value)}
                        title={`${option.label} (${option.value})`}
                      >
                        <i className={`fa-solid fa-${option.value}`} aria-hidden="true" />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>

                {filteredIcons.length === 0 ? (
                  <div className="admin-menu-icon-empty" aria-live="polite">
                    검색 결과가 없습니다.
                  </div>
                ) : null}

                <label className="admin-menu-field" htmlFor={`${labelPrefix}-icon`}>
                  <span>직접 입력</span>
                  <input
                    id={`${labelPrefix}-icon`}
                    name="menuIcon"
                    type="text"
                    value={localItem.icon || ''}
                    onChange={(event) => handleChange('icon', event.target.value || undefined)}
                    autoComplete="off"
                    placeholder="font-awesome 아이콘명"
                  />
                </label>
              </div>
            </fieldset>

            {(localItem.type === 'link' || localItem.type === 'folder') ? (
              <>
                <label className="admin-menu-field" htmlFor={`${labelPrefix}-page-search`}>
                  <span>페이지 검색</span>
                  <input
                    id={`${labelPrefix}-page-search`}
                    name="menuPageSearch"
                    type="search"
                    value={pageQuery}
                    onChange={(event) => setPageQuery(event.target.value)}
                    autoComplete="off"
                    placeholder="이름, 경로, 키워드로 검색…"
                  />
                </label>

                <label className="admin-menu-field" htmlFor={`${labelPrefix}-page`}>
                  <span>연결 페이지</span>
                  <select
                    id={`${labelPrefix}-page`}
                    name="menuPage"
                    value={localItem.path || ''}
                    onChange={(event) => handlePageSelect(event.target.value)}
                  >
                    <option value="">페이지를 선택해 주세요</option>
                    {filteredPages.map((page) => (
                      <option key={page.path} value={page.path}>
                        {formatPageOption(page)} · {page.path}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedPagePreview ? <PageOptionPreview page={selectedPagePreview} label="연결 페이지 미리보기" /> : null}

                <label className="admin-menu-field" htmlFor={`${labelPrefix}-path`}>
                  <span>직접 경로</span>
                  <input
                    id={`${labelPrefix}-path`}
                    name="menuPath"
                    type="text"
                    value={localItem.path || ''}
                    onChange={(event) => handleChange('path', event.target.value)}
                    autoComplete="off"
                    inputMode="url"
                    placeholder="/path/to/page…"
                  />
                </label>
              </>
            ) : null}

            <fieldset className="admin-menu-fieldset">
              <legend>접근 권한</legend>
              <div className="admin-menu-role-grid">
                {AVAILABLE_ROLES.map((role) => {
                  const isChecked = (localItem.roles || []).includes(role);
                  return (
                    <label key={role} className={`admin-menu-role-toggle ${isChecked ? 'is-active' : ''}`}>
                      <input
                        type="checkbox"
                        name={`role-${role}`}
                        checked={isChecked}
                        onChange={() => handleRoleToggle(role)}
                      />
                      <span>{ROLE_LABELS[role] || role}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="admin-menu-fieldset">
              <legend>관리 권한</legend>
              <div className="admin-menu-role-grid">
                {AVAILABLE_PERMISSIONS.map((permission) => {
                  const isChecked = (localItem.permissions || []).includes(permission.key);
                  return (
                    <label key={permission.key} className={`admin-menu-role-toggle ${isChecked ? 'is-active' : ''}`}>
                      <input
                        type="checkbox"
                        name={`permission-${permission.key}`}
                        checked={isChecked}
                        onChange={() => handlePermissionToggle(permission.key)}
                      />
                      <span>{permission.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </>
        ) : null}

        <div className="admin-menu-meta">
          <div>
            <span>ID</span>
            <code translate="no">{localItem.id}</code>
          </div>
          {localItem.sub ? (
            <div>
              <span>하위 메뉴</span>
              <strong>{localItem.sub.length}개</strong>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
};
