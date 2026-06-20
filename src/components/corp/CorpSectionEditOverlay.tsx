'use client';

import { Settings } from 'lucide-react';
import { type ReactNode } from 'react';
import styled from 'styled-components';

export type CorpSectionEditorState = {
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string | null) => void;
};

interface CorpEditableSectionProps {
  blockId: string;
  label: string;
  editor?: CorpSectionEditorState;
  children: ReactNode;
}

export function CorpEditableSection({ blockId, label, editor, children }: CorpEditableSectionProps) {
  if (!editor) return <>{children}</>;

  return (
    <EditableShell $selected={editor.selectedBlockId === blockId} data-corp-section={blockId}>
      <EditHotspot type="button" onClick={() => editor.onSelectBlock?.(blockId)}>
        <Settings size={14} />
        {label}
      </EditHotspot>
      {children}
    </EditableShell>
  );
}

const EditableShell = styled.div<{ $selected: boolean }>`
  position: relative;
  min-width: 0;
  border-radius: 8px;
  outline: ${(props) => (props.$selected ? '2px solid rgba(94, 234, 212, 0.94)' : '1px dashed rgba(94, 234, 212, 0.34)')};
  outline-offset: ${(props) => (props.$selected ? '4px' : '3px')};
  transition:
    outline-color 160ms ease,
    outline-offset 160ms ease;
`;

const EditHotspot = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 12;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(94, 234, 212, 0.46);
  border-radius: 8px;
  padding: 0 10px;
  color: #05201d;
  background: rgba(94, 234, 212, 0.92);
  box-shadow: 0 14px 34px rgba(2, 6, 23, 0.32);
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: #ffffff;
    outline: none;
  }
`;
