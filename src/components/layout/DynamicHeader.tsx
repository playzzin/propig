'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import { useMenuContext } from '@/contexts/MenuContext';
import { useMenuSitesQuery } from '@/hooks/useMenuSitesQuery';

interface DynamicHeaderProps {
  onToggleSidebar: () => void;
  isSidebarCollapsed: boolean;
  onTogglePositionPanel: () => void;
}

const defaultSiteConfig = { name: '사이트', icon: 'globe', color: '#3b82f6' };

export function DynamicHeader({ 
  onToggleSidebar, 
  isSidebarCollapsed,
  onTogglePositionPanel 
}: DynamicHeaderProps) {
  const pathname = usePathname();
  const { currentSite, setCurrentSite, currentPosition } = useMenuContext();
  const { data: sites = {} } = useMenuSitesQuery();
  const siteEntries = getSwitchableSiteEntries(sites);

  const activeSite = sites[currentSite];
  const activeConfig = {
    name: activeSite?.name || defaultSiteConfig.name,
    icon: activeSite?.icon || defaultSiteConfig.icon,
    color: activeSite?.color || defaultSiteConfig.color,
  };

  const getBreadcrumbs = () => {
    if (!pathname) return [];
    const paths = pathname.split('/').filter(Boolean);
    return paths.map((path, index) => ({
      label: path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' '),
      path: '/' + paths.slice(0, index + 1).join('/'),
      isLast: index === paths.length - 1,
    }));
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-gray-900/95 backdrop-blur-xl border-b border-gray-800 z-50">
      <div className="flex items-center justify-between h-full px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Toggle Sidebar"
          >
            <FontAwesomeIcon icon={['fas', isSidebarCollapsed ? 'bars' : 'xmark']} className="w-5 h-5" />
          </button>

          <div className="h-8 w-px bg-gray-800" />

          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
              style={{ 
                background: `linear-gradient(135deg, ${activeConfig.color}, ${activeConfig.color}dd)` 
              }}
            >
              <i className={`fa-solid fa-${activeConfig.icon || 'globe'} text-white w-5 h-5`} />
            </div>
            
            <div>
              <h1 className="text-lg font-bold text-white">
                {activeConfig.name}
              </h1>
              {breadcrumbs.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.path}>
                      {index > 0 && (
                        <FontAwesomeIcon icon={['fas', 'chevron-right']} className="w-3 h-3" />
                      )}
                      <span className={crumb.isLast ? 'text-blue-400 font-medium' : ''}>
                        {crumb.label}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-2 bg-gray-800/50 rounded-xl p-1">
            {siteEntries.map(([siteId, site]) => {
              const config = {
                name: site.name,
                icon: site.icon || defaultSiteConfig.icon,
                color: site.color || defaultSiteConfig.color,
              };
              const isActive = currentSite === siteId;
              
              return (
                <button
                  key={siteId}
                  onClick={() => setCurrentSite(siteId)}
                  className={`group relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                  style={isActive ? { color: config.color } : {}}
                >
                  <i className={`fa-solid fa-${config.icon || 'globe'} w-4 h-4`} />
                  <span className="text-sm">{config.name}</span>
                  
                  {isActive && (
                    <div 
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full"
                      style={{ background: config.color }}
                    />
                  )}
                </button>
              );
            })}

            {siteEntries.length === 0 && (
              <span className="px-3 py-2 text-xs text-gray-500">사이트모드 없음</span>
            )}
          </div>

          <div className="h-8 w-px bg-gray-800" />

          <button
            onClick={onTogglePositionPanel}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-800 rounded-xl transition-colors"
          >
            <FontAwesomeIcon icon={['fas', 'user-tie']} className="text-purple-400 w-4 h-4" />
            <span className="text-sm text-gray-300 font-medium capitalize">
              {currentPosition}
            </span>
            <FontAwesomeIcon icon={['fas', 'chevron-down']} className="text-gray-500 w-3 h-3" />
          </button>

          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <FontAwesomeIcon icon={['fas', 'bell']} className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <FontAwesomeIcon icon={['fas', 'gear']} className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
