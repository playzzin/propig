import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconName } from '@fortawesome/fontawesome-svg-core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface ToolboxItemProps {
  id: string;
  icon: IconName;
  label: string;
  type: 'folder' | 'link' | 'divider';
}

export const ToolboxItem: React.FC<ToolboxItemProps> = ({ id, icon, label, type }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { type, isNew: true },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-medium)',
      }}
      {...listeners}
      {...attributes}
      className="group relative flex items-center gap-3 p-3.5 rounded-xl cursor-grab active:cursor-grabbing transition-all border hover:scale-[1.02]"
    >
      <div 
        className="w-10 h-10 rounded-lg flex items-center justify-center shadow-md transition-transform group-hover:scale-110"
        style={{
          background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
        }}
      >
        <FontAwesomeIcon icon={['fas', icon]} className="text-white w-4 h-4" />
      </div>
      <span className="font-medium flex-1" style={{ color: 'var(--text-main)' }}>
        {label}
      </span>
      <FontAwesomeIcon 
        icon={['fas', 'grip-vertical']} 
        className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      />
    </div>
  );
};

interface ToolboxProps {
  onCreateItem: (type: 'folder' | 'link' | 'divider') => void;
}

export const Toolbox: React.FC<ToolboxProps> = ({ onCreateItem: _onCreateItem }) => {
  const tools = [
    { id: 'tool-folder', icon: 'folder' as IconName, label: '폴더', type: 'folder' as const },
    { id: 'tool-link', icon: 'link' as IconName, label: '링크', type: 'link' as const },
    { id: 'tool-divider', icon: 'minus' as IconName, label: '구분선', type: 'divider' as const },
  ];

  return (
    <div 
      className="w-72 border-r overflow-y-auto"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-medium)',
      }}
    >
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
              }}
            >
              <FontAwesomeIcon icon={['fas', 'toolbox']} className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>
                도구 상자
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Toolbox
              </p>
            </div>
          </div>
        </div>
        
        <div className="space-y-3 mb-6">
          {tools.map((tool) => (
            <ToolboxItem key={tool.id} {...tool} />
          ))}
        </div>
        
        <div 
          className="p-4 rounded-xl border"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-medium)',
          }}
        >
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
            <div 
              className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)' }}
            >
              <FontAwesomeIcon 
                icon={['fas', 'circle-info']} 
                className="text-xs"
                style={{ color: '#fbbf24' }}
              />
            </div>
            사용 방법
          </h3>
          <ul className="text-xs space-y-2" style={{ color: 'var(--text-muted)' }}>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--primary)' }}>•</span>
              <span>도구를 드래그하여 캔버스에 추가</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--accent)' }}>•</span>
              <span>폴더는 하위 메뉴 포함 가능</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--primary-light)' }}>•</span>
              <span>링크는 페이지 경로 설정</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: '#f59e0b' }}>•</span>
              <span>구분선은 메뉴 구분용</span>
            </li>
          </ul>
        </div>
        
        <div 
          className="mt-4 p-4 rounded-xl border"
          style={{
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            borderColor: 'rgba(99, 102, 241, 0.2)',
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--accent)' }}>
            <FontAwesomeIcon icon={['fas', 'star']} className="w-3.5 h-3.5" />
            <span>프로 팁</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            드래그 앤 드롭으로 메뉴 순서를 자유롭게 변경할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
};
