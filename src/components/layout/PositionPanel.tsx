'use client';

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconName } from '@fortawesome/fontawesome-svg-core';
import { useMenuContext } from '@/contexts/MenuContext';
import { Position } from '@/types/menu';

interface PositionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const positionConfigs: Record<Position, { 
  name: string; 
  icon: IconName; 
  color: string;
  description: string;
}> = {
  ceo: { 
    name: '대표이사', 
    icon: 'crown', 
    color: '#f59e0b',
    description: '최고 경영자 권한 - 모든 메뉴 접근 가능'
  },
  manager: { 
    name: '팀장', 
    icon: 'user-tie', 
    color: '#8b5cf6',
    description: '관리자 권한 - 팀 관리 메뉴 접근 가능'
  },
  staff: { 
    name: '사원', 
    icon: 'user', 
    color: '#3b82f6',
    description: '일반 사용자 권한 - 기본 메뉴 접근 가능'
  },
  intern: { 
    name: '인턴', 
    icon: 'user-graduate', 
    color: '#6b7280',
    description: '제한된 권한 - 일부 메뉴만 접근 가능'
  },
};

export function PositionPanel({ isOpen, onClose }: PositionPanelProps) {
  const { currentPosition, setCurrentPosition } = useMenuContext();

  const handlePositionChange = (position: Position) => {
    setCurrentPosition(position);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />
      
      <div className="fixed right-6 top-20 w-96 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 p-6 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FontAwesomeIcon icon={['fas', 'user-tie']} className="text-purple-400" />
              직책 전환
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={['fas', 'xmark']} className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-400">
            직책에 따라 접근 가능한 메뉴가 달라집니다
          </p>
        </div>

        <div className="p-4 space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto">
          {(Object.keys(positionConfigs) as Position[]).map((position) => {
            const config = positionConfigs[position];
            const isActive = currentPosition === position;
            
            return (
              <button
                key={position}
                onClick={() => handlePositionChange(position)}
                className={`group w-full flex items-start gap-4 p-4 rounded-xl transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-2 border-blue-500/50'
                    : 'bg-gray-800/30 hover:bg-gray-800/50 border-2 border-transparent'
                }`}
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                  style={{ 
                    background: isActive 
                      ? `linear-gradient(135deg, ${config.color}, ${config.color}dd)` 
                      : 'rgba(55, 65, 81, 0.5)'
                  }}
                >
                  <FontAwesomeIcon 
                    icon={['fas', config.icon]} 
                    className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400'}`}
                  />
                </div>
                
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`font-semibold ${isActive ? 'text-white' : 'text-gray-300'}`}>
                      {config.name}
                    </h3>
                    {isActive && (
                      <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-semibold rounded-full">
                        현재
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                    {config.description}
                  </p>
                </div>

                {isActive && (
                  <FontAwesomeIcon 
                    icon={['fas', 'check-circle']} 
                    className="text-blue-400 w-5 h-5 flex-shrink-0 mt-1"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-800 bg-gray-900/50">
          <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
            <FontAwesomeIcon 
              icon={['fas', 'circle-info']} 
              className="text-yellow-400 w-4 h-4 mt-0.5 flex-shrink-0"
            />
            <div className="text-xs text-gray-400">
              <p className="font-semibold text-yellow-400 mb-1">알림</p>
              <p>직책 변경은 즉시 적용되며, 메뉴 구성이 자동으로 업데이트됩니다.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
