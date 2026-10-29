'use client';

import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import type { SiteDataType } from '@/types/menu';
import { BookOpen, Building2, CircleCheck, Globe, LayoutDashboard, ShieldCheck } from 'lucide-react';

const SITE_DESCRIPTIONS: Record<string, string> = {
  corp: '회사 소개와 사업 · 소식',
  blog: '콘텐츠와 관심사 기록',
  shop: '일상과 업무를 한곳에서',
  admin: '사이트와 콘텐츠 관리',
};
const SITE_ICONS: Record<string, typeof Globe> = { corp: Building2, blog: BookOpen, shop: LayoutDashboard, admin: ShieldCheck };

interface SiteModeSwitcherProps {
  sites: SiteDataType;
  selectedSite: string;
  onSelect: (siteId: string) => void;
  disabled?: boolean;
}

// Selection stays in the dialog until the user continues.
export function SiteModeSwitcher({ sites, selectedSite, onSelect, disabled }: SiteModeSwitcherProps) {
  const entries = getSwitchableSiteEntries(sites);
  return (
    <fieldset className="auth-site-picker" disabled={disabled}>
      <legend>사이트 모드</legend>
      <p className="auth-site-hint">이용할 사이트를 선택해 주세요.</p>
      <div className="auth-site-grid">
        {entries.map(([siteId, site]) => {
          const Icon = SITE_ICONS[siteId] || Globe;
          return (
          <label key={siteId} className="auth-site-option">
            <input type="radio" name="login-site-mode" value={siteId}
              checked={siteId === selectedSite} onChange={() => onSelect(siteId)} />
            <span className="auth-site-option-content">
              <Icon size={18} aria-hidden="true" />
              <span>
                <strong>{site.name}</strong>
                <small>{SITE_DESCRIPTIONS[siteId] || '이 사이트의 홈으로 이동'}</small>
              </span>
              <CircleCheck size={14} className="auth-site-check" aria-hidden="true" />
            </span>
          </label>
          );
        })}
      </div>
      {entries.length === 0 ? <p role="status">이용 가능한 사이트가 없습니다.</p> : null}
    </fieldset>
  );
}
