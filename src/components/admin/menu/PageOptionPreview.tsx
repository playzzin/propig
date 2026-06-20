import React from 'react';
import { getMenuPageIcon, MenuPageOption } from '@/constants/menuPages';

interface PageOptionPreviewProps {
  page: MenuPageOption;
  label?: string;
}

export function PageOptionPreview({ page, label = '페이지 미리보기' }: PageOptionPreviewProps) {
  const icon = getMenuPageIcon(page);

  return (
    <div className="admin-menu-page-preview" aria-label={label}>
      <span className="admin-menu-page-preview-icon" aria-hidden="true">
        <i className={`fa-solid fa-${icon}`} />
      </span>
      <span className="admin-menu-page-preview-copy">
        <span className="admin-menu-page-preview-kicker">{page.group}</span>
        <strong>{page.label}</strong>
        <code translate="no">{page.path}</code>
      </span>
    </div>
  );
}
