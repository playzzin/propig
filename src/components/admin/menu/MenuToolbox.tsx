import React, { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconName } from '@fortawesome/fontawesome-svg-core';
import { useForm, useWatch } from 'react-hook-form';
import { MenuItem } from '@/types/menu';
import { menuService } from '@/services/menuService';
import { getMenuPageIcon, MENU_PAGE_OPTIONS, MenuPageOption } from '@/constants/menuPages';
import { PageOptionPreview } from './PageOptionPreview';
import {
  menuToolboxFormSchema,
  type MenuToolboxFormValues,
} from '@/schemas/menuToolboxSchema';
import type { MenuParentOption } from './menuTreeUtils';

interface MenuToolboxProps {
  onAddItem: (item: MenuItem, parentId?: string) => void;
  registeredPaths?: string[];
  parentOptions?: MenuParentOption[];
  className?: string;
}

interface ToolItemProps {
  icon: IconName;
  label: string;
  description: string;
  onClick: () => void;
}

function formatPageOption(page: MenuPageOption): string {
  return `${page.group} / ${page.label}`;
}

function matchesPageQuery(page: MenuPageOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    page.group,
    page.label,
    page.path,
    ...(page.keywords || []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

const ToolItem: React.FC<ToolItemProps> = ({
  icon,
  label,
  description,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="admin-menu-tool"
      aria-label={`${label} 추가`}
      title={description}
    >
      <span className="admin-menu-tool-icon" aria-hidden="true">
        <i className={`fa fa-${icon}`} />
      </span>
      <span className="admin-menu-tool-copy">
        <span className="admin-menu-tool-title">{label}</span>
        <span className="admin-menu-tool-desc">{description}</span>
      </span>
    </button>
  );
};

export const MenuToolbox: React.FC<MenuToolboxProps> = ({
  onAddItem,
  registeredPaths = [],
  parentOptions = [],
  className = '',
}) => {
  const [pageQuery, setPageQuery] = useState('');
  const [targetParentId, setTargetParentId] = useState('');
  const registeredPathSet = useMemo(() => new Set(registeredPaths), [registeredPaths]);
  const availablePages = useMemo(
    () =>
      MENU_PAGE_OPTIONS.filter((page) => !registeredPathSet.has(page.path))
        .filter((page) => matchesPageQuery(page, pageQuery)),
    [pageQuery, registeredPathSet],
  );

  const form = useForm<MenuToolboxFormValues>({
    resolver: zodResolver(menuToolboxFormSchema),
    defaultValues: {
      selectedPagePath: '',
      customLabel: '',
    },
    mode: 'onBlur',
  });

  const watchedPagePath = useWatch({
    control: form.control,
    name: 'selectedPagePath',
  });
  const selectedPagePreview = useMemo(
    () => MENU_PAGE_OPTIONS.find((page) => page.path === watchedPagePath),
    [watchedPagePath],
  );
  const targetParentOption = useMemo(
    () => parentOptions.find((option) => option.id === targetParentId),
    [parentOptions, targetParentId],
  );

  useEffect(() => {
    if (!targetParentId) return;
    if (targetParentOption) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setTargetParentId('');
    });

    return () => {
      cancelled = true;
    };
  }, [targetParentId, targetParentOption]);

  const createItem = (type: 'folder' | 'link' | 'divider') => {
    const newItem: MenuItem = {
      id: menuService.generateId(),
      text: type === 'divider' ? '구분선' : '새 메뉴',
      type,
      icon: type === 'folder' ? 'folder' : type === 'link' ? 'link' : undefined,
      roles: [],
      sub: type === 'folder' ? [] : undefined,
    };
    onAddItem(newItem, targetParentId || undefined);
  };

  const handleRegisterPageMenu = form.handleSubmit(({ selectedPagePath, customLabel }) => {
    const selectedPage = MENU_PAGE_OPTIONS.find((page) => page.path === selectedPagePath);
    if (!selectedPage || registeredPathSet.has(selectedPage.path)) return;

    onAddItem(
      {
        id: menuService.generateId(),
        text: customLabel.trim() || selectedPage.label,
        type: 'link',
        icon: getMenuPageIcon(selectedPage),
        path: selectedPage.path,
        roles: [],
      },
      targetParentId || undefined,
    );

    form.reset({
      selectedPagePath: '',
      customLabel: '',
    });
    setPageQuery('');
  });

  return (
    <aside className={`admin-menu-toolbox admin-menu-panel ${className}`.trim()} aria-label="메뉴 도구">
      <div className="admin-menu-panel-heading">
        <i className="fa fa-toolbox" aria-hidden="true" />
        <span>도구</span>
      </div>

      <label className="admin-menu-field admin-menu-target-field">
        <span>등록 위치</span>
        <select
          name="targetParentId"
          value={targetParentId}
          onChange={(event) => setTargetParentId(event.target.value)}
        >
          <option value="">최상위 메뉴</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {`${'-- '.repeat(option.depth)}${option.label}`}
            </option>
          ))}
        </select>
      </label>

      <div className="admin-menu-tool-list">
        <ToolItem icon="folder" label="폴더" description="하위 메뉴를 담는 컨테이너" onClick={() => createItem('folder')} />
        <ToolItem icon="link" label="링크" description="한 페이지로 이동하는 메뉴" onClick={() => createItem('link')} />
        <ToolItem icon="minus" label="구분선" description="메뉴 그룹을 나누는 선" onClick={() => createItem('divider')} />
      </div>

      <form className="admin-menu-register" onSubmit={handleRegisterPageMenu}>
        <div className="admin-menu-register-title">
          <i className="fa fa-plus" aria-hidden="true" />
          <span>페이지 메뉴 등록</span>
        </div>

        <label className="admin-menu-field">
          <span>페이지 검색</span>
          <input
            type="search"
            name="pageSearch"
            value={pageQuery}
            onChange={(event) => setPageQuery(event.target.value)}
            autoComplete="off"
            placeholder="이름, 경로, 키워드로 검색…"
          />
        </label>

        <label className="admin-menu-field">
          <span>등록할 페이지</span>
          <select
            {...form.register('selectedPagePath')}
            aria-invalid={Boolean(form.formState.errors.selectedPagePath)}
          >
            <option value="">
              {availablePages.length === 0 ? '등록 가능한 페이지가 없습니다' : '페이지를 선택해 주세요'}
            </option>
            {availablePages.map((page) => (
              <option key={page.path} value={page.path}>
                {formatPageOption(page)} · {page.path}
              </option>
            ))}
          </select>
        </label>
        {selectedPagePreview ? <PageOptionPreview page={selectedPagePreview} /> : null}
        {form.formState.errors.selectedPagePath?.message ? (
          <div className="admin-menu-field-error" aria-live="polite">
            {form.formState.errors.selectedPagePath.message}
          </div>
        ) : null}

        <label className="admin-menu-field">
          <span>메뉴명</span>
          <input
            type="text"
            {...form.register('customLabel')}
            autoComplete="off"
            placeholder="비우면 페이지명이 적용됩니다…"
            aria-invalid={Boolean(form.formState.errors.customLabel)}
          />
        </label>
        {form.formState.errors.customLabel?.message ? (
          <div className="admin-menu-field-error" aria-live="polite">
            {form.formState.errors.customLabel.message}
          </div>
        ) : null}

        <button
          type="submit"
          className="admin-menu-submit"
          disabled={!watchedPagePath || availablePages.length === 0}
        >
          선택한 페이지 등록
        </button>
      </form>

      <section className="admin-menu-help" aria-label="사용 방법">
        <div className="admin-menu-help-title">
          <i className="fa fa-circle-info" aria-hidden="true" />
          <span>사용 방법</span>
        </div>
        <ul>
          <li>기본 메뉴는 위 도구 버튼으로 추가합니다.</li>
          <li>페이지 메뉴는 검색 후 한 번에 등록합니다.</li>
          <li>메뉴 목록의 핸들을 잡아 순서를 바꿉니다.</li>
          <li>자동 저장 상태는 상단에서 확인합니다.</li>
        </ul>
      </section>
    </aside>
  );
};
