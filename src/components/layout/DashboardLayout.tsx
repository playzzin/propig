'use client';

import React, { useState, ReactNode } from 'react';
import { MenuProvider } from '@/contexts/MenuContext';
import { DynamicSidebar } from '@/components/layout/DynamicSidebar';
import { DynamicHeader } from '@/components/layout/DynamicHeader';
import { PositionPanel } from '@/components/layout/PositionPanel';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPositionPanelOpen, setIsPositionPanelOpen] = useState(false);

  return (
    <MenuProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <DynamicHeader 
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isSidebarCollapsed={isSidebarCollapsed}
          onTogglePositionPanel={() => setIsPositionPanelOpen(!isPositionPanelOpen)}
        />
        
        <div className="flex">
          <DynamicSidebar 
            isCollapsed={isSidebarCollapsed}
          />
          
          <main 
            className={`flex-1 transition-all duration-300 pt-16 ${
              isSidebarCollapsed ? 'ml-20' : 'ml-64'
            }`}
          >
            <div className="p-6 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>

        <PositionPanel 
          isOpen={isPositionPanelOpen}
          onClose={() => setIsPositionPanelOpen(false)}
        />
      </div>
    </MenuProvider>
  );
}
