import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconName } from '@fortawesome/fontawesome-svg-core';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { MenuItem } from '@/types/menu';
import { MenuItemNode } from './MenuItemNode';

interface CanvasProps {
  menu: MenuItem[];
  selectedItem: MenuItem | null;
  onSelect: (item: MenuItem) => void;
  onReorder: (items: MenuItem[]) => void;
  onToggle: (id: string) => void;
  onAddItem?: (item: MenuItem, parentId?: string) => void;
  onDelete?: (id: string) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  menu,
  selectedItem,
  onSelect,
  onReorder,
  onToggle,
  onAddItem,
  onDelete,
}) => {
  const [activeItem, setActiveItem] = React.useState<MenuItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = menu.find((m) => m.id === active.id);
    setActiveItem(item || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    // 새 아이템 추가 (Toolbox에서 드래그)
    if (active.data.current?.isNew) {
      const type = active.data.current.type as 'folder' | 'link' | 'divider';
      const newItem: MenuItem = {
        id: `menu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: type === 'divider' ? '구분선' : '새 메뉴',
        type,
        icon: type === 'folder' ? 'folder' : type === 'link' ? 'link' : undefined,
        roles: ['admin'],
        sub: type === 'folder' ? [] : undefined,
      };

      if (onAddItem) {
        const overIndex = menu.findIndex((m) => m.id === over.id);
        if (overIndex >= 0) {
          const newMenu = [...menu];
          newMenu.splice(overIndex + 1, 0, newItem);
          onReorder(newMenu);
        } else {
          onAddItem(newItem);
        }
      }
      return;
    }

    // 기존 아이템 순서 변경
    if (active.id === over.id) return;

    const oldIndex = menu.findIndex((m) => m.id === active.id);
    const newIndex = menu.findIndex((m) => m.id === over.id);

    if (oldIndex >= 0 && newIndex >= 0) {
      const newMenu = [...menu];
      const [movedItem] = newMenu.splice(oldIndex, 1);
      newMenu.splice(newIndex, 0, movedItem);
      onReorder(newMenu);
    }
  };

  const handleDragCancel = () => {
    setActiveItem(null);
  };

  return (
    <div
      className="flex-1 p-8 overflow-y-auto"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3 mb-2" style={{ color: 'var(--text-bright)' }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                  boxShadow: '0 4px 12px var(--primary-glow)'
                }}
              >
                <FontAwesomeIcon icon={['fas', 'sitemap']} className="text-white w-5 h-5" />
              </div>
              메뉴 구조
            </h2>
            <p className="text-sm ml-13" style={{ color: 'var(--text-muted)' }}>
              드래그로 순서를 변경하고 클릭하여 편집하세요
            </p>
          </div>
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-xl border"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-medium)',
            }}
          >
            <FontAwesomeIcon
              icon={['fas', 'list']}
              style={{ color: 'var(--primary)' }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>
              총 <span className="font-bold" style={{ color: 'var(--primary)' }}>{menu.length}</span>개 항목
            </span>
          </div>
        </div>

        {menu.length === 0 ? (
          <div
            className="relative text-center py-32 border-2 border-dashed rounded-2xl"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-medium)',
            }}
          >
            <div
              className="absolute inset-0 opacity-5 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--accent))'
              }}
            />
            <div className="relative">
              <div
                className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-card))',
                  border: '1px solid var(--border-medium)',
                }}
              >
                <FontAwesomeIcon
                  icon={['fas', 'folder-plus']}
                  className="text-6xl"
                  style={{ color: 'var(--text-dim)' }}
                />
              </div>
              <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-main)' }}>
                메뉴가 비어있습니다
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                좌측 도구 상자에서 메뉴 아이템을 드래그하여 추가하세요
              </p>
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={menu.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <div
                className="space-y-2 p-6 rounded-2xl border shadow-xl"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-medium)',
                }}
              >
                {menu.map((item) => (
                  <MenuItemNode
                    key={item.id}
                    item={item}
                    depth={0}
                    isSelected={selectedItem?.id === item.id}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    onDelete={onDelete || (() => {})}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeItem && (
                <div
                  className="border-2 rounded-xl p-4 flex items-center gap-3 shadow-2xl"
                  style={{
                    background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-card))',
                    borderColor: 'var(--primary)',
                    boxShadow: '0 8px 24px var(--primary-glow)'
                  }}
                >
                  <FontAwesomeIcon
                    icon={[
                      'fas',
                      (activeItem.icon ||
                        (activeItem.type === 'folder' ? 'folder' : 'link')) as IconName,
                    ]}
                    className="w-5 h-5"
                    style={{ color: 'var(--primary)' }}
                  />
                  <span className="font-semibold" style={{ color: 'var(--text-bright)' }}>
                    {activeItem.text}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
};
