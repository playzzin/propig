import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconName } from '@fortawesome/fontawesome-svg-core';
import { MenuItem } from '@/types/menu';

interface InspectorProps {
  selectedItem: MenuItem | null;
  onUpdate: (item: MenuItem) => void;
  onDelete: () => void;
}

const AVAILABLE_ICONS: IconName[] = [
  'house', 'user', 'gear', 'chart-line', 'folder', 'file', 'shield-halved',
  'users', 'handshake', 'dollar-sign', 'envelope', 'phone', 'calendar',
  'clock', 'star', 'heart', 'bookmark', 'tag', 'bell', 'search',
  'plus', 'minus', 'edit', 'trash', 'check', 'times', 'info-circle',
  'exclamation-triangle', 'question-circle', 'cog', 'bars', 'list',
  'user-shield', 'user-gear', 'images', 'hard-drive', 'diagram-project',
  'calculator', 'key', 'globe', 'store', 'briefcase', 'calendar-check',
  'list-check', 'book-open',
];

const AVAILABLE_ROLES = ['admin', 'user', 'partner', 'guest'];

const AVAILABLE_PAGES = [
  { path: '/', label: '홈' },
  { path: '/sticky-notes', label: '스티커 메모' },
  { path: '/bookmarks', label: '스마트 북마크' },
  { path: '/youtube-analyze', label: 'YouTube 분석' },
  { path: '/mandalart', label: '만다라트' },
  { path: '/habit-tracker', label: '습관 트래커' },
  { path: '/todo-list', label: '할일 일정표' },
  { path: '/habit-tracker/stats', label: '습관 통계' },
  { path: '/habit-tracker/manual', label: '습관 설명서' },
  { path: '/admin/image-generator', label: 'AI 이미지 생성기' },
  { path: '/admin/gemini-settings', label: 'Gemini 설정 센터' },
  { path: '/admin/menu', label: '통합 메뉴 관리' },
  { path: '/corp/greeting', label: '기업정보 - 인사말' },
  { path: '/corp/history', label: '기업정보 - 연혁' },
  { path: '/corp/organization', label: '기업정보 - 조직도' },
  { path: '/corp/notice', label: '사내공지 - 공지사항' },
  { path: '/corp/document', label: '사내공지 - 내부공문' },
  { path: '/propig', label: 'propig 홈' },
  { path: '/propig/memos', label: 'propig 메모장' },
];

export const Inspector: React.FC<InspectorProps> = ({ selectedItem, onUpdate, onDelete }) => {
  const [localItem, setLocalItem] = useState<MenuItem | null>(selectedItem);

  React.useEffect(() => {
    setLocalItem(selectedItem);
  }, [selectedItem]);

  if (!localItem) {
    return (
      <div 
        className="w-96 border-l p-6 flex items-center justify-center"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border-medium)',
        }}
      >
        <div className="text-center">
          <div 
            className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-card))',
              border: '1px solid var(--border-medium)',
            }}
          >
            <FontAwesomeIcon 
              icon={['fas', 'hand-pointer']} 
              className="text-5xl"
              style={{ color: 'var(--text-dim)' }}
            />
          </div>
          <p className="font-medium mb-2" style={{ color: 'var(--text-main)' }}>
            메뉴 아이템을 선택하세요
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            선택한 항목의 속성을 편집할 수 있습니다
          </p>
        </div>
      </div>
    );
  }

  const handleChange = (field: keyof MenuItem, value: MenuItem[keyof MenuItem]) => {
    const updated = { ...localItem, [field]: value };
    setLocalItem(updated);
    onUpdate(updated);
  };

  const handleRoleToggle = (role: string) => {
    const currentRoles = localItem.roles || [];
    const updated = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    handleChange('roles', updated);
  };

  return (
    <div 
      className="w-96 border-l p-6 overflow-y-auto"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-medium)',
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
            }}
          >
            <FontAwesomeIcon icon={['fas', 'sliders']} className="text-white w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>
              속성 편집
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Inspector
            </p>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="p-2.5 rounded-lg transition-all border hover:scale-105"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            borderColor: 'rgba(239, 68, 68, 0.3)',
          }}
          title="삭제"
        >
          <FontAwesomeIcon icon={['fas', 'trash']} className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-main)' }}>
            타입
          </label>
          <div className="flex gap-2">
            {(['folder', 'link', 'divider'] as const).map((type) => {
              const isActive = localItem.type === type;
              return (
                <button
                  key={type}
                  onClick={() => handleChange('type', type)}
                  className="flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all border"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-elevated)' : 'var(--bg-card)',
                    color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                    borderColor: isActive ? 'var(--primary)' : 'var(--border-medium)',
                  }}
                >
                  {type === 'folder' && '폴더'}
                  {type === 'link' && '링크'}
                  {type === 'divider' && '구분선'}
                </button>
              );
            })}
          </div>
        </div>

        {localItem.type !== 'divider' && (
          <>
            <div>
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-main)' }}>
                텍스트
              </label>
              <input
                type="text"
                value={localItem.text}
                onChange={(e) => handleChange('text', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-medium)',
                  color: 'var(--text-main)',
                }}
                placeholder="메뉴 이름"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-main)' }}>
                아이콘
              </label>
              <div className="relative">
                <select
                  value={localItem.icon || ''}
                  onChange={(e) => handleChange('icon', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border appearance-none transition-all focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-medium)',
                    color: 'var(--text-main)',
                  }}
                >
                  <option value="">아이콘 선택</option>
                  {AVAILABLE_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>
                {localItem.icon && (
                  <div 
                    className="absolute right-12 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                  >
                    <FontAwesomeIcon
                      icon={['fas', localItem.icon as IconName]}
                      style={{ color: 'var(--primary)' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {localItem.type === 'link' && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-main)' }}>
                    페이지 선택
                  </label>
                  <select
                    value={localItem.path || ''}
                    onChange={(e) => handleChange('path', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-medium)',
                      color: 'var(--text-main)',
                    }}
                  >
                    <option value="">페이지를 선택하세요</option>
                    {AVAILABLE_PAGES.map((page) => (
                      <option key={page.path} value={page.path}>
                        {page.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-main)' }}>
                    직접 입력 (선택사항)
                  </label>
                  <input
                    type="text"
                    value={localItem.path || ''}
                    onChange={(e) => handleChange('path', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-medium)',
                      color: 'var(--text-main)',
                    }}
                    placeholder="/custom/path"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-main)' }}>
                접근 권한
              </label>
              <div className="space-y-2">
                {AVAILABLE_ROLES.map((role) => {
                  const isChecked = (localItem.roles || []).includes(role);
                  return (
                    <label
                      key={role}
                      className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border"
                      style={{
                        backgroundColor: isChecked ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-card)',
                        borderColor: isChecked ? 'var(--primary)' : 'var(--border-medium)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleRoleToggle(role)}
                        className="w-5 h-5 rounded focus:ring-2"
                        style={{
                          accentColor: 'var(--primary)',
                        }}
                      />
                      <span 
                        className="capitalize font-medium"
                        style={{ color: isChecked ? 'var(--primary)' : 'var(--text-main)' }}
                      >
                        {role}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="pt-6" style={{ borderTop: '1px solid var(--border-medium)' }}>
          <div 
            className="p-4 rounded-xl border"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-medium)',
            }}
          >
            <div className="text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
              <p className="flex items-center gap-2">
                <span style={{ color: 'var(--text-dim)' }}>ID:</span>
                <span className="font-mono text-xs">{localItem.id}</span>
              </p>
              {localItem.sub && (
                <p className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-dim)' }}>하위 메뉴:</span>
                  <span className="font-semibold" style={{ color: 'var(--primary)' }}>
                    {localItem.sub.length}개
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
