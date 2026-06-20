'use client';

import React from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconName } from '@fortawesome/fontawesome-svg-core';
import { MenuItem } from '@/types/menu';
import { useMenu } from '@/hooks/useMenu';
import { useMenuContext } from '@/contexts/MenuContext';

interface DynamicSidebarProps {
  isCollapsed: boolean;
}

function MenuItemComponent({ 
  item, 
  depth = 0,
  isExpanded,
  onToggle,
  activePath
}: { 
  item: MenuItem; 
  depth?: number;
  isExpanded: boolean;
  onToggle: () => void;
  activePath: string;
}) {
  const isActive = item.path === activePath;
  const hasSubMenu = item.sub && item.sub.length > 0;

  if (item.type === 'divider') {
    return (
      <div className="my-2 px-4">
        <div className="h-px bg-gray-700/50" />
      </div>
    );
  }

  const iconElement = item.icon && (
    <FontAwesomeIcon 
      icon={['fas', item.icon as IconName]} 
      className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-gray-200'}`}
    />
  );

  const badgeElement = item.badge && (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
      typeof item.badge === 'number'
        ? 'bg-red-500 text-white'
        : 'bg-blue-500 text-white'
    }`}>
      {item.badge}
    </span>
  );

  if (hasSubMenu) {
    return (
      <div className="mb-1">
        <button
          onClick={onToggle}
          className={`group w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
            isExpanded
              ? 'bg-gray-800/50 text-white'
              : 'text-gray-400 hover:bg-gray-800/30 hover:text-gray-200'
          }`}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
        >
          {iconElement}
          <span className="flex-1 text-left font-medium">{item.text}</span>
          {badgeElement}
          <FontAwesomeIcon
            icon={['fas', isExpanded ? 'chevron-down' : 'chevron-right']}
            className="w-3 h-3 text-gray-500"
          />
        </button>
        
        {isExpanded && (
          <div className="mt-1 space-y-1">
            {item.sub!.map((subItem) => {
              if (typeof subItem === 'string') return null;
              return (
                <MenuItemComponent
                  key={subItem.id}
                  item={subItem}
                  depth={depth + 1}
                  isExpanded={false}
                  onToggle={() => {}}
                  activePath={activePath}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.path || '#'}
      className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${
        isActive
          ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
          : 'text-gray-400 hover:bg-gray-800/30 hover:text-gray-200'
      }`}
      style={{ paddingLeft: `${16 + depth * 16}px` }}
    >
      {iconElement}
      <span className="flex-1 font-medium">{item.text}</span>
      {badgeElement}
      {item.external && (
        <FontAwesomeIcon
          icon={['fas', 'arrow-up-right-from-square']}
          className="w-3 h-3"
        />
      )}
    </Link>
  );
}

export function DynamicSidebar({ isCollapsed }: DynamicSidebarProps) {
  const { currentSite, userRole, currentPosition, permissions, menuAccess } = useMenuContext();
  const { filteredMenu, isLoading, expandedItems, toggleExpand, activePath } = useMenu({
    siteId: currentSite,
    userRole,
    position: currentPosition,
    permissions,
    menuAccess,
  });

  if (isLoading) {
    return (
      <aside
        className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-gray-900 border-r border-gray-800 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-gray-900 border-r border-gray-800 transition-all duration-300 overflow-y-auto ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {!isCollapsed && (
        <div className="p-4">
          <div className="mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-3">
              메인 메뉴
            </div>
          </div>
          
          <nav className="space-y-1">
            {filteredMenu.map((item) => (
              <MenuItemComponent
                key={item.id}
                item={item}
                depth={0}
                isExpanded={expandedItems.has(item.id)}
                onToggle={() => toggleExpand(item.id)}
                activePath={activePath}
              />
            ))}
          </nav>
        </div>
      )}

      {isCollapsed && (
        <div className="p-2">
          {filteredMenu.map((item) => {
            if (item.type === 'divider') return null;
            
            const isActive = item.path === activePath;
            
            return (
              <Link
                key={item.id}
                href={item.path || '#'}
                className={`group flex items-center justify-center w-full h-14 rounded-xl transition-all mb-2 relative ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'
                    : 'text-gray-400 hover:bg-gray-800/30 hover:text-gray-200'
                }`}
                title={item.text}
              >
                {item.icon && (
                  <FontAwesomeIcon
                    icon={['fas', item.icon as IconName]}
                    className="w-5 h-5"
                  />
                )}
                {item.badge && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}
