import React, { useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MenuItem } from '@/types/menu';
import type { MenuMoveDirection } from './menuTreeUtils';

interface MenuCanvasProps {
  menu: MenuItem[];
  selectedItem: MenuItem | null;
  onSelect: (item: MenuItem) => void;
  onReorder: (items: MenuItem[]) => void;
  onToggle: (id: string) => void;
  onMoveItem?: (id: string, direction: MenuMoveDirection) => void;
  onAddChild?: (parentId: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

interface MenuStats {
  total: number;
  links: number;
  folders: number;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  user: '사용자',
  partner: '파트너',
  guest: '게스트',
};

function isMenuItemEntry(item: MenuItem | string | undefined): item is MenuItem {
  return Boolean(item) && typeof item !== 'string';
}

function getMoveCapabilities(siblings: Array<MenuItem | string>, index: number, depth: number) {
  const current = siblings[index];
  const previous = siblings[index - 1];
  const next = siblings[index + 1];

  return {
    canMoveUp: isMenuItemEntry(previous),
    canMoveDown: isMenuItemEntry(next),
    canIndent: isMenuItemEntry(current) && current.type !== 'divider' && isMenuItemEntry(previous) && previous.type !== 'divider',
    canOutdent: depth > 0,
  };
}

function getMenuStats(items: MenuItem[]): MenuStats {
  return items.reduce<MenuStats>(
    (stats, item) => {
      const nextStats = {
        total: stats.total + 1,
        links: stats.links + (item.type === 'link' ? 1 : 0),
        folders: stats.folders + (item.type === 'folder' ? 1 : 0),
      };

      if (!item.sub) return nextStats;

      return item.sub.reduce<MenuStats>((nestedStats, subItem) => {
        if (typeof subItem === 'string') return nestedStats;
        const subStats = getMenuStats([subItem]);
        return {
          total: nestedStats.total + subStats.total,
          links: nestedStats.links + subStats.links,
          folders: nestedStats.folders + subStats.folders,
        };
      }, nextStats);
    },
    { total: 0, links: 0, folders: 0 },
  );
}

const MenuItemRow: React.FC<{
  item: MenuItem;
  selectedItemId: string | null;
  onSelect: (item: MenuItem) => void;
  onToggle: (id: string) => void;
  onMoveItem?: (id: string, direction: MenuMoveDirection) => void;
  onAddChild?: (parentId: string) => void;
  onDelete?: (id: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  depth?: number;
}> = ({
  item,
  selectedItemId,
  onSelect,
  onToggle,
  onMoveItem,
  onAddChild,
  onDelete,
  canMoveUp,
  canMoveDown,
  canIndent,
  canOutdent,
  depth = 0,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: depth > 0,
  });

  const isSelected = selectedItemId === item.id;
  const hasChildren = Boolean(item.sub && item.sub.length > 0);
  const itemLabel = item.text?.trim() || '이름 없는 메뉴';
  const isDivider = item.type === 'divider';

  const style = {
    transform: depth === 0 ? CSS.Transform.toString(transform) : undefined,
    transition: depth === 0 ? transition : undefined,
    opacity: isDragging ? 0.58 : 1,
    '--menu-depth': depth,
  } as React.CSSProperties;

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(item);
  };

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDelete?.(item.id);
  };

  const handleMove = (direction: MenuMoveDirection) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onMoveItem?.(item.id, direction);
  };

  const handleAddChild = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onAddChild?.(item.id);
  };

  const canAddChild = item.type !== 'divider';
  const actions = (
    <span className="admin-menu-row-actions" aria-label={`${itemLabel} 빠른 작업`}>
      <button
        type="button"
        className="admin-menu-row-action"
        onClick={handleMove('up')}
        disabled={!onMoveItem || !canMoveUp}
        aria-label={`${itemLabel} 위로 이동`}
        title="위로 이동"
      >
        <i className="fa fa-arrow-up" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="admin-menu-row-action"
        onClick={handleMove('down')}
        disabled={!onMoveItem || !canMoveDown}
        aria-label={`${itemLabel} 아래로 이동`}
        title="아래로 이동"
      >
        <i className="fa fa-arrow-down" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="admin-menu-row-action"
        onClick={handleMove('indent')}
        disabled={!onMoveItem || !canIndent}
        aria-label={`${itemLabel} 하위로 이동`}
        title="하위로 이동"
      >
        <i className="fa fa-turn-down" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="admin-menu-row-action"
        onClick={handleMove('outdent')}
        disabled={!onMoveItem || !canOutdent}
        aria-label={`${itemLabel} 상위로 이동`}
        title="상위로 이동"
      >
        <i className="fa fa-turn-up" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="admin-menu-row-action"
        onClick={handleAddChild}
        disabled={!onAddChild || !canAddChild}
        aria-label={`${itemLabel} 하위 메뉴 추가`}
        title="하위 메뉴 추가"
      >
        <i className="fa fa-plus" aria-hidden="true" />
      </button>
      {onDelete ? (
        <button
          type="button"
          className="admin-menu-row-action is-danger"
          onClick={handleDelete}
          aria-label={`${itemLabel} 삭제`}
          title="삭제"
        >
          <i className="fa fa-trash" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );

  if (isDivider) {
    return (
      <div
        ref={setNodeRef}
        className={`admin-menu-row admin-menu-divider-row ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
        style={style}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => onSelect(item)}
        onKeyDown={handleRowKeyDown}
      >
        {depth === 0 ? (
          <button
            type="button"
            className="admin-menu-drag-handle"
            aria-label={`${itemLabel} 순서 이동`}
            title="드래그해서 순서 변경"
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <i className="fa fa-grip-vertical" aria-hidden="true" />
          </button>
        ) : (
          <span className="admin-menu-drag-placeholder" aria-hidden="true" />
        )}
        <span className="admin-menu-divider-line" aria-hidden="true" />
        <span className="admin-menu-divider-label">구분선</span>
        {actions}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`admin-menu-row ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => onSelect(item)}
        onKeyDown={handleRowKeyDown}
      >
        {depth === 0 ? (
          <button
            type="button"
            className="admin-menu-drag-handle"
            aria-label={`${itemLabel} 순서 이동`}
            title="드래그해서 순서 변경"
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <i className="fa fa-grip-vertical" aria-hidden="true" />
          </button>
        ) : (
          <span className="admin-menu-drag-placeholder" aria-hidden="true" />
        )}

        {hasChildren ? (
          <button
            type="button"
            className="admin-menu-expand"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(item.id);
            }}
            aria-label={`${itemLabel} 하위 메뉴 ${item.expanded ? '접기' : '펼치기'}`}
            aria-expanded={Boolean(item.expanded)}
          >
            <i className={`fa fa-chevron-${item.expanded ? 'down' : 'right'}`} aria-hidden="true" />
          </button>
        ) : (
          <span className="admin-menu-expand-placeholder" aria-hidden="true" />
        )}

        <span className={`admin-menu-row-icon is-${item.type || 'link'}`} aria-hidden="true">
          <i className={`fa fa-${item.icon || (item.type === 'folder' ? 'folder' : 'link')}`} />
        </span>

        <span className="admin-menu-row-main">
          <span className="admin-menu-row-title">{itemLabel}</span>
          {item.path ? <span className="admin-menu-row-path">{item.path}</span> : null}
        </span>

        {item.roles && item.roles.length > 0 ? (
          <span className="admin-menu-role-list" aria-label={`접근 권한 ${item.roles.join(', ')}`}>
            {item.roles.map((role) => (
              <span key={role} className="admin-menu-role-chip">
                {ROLE_LABELS[role] || role}
              </span>
            ))}
          </span>
        ) : null}

        {actions}
      </div>

      {hasChildren && item.expanded ? (
        <div className="admin-menu-subtree">
          {item.sub!.map((subItem, subIndex) => {
            if (typeof subItem === 'string') return null;
            const capabilities = getMoveCapabilities(item.sub!, subIndex, depth + 1);
            return (
              <MenuItemRow
                key={subItem.id}
                item={subItem}
                selectedItemId={selectedItemId}
                onSelect={onSelect}
                onToggle={onToggle}
                onMoveItem={onMoveItem}
                onAddChild={onAddChild}
                onDelete={onDelete}
                {...capabilities}
                depth={depth + 1}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const MenuCanvas: React.FC<MenuCanvasProps> = ({
  menu,
  selectedItem,
  onSelect,
  onReorder,
  onToggle,
  onMoveItem,
  onAddChild,
  onDelete,
  className = '',
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );
  const stats = useMemo(() => getMenuStats(menu), [menu]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = menu.findIndex((menuItem) => menuItem.id === activeId);
    const newIndex = menu.findIndex((menuItem) => menuItem.id === overId);

    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      onReorder(arrayMove(menu, oldIndex, newIndex));
    }
  };

  return (
    <main className={`admin-menu-canvas admin-menu-panel ${className}`.trim()} aria-label="메뉴 구조 편집">
      <div className="admin-menu-canvas-head">
        <div>
          <h2>메뉴 구조</h2>
          <p>핸들을 잡고 끌어서 노출 순서를 조정합니다.</p>
        </div>
        <div className="admin-menu-stats" aria-label={`총 ${stats.total}개 메뉴, 링크 ${stats.links}개, 폴더 ${stats.folders}개`}>
          <span>{stats.total}개</span>
          <span>링크 {stats.links}</span>
          <span>폴더 {stats.folders}</span>
        </div>
      </div>

      {menu.length === 0 ? (
        <div className="admin-menu-empty">
          <i className="fa fa-folder-plus" aria-hidden="true" />
          <strong>등록된 메뉴가 없습니다</strong>
          <span>도구 탭에서 폴더, 링크 또는 페이지 메뉴를 추가해 주세요.</span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={menu.map((menuItem) => menuItem.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="admin-menu-list">
              {menu.map((item, index) => {
                const capabilities = getMoveCapabilities(menu, index, 0);

                return (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    selectedItemId={selectedItem?.id || null}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    onMoveItem={onMoveItem}
                    onAddChild={onAddChild}
                    onDelete={onDelete}
                    {...capabilities}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </main>
  );
};
