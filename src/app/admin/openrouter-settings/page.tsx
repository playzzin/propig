'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  KeyRound,
  Plus,
  Save,
  ServerCog,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import styled from 'styled-components';
import { toast } from 'sonner';
import { LoginModal } from '@/components/LoginModal';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_OPENROUTER_MODEL,
  type ManagedApiMethod,
  type ManagedApiPage,
  type ManagedApiPageType,
  mergeManagedPages,
} from '@/lib/ai-config';

type RuntimeSource = 'functions_env' | 'server_env' | 'none';

type ConfigResponse = {
  config: {
    source: RuntimeSource;
    model: string;
    imageModel: string;
    fallbackModels: string[];
    hasApiKey: boolean;
    maskedApiKey: string;
    managedPages: ManagedApiPage[];
    updatedAt: string | null;
    updatedBy: string | null;
  };
  storage: {
    canPersist: boolean;
    credentialMode: string;
    message: string | null;
  };
};

type EditableManagedPage = ManagedApiPage & {
  testPayloadText: string;
  payloadError?: string;
};

type ConfigDraft = {
  source: RuntimeSource;
  model: string;
  fallbackModels: string[];
  hasApiKey: boolean;
  maskedApiKey: string;
  managedPages: EditableManagedPage[];
  updatedAt: string | null;
  updatedBy: string | null;
};

type SaveConfigBody = {
  apiKey?: string;
  replaceApiKey?: boolean;
  clearApiKey?: boolean;
  model: string;
  fallbackModels: string[];
  managedPages: ManagedApiPage[];
  updatedBy: string;
};

const AI_CONFIG_QUERY_KEY = ['ai-config'] as const;

const MODEL_CANDIDATES = [
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1',
  'anthropic/claude-sonnet-4',
  'meta-llama/llama-4-maverick',
];

const MODEL_DESCRIPTIONS: Record<string, string> = {
  'openai/gpt-4.1-mini': '비용과 응답 속도의 균형이 좋은 기본 모델입니다.',
  'openai/gpt-4.1': '복잡한 업무 자동화와 긴 문맥 작업에 적합합니다.',
  'anthropic/claude-sonnet-4': '정교한 문서 작성과 분석 작업에 적합합니다.',
  'meta-llama/llama-4-maverick': '다양한 일반 업무에 사용할 수 있는 대안 모델입니다.',
};

const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

const pageFieldId = (pageId: string, field: string) =>
  `openrouter-page-${sanitizeId(pageId)}-${field}`;

const parseFallbackModels = (value: string, primaryModel: string): string[] =>
  Array.from(
    new Set(
      value
        .split(',')
        .map((model) => model.trim())
        .filter((model) => model && model !== primaryModel),
    ),
  ).slice(0, 3);

const createEmptyDraft = (): ConfigDraft => ({
  source: 'none',
  model: DEFAULT_OPENROUTER_MODEL,
  fallbackModels: [],
  hasApiKey: false,
  maskedApiKey: '',
  managedPages: [],
  updatedAt: null,
  updatedBy: null,
});

const toEditableManagedPages = (pages: ManagedApiPage[] = []): EditableManagedPage[] =>
  mergeManagedPages(pages).map((page) => ({
    ...page,
    testPayloadText:
      typeof page.testPayload === 'string'
        ? page.testPayload
        : JSON.stringify(page.testPayload || {}, null, 2),
  }));

const toManagedPagesPayload = (pages: EditableManagedPage[]): ManagedApiPage[] =>
  pages.map((page) => {
    const fallbackPayload =
      page.testPayload && typeof page.testPayload === 'object' ? page.testPayload : {};
    let parsedPayload = fallbackPayload;

    try {
      parsedPayload = JSON.parse(page.testPayloadText || '{}') as Record<string, unknown>;
    } catch (error) {
      console.error('Failed to parse test payload:', error);
    }

    return {
      id: page.id,
      name: page.name,
      pagePath: page.pagePath,
      apiPath: page.apiPath,
      method: page.method,
      enabled: page.enabled,
      type: page.type,
      description: page.description,
      builtIn: page.builtIn,
      testPayload: parsedPayload,
    };
  });

const toConfigDraft = (config: ConfigResponse['config']): ConfigDraft => ({
  source: config.source,
  model: config.model || DEFAULT_OPENROUTER_MODEL,
  fallbackModels: config.fallbackModels || [],
  hasApiKey: config.hasApiKey,
  maskedApiKey: config.maskedApiKey || '',
  managedPages: toEditableManagedPages(config.managedPages || []),
  updatedAt: config.updatedAt || null,
  updatedBy: config.updatedBy || null,
});

async function fetchAIConfig(user: User): Promise<ConfigResponse> {
  const token = await user.getIdToken();
  const response = await fetch('/api/ai-config', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | ConfigResponse
    | null;

  if (!response.ok) {
    throw new Error(
      payload && 'error' in payload ? payload.error || '설정을 불러오지 못했습니다.' : '설정을 불러오지 못했습니다.',
    );
  }

  return payload as ConfigResponse;
}

async function saveAIConfig(user: User, body: SaveConfigBody): Promise<ConfigResponse> {
  const token = await user.getIdToken();
  const response = await fetch('/api/ai-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | ({ error?: string } & Partial<ConfigResponse>)
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || '설정 저장에 실패했습니다.');
  }

  return payload as ConfigResponse;
}

type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

type PillProps = {
  $tone?: PillTone;
  $ok?: boolean;
  $warn?: boolean;
  $muted?: boolean;
};

const pillPalette: Record<PillTone, { background: string; border: string; color: string }> = {
  success: {
    background: 'rgba(16, 185, 129, 0.14)',
    border: 'rgba(16, 185, 129, 0.24)',
    color: '#34d399',
  },
  warning: {
    background: 'rgba(245, 158, 11, 0.14)',
    border: 'rgba(245, 158, 11, 0.25)',
    color: '#fbbf24',
  },
  danger: {
    background: 'rgba(239, 68, 68, 0.14)',
    border: 'rgba(239, 68, 68, 0.25)',
    color: '#fca5a5',
  },
  info: {
    background: 'rgba(56, 189, 248, 0.13)',
    border: 'rgba(56, 189, 248, 0.22)',
    color: '#7dd3fc',
  },
  neutral: {
    background: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.2)',
    color: '#cbd5e1',
  },
};

const resolvePillTone = ({ $tone, $ok, $warn, $muted }: PillProps): PillTone => {
  if ($tone) return $tone;
  if ($ok) return 'success';
  if ($warn) return 'warning';
  if ($muted) return 'neutral';
  return 'info';
};

const PageWrap = styled.main<{ $center?: boolean }>`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  color: var(--text-main);
  background:
    linear-gradient(180deg, rgba(16, 185, 129, 0.04), transparent 220px),
    var(--bg-base);
  ${({ $center }) =>
    $center
      ? `
        display: flex;
        align-items: center;
        justify-content: center;
      `
      : ''}

  @media (max-width: 720px) {
    padding: 12px;
  }
`;

const PageShell = styled.div`
  width: min(1360px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const PageHeader = styled.section`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 2px 2px;

  @media (max-width: 820px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const HeaderCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Eyebrow = styled.span`
  color: var(--primary-light);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
`;

const PageTitle = styled.h1`
  margin: 0;
  color: var(--text-main);
  font-size: clamp(1.35rem, 2.2vw, 1.9rem);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
`;

const PageSubtitle = styled.p`
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
`;

const MainPane = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Card = styled.section`
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media (max-width: 720px) {
    padding: 14px;
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;

  @media (max-width: 640px) {
    flex-direction: column;
  }
`;

const CardTitleGroup = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
`;

const SectionIcon = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--primary-light);
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.22);
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
  line-height: 1.3;
`;

const SectionHint = styled.p`
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const Label = styled.label`
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
`;

const CheckboxLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 32px;
  font-size: 0.82rem;
  color: var(--text-muted);
  cursor: pointer;

  input {
    accent-color: var(--primary);
    flex: 0 0 auto;
  }
`;

const controlStyles = `
  width: 100%;
  min-width: 0;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--border-medium);
  color: var(--text-main);
  border-radius: 6px;
  font-size: 0.9rem;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;

  &:focus {
    border-color: rgba(52, 211, 153, 0.7);
    background: rgba(255, 255, 255, 0.055);
  }

  &:focus-visible {
    outline-color: rgba(16, 185, 129, 0.34);
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
  }
`;

const Input = styled.input`
  ${controlStyles}
  height: 38px;
  padding: 8px 11px;
`;

const Select = styled.select`
  ${controlStyles}
  height: 38px;
  padding: 8px 11px;
`;

const Textarea = styled.textarea`
  ${controlStyles}
  padding: 10px 11px;
  min-height: 96px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  resize: vertical;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
`;

const SplitRow = styled(Row)`
  justify-content: space-between;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const Pill = styled.span<PillProps>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid ${({ ...props }) => pillPalette[resolvePillTone(props)].border};
  background: ${({ ...props }) => pillPalette[resolvePillTone(props)].background};
  color: ${({ ...props }) => pillPalette[resolvePillTone(props)].color};
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
`;

const Small = styled.span`
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const ErrorText = styled(Small)`
  color: #fca5a5;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 6px;
  padding: 8px 13px;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: 2px;
  background: ${({ $variant }) =>
    $variant === 'secondary'
      ? 'rgba(255, 255, 255, 0.035)'
      : $variant === 'danger'
        ? 'rgba(239, 68, 68, 0.14)'
        : 'var(--primary)'};
  color: ${({ $variant }) => ($variant === 'danger' ? '#fca5a5' : $variant === 'secondary' ? 'var(--text-main)' : '#04110d')};
  border: 1px solid
    ${({ $variant }) =>
      $variant === 'secondary'
        ? 'var(--border-medium)'
        : $variant === 'danger'
          ? 'rgba(239, 68, 68, 0.3)'
          : 'rgba(16, 185, 129, 0.4)'};
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;

  svg {
    flex: 0 0 auto;
  }

  &:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
  }

  &:focus-visible {
    outline-color: rgba(16, 185, 129, 0.4);
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.12);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover:not(:disabled) {
      transform: none;
    }
  }
`;

const KeyGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const KeyPanel = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
`;

const ToggleGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ToggleBox = styled.label<{ $active?: boolean; $danger?: boolean }>`
  min-width: 0;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid
    ${({ $active, $danger }) =>
      $active ? ($danger ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)') : 'var(--border-medium)'};
  background: ${({ $active, $danger }) =>
    $active ? ($danger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)') : 'rgba(255, 255, 255, 0.025)'};
  color: var(--text-main);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;

  input {
    accent-color: ${({ $danger }) => ($danger ? '#ef4444' : 'var(--primary)')};
    flex: 0 0 auto;
  }
`;

const InlineNotice = styled.div<{ $tone?: 'danger' | 'warning' | 'info' }>`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 12px;
  border-radius: 8px;
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'danger'
        ? 'rgba(239, 68, 68, 0.26)'
        : $tone === 'warning'
          ? 'rgba(245, 158, 11, 0.26)'
          : 'rgba(56, 189, 248, 0.22)'};
  background: ${({ $tone }) =>
    $tone === 'danger'
      ? 'rgba(239, 68, 68, 0.1)'
      : $tone === 'warning'
        ? 'rgba(245, 158, 11, 0.1)'
        : 'rgba(56, 189, 248, 0.08)'};
  color: ${({ $tone }) =>
    $tone === 'danger' ? '#fecaca' : $tone === 'warning' ? '#fde68a' : '#bae6fd'};
  font-size: 0.82rem;
  line-height: 1.45;

  svg {
    flex: 0 0 auto;
    margin-top: 1px;
  }
`;

const PageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const SummaryChevron = styled(ChevronDown)`
  flex: 0 0 auto;
  color: var(--text-muted);
  transition: transform 0.18s ease;
`;

const PageCard = styled.details`
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  overflow: hidden;

  &[open] ${SummaryChevron} {
    transform: rotate(180deg);
  }
`;

const PageSummary = styled.summary`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 13px 14px;
  cursor: pointer;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.36);
    outline-offset: -2px;
  }
`;

const PageSummaryMain = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const PageSummaryTitle = styled.strong`
  min-width: 0;
  color: var(--text-main);
  font-size: 0.92rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
`;

const PageSummaryMeta = styled.span`
  color: var(--text-muted);
  font-size: 0.76rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;

const PageCardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 14px 14px;
`;

const SaveDock = styled(Card)`
  position: sticky;
  bottom: 0;
  z-index: 5;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  backdrop-filter: blur(14px);
`;

const LockedState = styled.section`
  width: min(860px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.8fr);
  gap: 16px;
  align-items: stretch;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const LockedCard = styled(Card)`
  background:
    linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(56, 189, 248, 0.08)),
    var(--bg-card);
  border-color: rgba(16, 185, 129, 0.22);
`;

const LockedEyebrow = styled.div`
  color: var(--primary);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
`;

const LockedTitle = styled.h2`
  color: var(--text-main);
  font-size: clamp(1.35rem, 3vw, 2rem);
  line-height: 1.2;
  margin: 0;
  text-wrap: balance;
`;

const LockedCopy = styled.p`
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0;
  text-wrap: pretty;
`;

const LockedActions = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`;

const LockedChecklist = styled.aside`
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const LockedCheckItem = styled.div`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  color: var(--text-muted);
  font-size: 0.86rem;
  line-height: 1.45;

  i {
    color: var(--primary);
    margin-top: 2px;
  }

  strong {
    display: block;
    color: var(--text-main);
    margin-bottom: 2px;
  }
`;

const StatusMessage = styled.div`
  width: min(520px, 100%);
  color: var(--text-main);
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  padding: 18px 20px;
`;

function pageTypeLabel(type: ManagedApiPageType) {
  switch (type) {
    case 'text':
      return '텍스트';
    case 'image':
      return '이미지';
    case 'custom':
      return '커스텀';
    default:
      return type;
  }
}

type HandlePageField = <K extends keyof EditableManagedPage>(
  index: number,
  field: K,
  value: EditableManagedPage[K],
) => void;

type ProviderKeyPanelProps = {
  clearChecked: boolean;
  hasKey: boolean;
  helper?: string;
  inputId: string;
  inputName: string;
  inputValue: string;
  maskedKey: string;
  onClearChange: (checked: boolean) => void;
  onInputChange: (value: string) => void;
  onReplaceChange: (checked: boolean) => void;
  placeholder: string;
  providerName: string;
  replaceChecked: boolean;
};

function ProviderKeyPanel({
  clearChecked,
  hasKey,
  helper,
  inputId,
  inputName,
  inputValue,
  maskedKey,
  onClearChange,
  onInputChange,
  onReplaceChange,
  placeholder,
  providerName,
  replaceChecked,
}: ProviderKeyPanelProps) {
  return (
    <KeyPanel>
      <SplitRow>
        <Row>
          <KeyRound size={16} aria-hidden />
          <strong>{providerName}</strong>
        </Row>
        <Pill $tone={hasKey ? 'success' : 'warning'}>{hasKey ? '키 설정됨' : '키 없음'}</Pill>
      </SplitRow>

      <Small>{hasKey ? maskedKey : '저장된 키가 없습니다.'}</Small>
      {helper ? <Small>{helper}</Small> : null}

      <ToggleGroup>
        <ToggleBox $active={replaceChecked}>
          <input
            type="checkbox"
            checked={replaceChecked}
            onChange={(event) => onReplaceChange(event.target.checked)}
          />
          키 변경
        </ToggleBox>
        <ToggleBox $active={clearChecked} $danger>
          <input
            type="checkbox"
            checked={clearChecked}
            onChange={(event) => onClearChange(event.target.checked)}
          />
          키 제거
        </ToggleBox>
      </ToggleGroup>

      {replaceChecked && !clearChecked ? (
        <Field>
          <Label htmlFor={inputId}>새 {providerName} API 키</Label>
          <Input
            id={inputId}
            name={inputName}
            type="password"
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
          />
        </Field>
      ) : null}
    </KeyPanel>
  );
}

type ManagedPageEditorProps = {
  index: number;
  onFieldChange: HandlePageField;
  onPayloadTextChange: (index: number, value: string) => void;
  onRemove: (id: string, name: string) => void;
  page: EditableManagedPage;
};

function ManagedPageEditor({
  index,
  onFieldChange,
  onPayloadTextChange,
  onRemove,
  page,
}: ManagedPageEditorProps) {
  const [isOpen, setIsOpen] = useState(!page.builtIn || Boolean(page.payloadError));
  const nameId = pageFieldId(page.id, 'name');
  const pagePathId = pageFieldId(page.id, 'page-path');
  const apiPathId = pageFieldId(page.id, 'api-path');
  const methodId = pageFieldId(page.id, 'method');
  const typeId = pageFieldId(page.id, 'type');
  const descriptionId = pageFieldId(page.id, 'description');
  const payloadId = pageFieldId(page.id, 'payload');
  const payloadErrorId = pageFieldId(page.id, 'payload-error');

  return (
    <PageCard open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <PageSummary>
        <PageSummaryMain>
          <Row>
            <PageSummaryTitle>{page.name || '이름 없음'}</PageSummaryTitle>
            <Pill $muted>{page.builtIn ? '기본' : '커스텀'}</Pill>
            <Pill $tone={page.enabled ? 'success' : 'warning'}>{page.enabled ? '사용' : '중지'}</Pill>
            <Pill>{pageTypeLabel(page.type)}</Pill>
          </Row>
          <PageSummaryMeta>
            {page.pagePath || '-'} · {page.method} {page.apiPath || '-'}
          </PageSummaryMeta>
        </PageSummaryMain>
        <SummaryChevron size={18} aria-hidden />
      </PageSummary>

      <PageCardBody>
        <Grid>
          <Field>
            <Label htmlFor={nameId}>페이지 이름</Label>
            <Input
              id={nameId}
              name={nameId}
              autoComplete="off"
              value={page.name}
              onChange={(event) => onFieldChange(index, 'name', event.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor={pagePathId}>페이지 경로</Label>
            <Input
              id={pagePathId}
              name={pagePathId}
              autoComplete="off"
              spellCheck={false}
              value={page.pagePath}
              onChange={(event) => onFieldChange(index, 'pagePath', event.target.value)}
            />
          </Field>
        </Grid>

        <Grid>
          <Field>
            <Label htmlFor={apiPathId}>API 경로</Label>
            <Input
              id={apiPathId}
              name={apiPathId}
              autoComplete="off"
              spellCheck={false}
              value={page.apiPath}
              onChange={(event) => onFieldChange(index, 'apiPath', event.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor={methodId}>HTTP 메서드</Label>
            <Select
              id={methodId}
              name={methodId}
              value={page.method}
              onChange={(event) =>
                onFieldChange(index, 'method', event.target.value as ManagedApiMethod)
              }
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </Select>
          </Field>
        </Grid>

        <Grid>
          <Field>
            <Label htmlFor={typeId}>유형</Label>
            <Select
              id={typeId}
              name={typeId}
              value={page.type}
              onChange={(event) =>
                onFieldChange(index, 'type', event.target.value as ManagedApiPageType)
              }
            >
              <option value="text">텍스트</option>
              <option value="image">이미지</option>
              <option value="custom">커스텀</option>
            </Select>
          </Field>
          <Field>
            <Label htmlFor={descriptionId}>설명</Label>
            <Input
              id={descriptionId}
              name={descriptionId}
              autoComplete="off"
              value={page.description || ''}
              onChange={(event) => onFieldChange(index, 'description', event.target.value)}
            />
          </Field>
        </Grid>

        <Field>
          <Label htmlFor={payloadId}>테스트 Payload (JSON)</Label>
          <Textarea
            id={payloadId}
            name={payloadId}
            spellCheck={false}
            value={page.testPayloadText}
            aria-invalid={Boolean(page.payloadError)}
            aria-describedby={page.payloadError ? payloadErrorId : undefined}
            onChange={(event) => onPayloadTextChange(index, event.target.value)}
          />
          {page.payloadError ? (
            <ErrorText id={payloadErrorId} role="alert">
              {page.payloadError}
            </ErrorText>
          ) : null}
        </Field>

        <SplitRow>
          <CheckboxLabel>
            <input
              type="checkbox"
              name={pageFieldId(page.id, 'enabled')}
              checked={page.enabled}
              onChange={(event) => onFieldChange(index, 'enabled', event.target.checked)}
            />
            관리 대상에 포함
          </CheckboxLabel>
          {!page.builtIn ? (
            <Button type="button" $variant="danger" onClick={() => onRemove(page.id, page.name)}>
              <Trash2 size={15} aria-hidden />
              삭제
            </Button>
          ) : null}
        </SplitRow>
      </PageCardBody>
    </PageCard>
  );
}

export default function OpenRouterSettingsPage() {
  const queryClient = useQueryClient();
  const {
    currentUser,
    loading: authLoading,
    isConfigured: authConfigured,
    error: authError,
  } = useAuth();

  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [replaceApiKey, setReplaceApiKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);

  const configQueryKey = useMemo(
    () => [...AI_CONFIG_QUERY_KEY, currentUser?.uid ?? 'anonymous'] as const,
    [currentUser?.uid],
  );
  const isAuthChecking = authLoading && !authLoadingTimedOut;
  const canOpenLogin = authConfigured && !isAuthChecking;

  useEffect(() => {
    if (!authLoading || authLoadingTimedOut) return undefined;

    const timeoutId = window.setTimeout(() => {
      setAuthLoadingTimedOut(true);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [authLoading, authLoadingTimedOut]);

  const configQuery = useQuery({
    queryKey: configQueryKey,
    queryFn: () => fetchAIConfig(currentUser as User),
    enabled: Boolean(currentUser),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!configQuery.error) return;

    console.error(configQuery.error);
    toast.error(
      configQuery.error instanceof Error
        ? configQuery.error.message
        : '설정을 불러오는 중 오류가 발생했습니다.',
    );
  }, [configQuery.error]);

  const baseDraft = useMemo(() => {
    const config = configQuery.data?.config;
    return config ? toConfigDraft(config) : createEmptyDraft();
  }, [configQuery.data?.config]);

  const currentDraft = draft ?? baseDraft;
  const storageStatus = configQuery.data?.storage;
  const canPersistConfig = storageStatus?.canPersist !== false;

  const updateDraft = useCallback(
    (updater: (value: ConfigDraft) => ConfigDraft) => {
      setDraft((previous) => updater(previous ?? baseDraft));
    },
    [baseDraft],
  );

  const updateManagedPages = useCallback(
    (updater: (value: EditableManagedPage[]) => EditableManagedPage[]) => {
      updateDraft((previous) => ({
        ...previous,
        managedPages: updater(previous.managedPages),
      }));
    },
    [updateDraft],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) {
        throw new Error('설정을 저장하려면 로그인 상태여야 합니다.');
      }

      const body: SaveConfigBody = {
        model: currentDraft.model,
        fallbackModels: currentDraft.fallbackModels,
        managedPages: toManagedPagesPayload(currentDraft.managedPages),
        updatedBy: currentUser.displayName || currentUser.email || 'Admin',
      };

      if (replaceApiKey) {
        body.replaceApiKey = true;
        body.apiKey = apiKeyInput;
      } else if (clearApiKey) {
        body.clearApiKey = true;
      }

      return saveAIConfig(currentUser, body);
    },
    onSuccess: (data) => {
      toast.success('설정이 저장되었습니다.');
      queryClient.setQueryData(configQueryKey, data);
      startTransition(() => {
        setDraft(null);
      });
      setApiKeyInput('');
      setReplaceApiKey(false);
      setClearApiKey(false);
    },
    onError: (error) => {
      console.error(error);
      toast.error(error instanceof Error ? error.message : '설정 저장 중 오류가 발생했습니다.');
    },
  });

  const handleDraftField = <K extends keyof ConfigDraft>(field: K, value: ConfigDraft[K]) => {
    updateDraft((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const addCustomPage = () => {
    updateManagedPages((previous) => [
      {
        id: `custom-${Date.now()}`,
        builtIn: false,
        name: '새 커스텀 API',
        pagePath: '/custom',
        apiPath: '/api/custom',
        method: 'POST',
        type: 'custom',
        description: '직접 추가한 API 설정',
        testPayload: {},
        testPayloadText: '{\n  "prompt": ""\n}',
        enabled: true,
      },
      ...previous,
    ]);
  };

  const removeCustomPage = (id: string, name: string) => {
    const confirmed = window.confirm(
      `"${name}" 커스텀 페이지를 삭제할까요?\n저장 전까지는 화면에서만 제거됩니다.`,
    );

    if (!confirmed) return;

    updateManagedPages((previous) => previous.filter((page) => page.id !== id));
  };

  const handlePageField = <K extends keyof EditableManagedPage>(
    index: number,
    field: K,
    value: EditableManagedPage[K],
  ) => {
    updateManagedPages((previous) =>
      previous.map((page, pageIndex) =>
        pageIndex === index
          ? {
              ...page,
              [field]: value,
            }
          : page,
      ),
    );
  };

  const handlePayloadTextChange = (index: number, value: string) => {
    updateManagedPages((previous) =>
      previous.map((page, pageIndex) => {
        if (pageIndex !== index) return page;

        let payloadError: string | undefined;
        try {
          JSON.parse(value || '{}');
        } catch (error) {
          payloadError = error instanceof Error ? error.message : 'JSON 파싱 오류';
        }

        return {
          ...page,
          testPayloadText: value,
          payloadError,
        };
      }),
    );
  };

  const handleSave = () => {
    if (clearApiKey) {
      const confirmed = window.confirm(
        '선택한 API 키 제거 설정을 저장할까요?\n저장 후에는 서버 설정에서 해당 키가 제거됩니다.',
      );

      if (!confirmed) return;
    }

    saveMutation.mutate();
  };

  const loading = isAuthChecking || configQuery.isLoading;
  const saving = saveMutation.isPending;
  const hasInvalidManagedPage = currentDraft.managedPages.some(
    (page) =>
      !page.name.trim() ||
      !page.pagePath.trim() ||
      !page.apiPath.trim() ||
      Boolean(page.payloadError),
  );
  const canSave =
    canPersistConfig &&
    !loading &&
    !saving &&
    (!replaceApiKey || Boolean(apiKeyInput.trim())) &&
    !hasInvalidManagedPage;
  const hasPendingKeyRemoval = clearApiKey;

  if (!currentUser && !isAuthChecking) {
    return (
      <PageWrap $center>
        <LockedState>
          <LockedCard aria-labelledby="openrouter-login-required-title">
            <LockedEyebrow>ADMIN ONLY</LockedEyebrow>
            <LockedTitle id="openrouter-login-required-title">로그인이 필요합니다</LockedTitle>
            <LockedCopy>
              OpenRouter 모델과 적용 페이지 설정은 운영 기능에 직접 반영됩니다.
              관리자 계정으로 로그인한 뒤 설정을 확인하고 저장할 수 있습니다.
            </LockedCopy>
            <LockedActions>
              <Button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                disabled={!canOpenLogin}
              >
                로그인하기
              </Button>
              <Small>우측 상단 프로필 버튼으로도 로그인할 수 있습니다.</Small>
            </LockedActions>
            {!canOpenLogin ? (
              <ErrorText role="status">
                {authError ?? 'Firebase 인증 설정을 확인한 뒤 다시 시도해 주세요.'}
              </ErrorText>
            ) : null}
          </LockedCard>

          <LockedChecklist aria-label="로그인 후 사용할 수 있는 기능">
            <LockedCheckItem>
              <i className="fa-solid fa-key" aria-hidden="true" />
              <div>
                <strong>API 키 보호</strong>
                마스킹된 키 상태를 확인하고 필요한 경우에만 교체합니다.
              </div>
            </LockedCheckItem>
            <LockedCheckItem>
              <i className="fa-solid fa-diagram-project" aria-hidden="true" />
              <div>
                <strong>적용 페이지 관리</strong>
                분석, 이미지 생성, 커스텀 API의 연결 대상을 조정합니다.
              </div>
            </LockedCheckItem>
            <LockedCheckItem>
              <i className="fa-solid fa-sliders" aria-hidden="true" />
              <div>
                <strong>자동 이미지 선택</strong>
                참조 이미지와 프레임을 지원하는 이미지 모델을 OpenRouter에서 자동으로 선택합니다.
              </div>
            </LockedCheckItem>
          </LockedChecklist>
        </LockedState>
        <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
      </PageWrap>
    );
  }

  if (loading) {
    return (
      <PageWrap $center>
        <StatusMessage role="status" aria-live="polite">
          설정을 불러오는 중입니다…
        </StatusMessage>
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <PageShell>
        <PageHeader>
          <HeaderCopy>
            <Eyebrow>AI PROVIDER CONFIG</Eyebrow>
            <PageTitle>OpenRouter 운영 센터</PageTitle>
            <PageSubtitle>텍스트·이미지·영상 생성에 쓸 OpenRouter 모델과 적용 경로를 한곳에서 관리합니다.</PageSubtitle>
          </HeaderCopy>
          <HeaderActions>
            <Button type="button" $variant="secondary" onClick={() => window.location.assign('/admin/openrouter-usage')}>
              <BarChart3 size={16} aria-hidden />
              사용량 보기
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              <Save size={16} aria-hidden />
              {saving ? '저장 중' : canPersistConfig ? '설정 저장' : '저장 불가'}
            </Button>
          </HeaderActions>
        </PageHeader>

        {hasPendingKeyRemoval ? (
          <InlineNotice $tone="warning" role="status">
            <AlertTriangle size={17} aria-hidden />
            키 제거가 선택되어 있습니다. 저장 전까지 서버 설정은 변경되지 않습니다.
          </InlineNotice>
        ) : null}

        <MainPane>
        <Card>
          <CardHeader>
            <CardTitleGroup>
              <SectionIcon>
                <ServerCog size={18} aria-hidden />
              </SectionIcon>
              <div>
                <SectionTitle>OpenRouter 모델 라우팅</SectionTitle>
              <SectionHint>텍스트 모델 ID와 폴백 순서를 관리합니다. 이미지 생성 모델은 요청의 참조 이미지·비율 지원 여부에 맞춰 자동으로 선택됩니다.</SectionHint>
              </div>
            </CardTitleGroup>
          </CardHeader>
          <Grid>
            <Field>
              <Label htmlFor="openrouter-text-model">텍스트 모델</Label>
              <Input
                id="openrouter-text-model"
                name="openrouterTextModel"
                type="text"
                list="openrouter-text-model-candidates"
                value={currentDraft.model}
                aria-describedby="openrouter-text-model-description"
                onChange={(event) => handleDraftField('model', event.target.value)}
              />
              <datalist id="openrouter-text-model-candidates">
                {MODEL_CANDIDATES.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </datalist>
              <Small id="openrouter-text-model-description">
                {MODEL_DESCRIPTIONS[currentDraft.model] || '선택한 텍스트 모델 설명입니다.'}
              </Small>
            </Field>
          </Grid>
          <InlineNotice $tone="info" role="status">
            <WandSparkles size={17} aria-hidden />
            이미지 모델 자동 선택이 켜져 있습니다. OpenRouter의 현재 이미지 모델 기능을 확인해 참조 이미지와 프레임을 지원하는 모델로 요청합니다.
          </InlineNotice>
          <Field>
            <Label htmlFor="openrouter-fallback-models">폴백 모델</Label>
            <Input
              id="openrouter-fallback-models"
              name="openrouterFallbackModels"
              type="text"
              placeholder="예: openai/gpt-4.1-mini, anthropic/claude-sonnet-4"
              value={currentDraft.fallbackModels.join(', ')}
              aria-describedby="openrouter-fallback-models-description"
              onChange={(event) => {
                handleDraftField('fallbackModels', parseFallbackModels(event.target.value, currentDraft.model));
              }}
            />
            <Small id="openrouter-fallback-models-description">쉼표로 구분해 최대 3개까지 지정합니다. 입력한 순서대로 대체 호출합니다.</Small>
          </Field>
        </Card>

        <Card>
          <CardHeader>
            <CardTitleGroup>
              <SectionIcon>
                <KeyRound size={18} aria-hidden />
              </SectionIcon>
              <div>
                <SectionTitle>OpenRouter 키 관리</SectionTitle>
                <SectionHint>텍스트·이미지·영상 생성은 모두 OpenRouter API 키 하나로 처리합니다.</SectionHint>
              </div>
            </CardTitleGroup>
          </CardHeader>

          <KeyGrid>
            <ProviderKeyPanel
              providerName="OpenRouter"
              hasKey={currentDraft.hasApiKey}
              maskedKey={currentDraft.maskedApiKey}
              replaceChecked={replaceApiKey}
              clearChecked={clearApiKey}
              inputValue={apiKeyInput}
              inputId="openrouter-api-key"
              inputName="openrouterApiKey"
              placeholder="sk-or-..."
              onInputChange={setApiKeyInput}
              onReplaceChange={(checked) => {
                setReplaceApiKey(checked);
                if (!checked) {
                  setApiKeyInput('');
                  return;
                }

                setClearApiKey(false);
              }}
              onClearChange={(checked) => {
                if (
                  checked &&
                  !window.confirm(
                    '기존 OpenRouter API 키 제거를 선택할까요?\n저장 버튼을 누르기 전에는 서버 설정이 바뀌지 않습니다.',
                  )
                ) {
                  return;
                }

                setClearApiKey(checked);
                if (checked) {
                  setReplaceApiKey(false);
                  setApiKeyInput('');
                }
              }}
            />
          </KeyGrid>
        </Card>

        <Card>
          <CardHeader>
            <CardTitleGroup>
              <SectionIcon>
                <WandSparkles size={18} aria-hidden />
              </SectionIcon>
              <div>
                <SectionTitle>API 페이지 관리</SectionTitle>
                <SectionHint>페이지별 API 경로와 테스트 payload를 정리합니다.</SectionHint>
              </div>
            </CardTitleGroup>
            <Button type="button" $variant="secondary" onClick={addCustomPage}>
              <Plus size={16} aria-hidden />
              커스텀 추가
            </Button>
          </CardHeader>

          <PageList>
            {currentDraft.managedPages.map((page, index) => (
              <ManagedPageEditor
                key={page.id}
                page={page}
                index={index}
                onFieldChange={handlePageField}
                onPayloadTextChange={handlePayloadTextChange}
                onRemove={removeCustomPage}
              />
            ))}
          </PageList>
        </Card>

        <SaveDock>
          <SplitRow>
            <Small>저장 후 서버 설정에 반영됩니다.</Small>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              <Save size={16} aria-hidden />
              {saving ? '저장 중' : canPersistConfig ? '설정 저장' : '저장 불가'}
            </Button>
          </SplitRow>
          {!canPersistConfig && storageStatus?.message ? (
            <ErrorText role="alert">{storageStatus.message}</ErrorText>
          ) : null}
        </SaveDock>
        </MainPane>
      </PageShell>
    </PageWrap>
  );
}

