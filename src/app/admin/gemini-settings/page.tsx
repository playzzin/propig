'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
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
  DEFAULT_GEMINI_IMAGE_MODEL,
  DEFAULT_GEMINI_MODEL,
  type ManagedApiMethod,
  type ManagedApiPage,
  type ManagedApiPageType,
  mergeManagedPages,
} from '@/lib/gemini-config';

type RuntimeSource = 'firestore' | 'functions_env' | 'server_env' | 'public_env' | 'none';

type ConfigResponse = {
  config: {
    source: RuntimeSource;
    model: string;
    imageModel: string;
    hasApiKey: boolean;
    hasGrokApiKey: boolean;
    maskedApiKey: string;
    maskedGrokApiKey: string;
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

type HealthCheck = {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  latencyMs: number;
  message: string;
  details?: string;
};

type HealthCheckResponse = {
  ok: boolean;
  runtime: {
    source: RuntimeSource;
    model: string;
    imageModel: string;
    hasApiKey: boolean;
    hasGrokApiKey: boolean;
  };
  checks: HealthCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  message?: string;
};

type EditableManagedPage = ManagedApiPage & {
  testPayloadText: string;
  payloadError?: string;
};

type ConfigDraft = {
  source: RuntimeSource;
  model: string;
  imageModel: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  hasGrokApiKey: boolean;
  maskedGrokApiKey: string;
  managedPages: EditableManagedPage[];
  updatedAt: string | null;
  updatedBy: string | null;
};

type SaveConfigBody = {
  apiKey?: string;
  replaceApiKey?: boolean;
  clearApiKey?: boolean;
  grokApiKey?: string;
  replaceGrokApiKey?: boolean;
  clearGrokApiKey?: boolean;
  model: string;
  imageModel: string;
  managedPages: ManagedApiPage[];
  updatedBy: string;
};

const GEMINI_CONFIG_QUERY_KEY = ['gemini-config'] as const;

const MODEL_CANDIDATES = [
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.0-pro-preview',
  'gemini-3.0-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const IMAGE_MODEL_CANDIDATES = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-exp-image-generation',
  'imagen-3.0-generate-001',
];

const MODEL_DESCRIPTIONS: Record<string, string> = {
  'gemini-3.1-pro-preview': '복잡한 추론과 긴 문맥 작업에 적합한 고성능 프리뷰 모델입니다.',
  'gemini-3.1-flash-lite-preview': '속도와 비용 효율을 우선할 때 적합한 경량 프리뷰 모델입니다.',
  'gemini-3.0-pro-preview': '정확도 중심의 범용 텍스트 작업에 적합한 프로 계열 프리뷰 모델입니다.',
  'gemini-3.0-flash-preview': '빠른 응답이 필요한 대화형 작업에 적합한 플래시 프리뷰 모델입니다.',
  'gemini-2.5-flash': '속도와 품질의 균형이 좋아 일반 업무 자동화에 적합한 모델입니다.',
  'gemini-2.5-pro': '깊은 추론과 복잡한 생성 작업에 유리한 상위 모델입니다.',
  'gemini-2.0-flash': '가벼운 자동화와 빠른 응답에 적합한 플래시 모델입니다.',
  'gemini-1.5-flash': '레거시 호환이 필요한 환경에서 쓰기 좋은 경량 모델입니다.',
};

const IMAGE_MODEL_DESCRIPTIONS: Record<string, string> = {
  'gemini-3.1-flash-image-preview': '최신 이미지 생성 계열 프리뷰 모델입니다.',
  'gemini-3-pro-image-preview': '고품질 이미지 생성과 정교한 비주얼 작업에 적합한 프로 이미지 모델입니다.',
  'gemini-2.5-flash-image': '빠른 이미지 생성과 반복 작업에 적합한 모델입니다.',
  'gemini-2.0-flash-exp-image-generation': '실험용 이미지 생성 모델입니다.',
  'imagen-3.0-generate-001': 'Imagen 계열 전용 이미지 생성 모델입니다.',
};

const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

const pageFieldId = (pageId: string, field: string) =>
  `gemini-page-${sanitizeId(pageId)}-${field}`;

const formatUpdatedAt = (value: string | null) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const createEmptyDraft = (): ConfigDraft => ({
  source: 'none',
  model: DEFAULT_GEMINI_MODEL,
  imageModel: DEFAULT_GEMINI_IMAGE_MODEL,
  hasApiKey: false,
  maskedApiKey: '',
  hasGrokApiKey: false,
  maskedGrokApiKey: '',
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
  model: config.model || DEFAULT_GEMINI_MODEL,
  imageModel: config.imageModel || DEFAULT_GEMINI_IMAGE_MODEL,
  hasApiKey: config.hasApiKey,
  maskedApiKey: config.maskedApiKey || '',
  hasGrokApiKey: config.hasGrokApiKey,
  maskedGrokApiKey: config.maskedGrokApiKey || '',
  managedPages: toEditableManagedPages(config.managedPages || []),
  updatedAt: config.updatedAt || null,
  updatedBy: config.updatedBy || null,
});

async function fetchGeminiConfig(user: User): Promise<ConfigResponse> {
  const token = await user.getIdToken();
  const response = await fetch('/api/gemini-config', {
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

async function saveGeminiConfig(user: User, body: SaveConfigBody): Promise<ConfigResponse> {
  const token = await user.getIdToken();
  const response = await fetch('/api/gemini-config', {
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

async function requestGeminiHealthCheck(
  user: User,
  includeImageTest: boolean,
): Promise<HealthCheckResponse> {
  const token = await user.getIdToken();
  const response = await fetch('/api/gemini-config/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ includeImageTest }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (HealthCheckResponse & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || '헬스 체크 요청에 실패했습니다.');
  }

  return payload as HealthCheckResponse;
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

const SummaryGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const StatusTile = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 88%, transparent);
`;

const StatusLabel = styled.span`
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 700;
`;

const StatusValue = styled.strong`
  min-width: 0;
  color: var(--text-main);
  font-size: 1rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

const StatusMeta = styled.span`
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
  gap: 16px;
  align-items: start;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`;

const MainPane = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SidePane = styled.aside`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 0;
  max-height: calc(100vh - 112px);
  overflow-y: auto;

  @media (max-width: 1120px) {
    position: static;
    max-height: none;
    overflow: visible;
  }
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

const Divider = styled.div`
  height: 1px;
  background: var(--border-medium);
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

const StatLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  color: var(--text-main);
  font-size: 0.84rem;

  span:first-child {
    color: var(--text-muted);
  }
`;

const CheckGrid = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
`;

const CheckItem = styled.li<{ $status: 'passed' | 'failed' | 'skipped' }>`
  padding: 11px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid
    ${({ $status }) =>
      $status === 'passed'
        ? 'rgba(16, 185, 129, 0.2)'
        : $status === 'failed'
          ? 'rgba(239, 68, 68, 0.26)'
          : 'var(--border-medium)'};
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const CheckTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-main);
  font-size: 0.82rem;
  font-weight: 800;
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

function sourceLabel(source: RuntimeSource) {
  switch (source) {
    case 'firestore':
      return 'Firestore';
    case 'functions_env':
      return 'Functions Secret';
    case 'server_env':
      return 'Server ENV';
    case 'public_env':
      return 'Public ENV';
    default:
      return '설정 없음';
  }
}

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

function checkStatusLabel(status: HealthCheck['status']) {
  switch (status) {
    case 'passed':
      return '정상';
    case 'failed':
      return '실패';
    case 'skipped':
      return '건너뜀';
    default:
      return status;
  }
}

function checkStatusTone(status: HealthCheck['status']): PillTone {
  switch (status) {
    case 'passed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'skipped':
      return 'neutral';
    default:
      return 'info';
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

function HealthResultPanel({ result }: { result: HealthCheckResponse | null }) {
  if (!result) {
    return (
      <InlineNotice>
        <Activity size={17} aria-hidden />
        헬스 체크를 실행하면 각 API의 provider, 응답 시간, 실패 사유가 여기에 표시됩니다.
      </InlineNotice>
    );
  }

  return (
    <>
      <SplitRow>
        <Pill $tone={result.ok ? 'success' : 'danger'}>
          {result.ok ? <CheckCircle2 size={13} aria-hidden /> : <AlertTriangle size={13} aria-hidden />}
          {result.ok ? '전체 정상' : '문제 발견'}
        </Pill>
        <Small>
          성공 {result.summary.passed} / 실패 {result.summary.failed} / 건너뜀{' '}
          {result.summary.skipped}
        </Small>
      </SplitRow>

      <StatLine>
        <span>Gemini 키</span>
        <Pill $tone={result.runtime.hasApiKey ? 'success' : 'warning'}>
          {result.runtime.hasApiKey ? '감지됨' : '없음'}
        </Pill>
      </StatLine>
      <StatLine>
        <span>Grok 키</span>
        <Pill $tone={result.runtime.hasGrokApiKey ? 'success' : 'warning'}>
          {result.runtime.hasGrokApiKey ? '감지됨' : '없음'}
        </Pill>
      </StatLine>
      {result.message ? <Small>{result.message}</Small> : null}

      <CheckGrid>
        {result.checks.map((check) => {
          const StatusIcon = check.status === 'passed' ? CheckCircle2 : check.status === 'failed' ? AlertTriangle : Activity;

          return (
            <CheckItem key={check.id} $status={check.status}>
              <CheckTitle>
                <Row>
                  <StatusIcon size={15} aria-hidden />
                  <span>{check.name}</span>
                </Row>
                <Pill $tone={checkStatusTone(check.status)}>{checkStatusLabel(check.status)}</Pill>
              </CheckTitle>
              <Small>
                {check.message} ({check.latencyMs}ms)
              </Small>
              {check.details ? <Small>{check.details}</Small> : null}
            </CheckItem>
          );
        })}
      </CheckGrid>
    </>
  );
}

export default function GeminiSettingsPage() {
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
  const [grokApiKeyInput, setGrokApiKeyInput] = useState('');
  const [replaceGrokApiKey, setReplaceGrokApiKey] = useState(false);
  const [clearGrokApiKey, setClearGrokApiKey] = useState(false);
  const [includeImageTest, setIncludeImageTest] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthCheckResponse | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);

  const configQueryKey = useMemo(
    () => [...GEMINI_CONFIG_QUERY_KEY, currentUser?.uid ?? 'anonymous'] as const,
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
    queryFn: () => fetchGeminiConfig(currentUser as User),
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
        imageModel: currentDraft.imageModel,
        managedPages: toManagedPagesPayload(currentDraft.managedPages),
        updatedBy: currentUser.displayName || currentUser.email || 'Admin',
      };

      if (replaceApiKey) {
        body.replaceApiKey = true;
        body.apiKey = apiKeyInput;
      } else if (clearApiKey) {
        body.clearApiKey = true;
      }

      if (replaceGrokApiKey) {
        body.replaceGrokApiKey = true;
        body.grokApiKey = grokApiKeyInput;
      } else if (clearGrokApiKey) {
        body.clearGrokApiKey = true;
      }

      return saveGeminiConfig(currentUser, body);
    },
    onSuccess: (data) => {
      toast.success('설정이 저장되었습니다.');
      queryClient.setQueryData(configQueryKey, data);
      startTransition(() => {
        setDraft(null);
        setHealthResult(null);
      });
      setApiKeyInput('');
      setGrokApiKeyInput('');
      setReplaceApiKey(false);
      setClearApiKey(false);
      setReplaceGrokApiKey(false);
      setClearGrokApiKey(false);
    },
    onError: (error) => {
      console.error(error);
      toast.error(error instanceof Error ? error.message : '설정 저장 중 오류가 발생했습니다.');
    },
  });

  const healthCheckMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) {
        throw new Error('헬스 체크를 실행하려면 로그인 상태여야 합니다.');
      }

      return requestGeminiHealthCheck(currentUser, includeImageTest);
    },
    onMutate: () => {
      setHealthResult(null);
    },
    onSuccess: (data) => {
      setHealthResult(data);
      if (data.ok) {
        toast.success('헬스 체크가 완료되었습니다.');
        return;
      }

      toast.error('헬스 체크에서 문제가 발견되었습니다.');
    },
    onError: (error) => {
      console.error(error);
      toast.error(error instanceof Error ? error.message : '헬스 체크 실행 중 오류가 발생했습니다.');
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
    if (clearApiKey || clearGrokApiKey) {
      const confirmed = window.confirm(
        '선택한 API 키 제거 설정을 저장할까요?\n저장 후에는 서버 설정에서 해당 키가 제거됩니다.',
      );

      if (!confirmed) return;
    }

    saveMutation.mutate();
  };

  const runHealthCheck = () => {
    healthCheckMutation.mutate();
  };

  const loading = isAuthChecking || configQuery.isLoading;
  const saving = saveMutation.isPending;
  const testing = healthCheckMutation.isPending;
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
    (!replaceGrokApiKey || Boolean(grokApiKeyInput.trim())) &&
    !hasInvalidManagedPage;
  const enabledPageCount = currentDraft.managedPages.filter((page) => page.enabled).length;
  const customPageCount = currentDraft.managedPages.filter((page) => !page.builtIn).length;
  const failedHealthCount = healthResult?.summary.failed ?? 0;
  const hasPendingKeyRemoval = clearApiKey || clearGrokApiKey;
  const geminiKeyExpired = Boolean(
    healthResult?.checks.some((check) => {
      const content = `${check.message} ${check.details ?? ''}`;
      return check.status === 'failed' && /api key expired|api_key_invalid|renew the api key/i.test(content);
    }),
  );

  if (!currentUser && !isAuthChecking) {
    return (
      <PageWrap $center>
        <LockedState>
          <LockedCard aria-labelledby="gemini-login-required-title">
            <LockedEyebrow>ADMIN ONLY</LockedEyebrow>
            <LockedTitle id="gemini-login-required-title">로그인이 필요합니다</LockedTitle>
            <LockedCopy>
              Gemini와 Grok API 키, 모델, 적용 페이지 설정은 운영 기능에 직접 반영됩니다.
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
              <i className="fa-solid fa-heart-pulse" aria-hidden="true" />
              <div>
                <strong>헬스 체크</strong>
                저장된 모델과 provider가 실제로 동작하는지 검증합니다.
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
            <PageTitle>Gemini · Grok 운영 설정</PageTitle>
            <PageSubtitle>키 상태, 모델, 적용 페이지, 진단 결과를 한 화면에서 관리합니다.</PageSubtitle>
          </HeaderCopy>
          <HeaderActions>
            <Button type="button" $variant="secondary" onClick={runHealthCheck} disabled={testing || loading}>
              <Activity size={16} aria-hidden />
              {testing ? '진단 중' : '헬스 체크'}
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              <Save size={16} aria-hidden />
              {saving ? '저장 중' : canPersistConfig ? '설정 저장' : '저장 불가'}
            </Button>
          </HeaderActions>
        </PageHeader>

        {geminiKeyExpired ? (
          <InlineNotice $tone="danger" role="alert">
            <AlertTriangle size={17} aria-hidden />
            Gemini API 키가 만료된 상태입니다. 새 키를 입력한 뒤 설정을 저장하세요.
          </InlineNotice>
        ) : null}

        {hasPendingKeyRemoval ? (
          <InlineNotice $tone="warning" role="status">
            <AlertTriangle size={17} aria-hidden />
            키 제거가 선택되어 있습니다. 저장 전까지 서버 설정은 변경되지 않습니다.
          </InlineNotice>
        ) : null}

        <SummaryGrid aria-label="AI 설정 요약">
          <StatusTile>
            <StatusLabel>Gemini 키</StatusLabel>
            <StatusValue>{currentDraft.hasApiKey ? '설정됨' : '없음'}</StatusValue>
            <StatusMeta>{currentDraft.maskedApiKey || '텍스트와 Gemini 이미지 호출에 사용됩니다.'}</StatusMeta>
          </StatusTile>
          <StatusTile>
            <StatusLabel>Grok 키</StatusLabel>
            <StatusValue>{currentDraft.hasGrokApiKey ? '설정됨' : '없음'}</StatusValue>
            <StatusMeta>{currentDraft.maskedGrokApiKey || 'Grok fallback과 이미지/동영상 확인에 사용됩니다.'}</StatusMeta>
          </StatusTile>
          <StatusTile>
            <StatusLabel>관리 페이지</StatusLabel>
            <StatusValue>
              {enabledPageCount} / {currentDraft.managedPages.length} 사용
            </StatusValue>
            <StatusMeta>커스텀 {customPageCount}개 · JSON 오류 {hasInvalidManagedPage ? '있음' : '없음'}</StatusMeta>
          </StatusTile>
          <StatusTile>
            <StatusLabel>최근 진단</StatusLabel>
            <StatusValue>{healthResult ? (failedHealthCount > 0 ? '문제 발견' : '정상') : '미실행'}</StatusValue>
            <StatusMeta>
              {healthResult
                ? `성공 ${healthResult.summary.passed} · 실패 ${healthResult.summary.failed}`
                : `마지막 업데이트 ${formatUpdatedAt(currentDraft.updatedAt)}`}
            </StatusMeta>
          </StatusTile>
        </SummaryGrid>

        <ContentGrid>
          <MainPane>
        <Card>
          <CardHeader>
            <CardTitleGroup>
              <SectionIcon>
                <ServerCog size={18} aria-hidden />
              </SectionIcon>
              <div>
                <SectionTitle>모델 설정</SectionTitle>
                <SectionHint>텍스트와 이미지 생성에 사용할 기본 모델입니다.</SectionHint>
              </div>
            </CardTitleGroup>
          </CardHeader>
          <Grid>
            <Field>
              <Label htmlFor="gemini-text-model">텍스트 모델</Label>
              <Select
                id="gemini-text-model"
                name="geminiTextModel"
                value={currentDraft.model}
                aria-describedby="gemini-text-model-description"
                onChange={(event) => handleDraftField('model', event.target.value)}
              >
                {MODEL_CANDIDATES.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </Select>
              <Small id="gemini-text-model-description">
                {MODEL_DESCRIPTIONS[currentDraft.model] || '선택한 텍스트 모델 설명입니다.'}
              </Small>
            </Field>
            <Field>
              <Label htmlFor="gemini-image-model">이미지 모델</Label>
              <Select
                id="gemini-image-model"
                name="geminiImageModel"
                value={currentDraft.imageModel}
                aria-describedby="gemini-image-model-description"
                onChange={(event) => handleDraftField('imageModel', event.target.value)}
              >
                {IMAGE_MODEL_CANDIDATES.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </Select>
              <Small id="gemini-image-model-description">
                {IMAGE_MODEL_DESCRIPTIONS[currentDraft.imageModel] || '선택한 이미지 모델 설명입니다.'}
              </Small>
            </Field>
          </Grid>
        </Card>

        <Card>
          <CardHeader>
            <CardTitleGroup>
              <SectionIcon>
                <KeyRound size={18} aria-hidden />
              </SectionIcon>
              <div>
                <SectionTitle>API 키 관리</SectionTitle>
                <SectionHint>교체 또는 제거를 선택한 뒤 저장하면 서버 설정에 반영됩니다.</SectionHint>
              </div>
            </CardTitleGroup>
          </CardHeader>

          <KeyGrid>
            <ProviderKeyPanel
              providerName="Gemini"
              hasKey={currentDraft.hasApiKey}
              maskedKey={currentDraft.maskedApiKey}
              replaceChecked={replaceApiKey}
              clearChecked={clearApiKey}
              inputValue={apiKeyInput}
              inputId="gemini-api-key"
              inputName="geminiApiKey"
              placeholder="AIza..."
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
                    '기존 Gemini API 키 제거를 선택할까요?\n저장 버튼을 누르기 전에는 서버 설정이 바뀌지 않습니다.',
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
            <ProviderKeyPanel
              providerName="Grok"
              hasKey={currentDraft.hasGrokApiKey}
              maskedKey={currentDraft.maskedGrokApiKey}
              helper="Grok fallback, 이미지 생성, 동영상 준비 상태 확인에 사용됩니다."
              replaceChecked={replaceGrokApiKey}
              clearChecked={clearGrokApiKey}
              inputValue={grokApiKeyInput}
              inputId="grok-api-key"
              inputName="grokApiKey"
              placeholder="xai-..."
              onInputChange={setGrokApiKeyInput}
              onReplaceChange={(checked) => {
                setReplaceGrokApiKey(checked);
                if (!checked) {
                  setGrokApiKeyInput('');
                  return;
                }

                setClearGrokApiKey(false);
              }}
              onClearChange={(checked) => {
                if (
                  checked &&
                  !window.confirm(
                    '기존 Grok API 키 제거를 선택할까요?\n저장 버튼을 누르기 전에는 서버 설정이 바뀌지 않습니다.',
                  )
                ) {
                  return;
                }

                setClearGrokApiKey(checked);
                if (checked) {
                  setReplaceGrokApiKey(false);
                  setGrokApiKeyInput('');
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

      <SidePane>
        <Card>
          <CardHeader>
            <CardTitleGroup>
              <SectionIcon>
                <ServerCog size={18} aria-hidden />
              </SectionIcon>
              <div>
                <SectionTitle>실행 설정</SectionTitle>
                <SectionHint>현재 런타임에서 읽은 설정입니다.</SectionHint>
              </div>
            </CardTitleGroup>
          </CardHeader>
          <StatLine>
            <span>설정 소스</span>
            <Pill $tone={currentDraft.source === 'firestore' ? 'success' : 'neutral'}>
              {sourceLabel(currentDraft.source)}
            </Pill>
          </StatLine>
          <StatLine>
            <span>저장 가능</span>
            <Pill $tone={canPersistConfig ? 'success' : 'danger'}>
              {canPersistConfig ? '가능' : '불가'}
            </Pill>
          </StatLine>
          <StatLine>
            <span>Grok 키</span>
            <Pill $tone={currentDraft.hasGrokApiKey ? 'success' : 'warning'}>
              {currentDraft.hasGrokApiKey ? '설정됨' : '없음'}
            </Pill>
          </StatLine>
          {storageStatus?.message ? (
            <InlineNotice $tone={canPersistConfig ? 'info' : 'danger'} role={canPersistConfig ? 'status' : 'alert'}>
              <AlertTriangle size={17} aria-hidden />
              {storageStatus.message}
            </InlineNotice>
          ) : null}
          <Divider />
          <StatLine>
            <span>마지막 업데이트</span>
            <strong>{formatUpdatedAt(currentDraft.updatedAt)}</strong>
          </StatLine>
          <StatLine>
            <span>마지막 수정자</span>
            <strong>{currentDraft.updatedBy || '-'}</strong>
          </StatLine>
        </Card>

        <Card>
          <CardHeader>
            <CardTitleGroup>
              <SectionIcon>
                <Activity size={18} aria-hidden />
              </SectionIcon>
              <div>
                <SectionTitle>헬스 체크</SectionTitle>
                <SectionHint>저장된 키와 모델로 실제 호출을 확인합니다.</SectionHint>
              </div>
            </CardTitleGroup>
          </CardHeader>
          <CheckboxLabel>
            <input
              type="checkbox"
              name="includeImageHealthCheck"
              checked={includeImageTest}
              onChange={(event) => setIncludeImageTest(event.target.checked)}
            />
            이미지 생성 API(Gemini/Grok)도 함께 테스트
          </CheckboxLabel>
          <Row>
            <Button type="button" onClick={runHealthCheck} disabled={testing || loading}>
              <Activity size={16} aria-hidden />
              {testing ? '실행 중' : '헬스 체크 실행'}
            </Button>
          </Row>
        </Card>

        <Card>
          <CardHeader>
            <CardTitleGroup>
              <SectionIcon>
                {healthResult?.ok ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
              </SectionIcon>
              <div>
                <SectionTitle>헬스 체크 결과</SectionTitle>
                <SectionHint>실패한 항목의 상세 메시지만 펼쳐서 확인하면 됩니다.</SectionHint>
              </div>
            </CardTitleGroup>
          </CardHeader>
          <HealthResultPanel result={healthResult} />
        </Card>
      </SidePane>
        </ContentGrid>
      </PageShell>
    </PageWrap>
  );
}

