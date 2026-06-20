import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconName } from '@fortawesome/fontawesome-svg-core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MenuItem } from '@/types/menu';

interface MenuItemNodeProps {
  item: MenuItem;
  depth: number;
  isSelected: boolean;
  onSelect: (item: MenuItem) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const MenuItemNode: React.FC<MenuItemNodeProps> = ({
  item,
  depth,
  isSelected,
  onSelect,
  onToggle,
  onDelete,
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
    data: { item, type: item.type },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasChildren = item.sub && item.sub.length > 0;
  const isExpanded = item.expanded;

  const getIcon = (): IconName => {
    if (item.type === 'divider') return 'minus';
    if (item.icon) return item.icon as IconName;
    if (item.type === 'folder') return 'folder';
    return 'link';
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(item);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(item.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(item.id);
  };

  if (item.type === 'divider') {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
          backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
          borderColor: isSelected ? 'var(--primary)' : 'transparent',
        }}
        {...attributes}
        {...listeners}
        className="group flex items-center gap-2 py-2 px-3 rounded-lg cursor-move transition-all border-2 hover:bg-[var(--bg-elevated)]"
        onClick={handleClick}
      >
        <div className="flex-1 flex items-center gap-2">
          <FontAwesomeIcon
            icon={['fas', 'minus']}
            className="w-4 h-4"
            style={{ color: 'var(--text-dim)' }}
          />
          <div
            className="flex-1 h-px"
            style={{ backgroundColor: 'var(--border-medium)' }}
          />
        </div>

        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg transition-all hover:scale-110"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444'
          }}
          title="삭제"
        >
          <FontAwesomeIcon icon={['fas', 'trash']} className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div
        {...attributes}
        {...listeners}
        className="group flex items-center gap-2 py-2.5 px-3 rounded-xl cursor-move transition-all border-2"
        onClick={handleClick}
        style={{
          backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
          borderColor: isSelected ? 'var(--primary)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {hasChildren && (
          <button
            onClick={handleToggle}
            className="p-1.5 rounded-lg transition-all hover:scale-110"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <FontAwesomeIcon
              icon={['fas', isExpanded ? 'chevron-down' : 'chevron-right']}
              className="w-3 h-3"
              style={{ color: 'var(--text-muted)' }}
            />
          </button>
        )}
        {!hasChildren && <div className="w-7" />}

        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: item.type === 'folder'
              ? 'rgba(251, 191, 36, 0.15)'
              : 'rgba(99, 102, 241, 0.15)'
          }}
        >
          <FontAwesomeIcon
            icon={['fas', getIcon()]}
            className="w-4 h-4"
            style={{
              color: item.type === 'folder' ? '#fbbf24' : 'var(--accent)'
            }}
          />
        </div>

        <span className="flex-1 font-medium" style={{ color: 'var(--text-main)' }}>
          {item.text}
        </span>

        {item.path && (
          <span
            className="text-xs px-2 py-1 rounded-lg font-mono"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
            }}
          >
            {item.path}
          </span>
        )}

        {item.roles && item.roles.length > 0 && (
          <div className="flex gap-1">
            {item.roles.map((role) => (
              <span
                key={role}
                className="text-xs px-2 py-1 rounded-lg font-medium"
                style={{
                  backgroundColor: 'rgba(139, 92, 246, 0.15)',
                  color: '#8b5cf6',
                }}
              >
                {role}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-2.5 rounded-lg transition-all hover:scale-110 ml-2"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444'
          }}
          title="삭제"
        >
          <FontAwesomeIcon icon={['fas', 'trash']} className="w-4 h-4" />
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div
          className="ml-10 mt-1 space-y-1 pl-4 border-l-2"
          style={{ borderColor: 'var(--border-medium)' }}
        >
          {item.sub!.map((subItem) => {
            if (typeof subItem === 'string') return null;
            return (
              <MenuItemNode
                key={subItem.id}
                item={subItem}
                depth={depth + 1}
                isSelected={isSelected}
                onSelect={onSelect}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
