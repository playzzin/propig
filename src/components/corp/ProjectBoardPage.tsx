'use client';

import React from 'react';
import styled from 'styled-components';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardList,
  Eye,
  FolderPlus,
  FolderOpen,
  Gauge,
  ImagePlus,
  Image as ImageIcon,
  Layers3,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Tag,
  Target,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CorpPageDefinition } from '@/constants/corpPages';
import { useAuth } from '@/contexts/AuthContext';
import { buildJsonAuthHeaders } from '@/lib/client-auth';
import { PHOTO_ALBUMS_QUERY_KEY, usePhotoAlbumsQuery } from '@/hooks/usePhotoAlbumsQuery';
import { photoService } from '@/services/photoService';
import { projectBoardService } from '@/services/projectBoardService';
import type { PhotoItem } from '@/services/photoService';

type BoardMode = 'project' | 'portfolio';
type DetailTab = 'plan' | 'tasks' | 'goal';

interface BoardCategory {
  id: string;
  name: string;
  description: string;
  color: string;
}

interface BoardTask {
  id: string;
  title: string;
  done: boolean;
  imageUrl?: string;
}

interface BoardPlanStage {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
}

interface BoardItem {
  id: string;
  title: string;
  categoryId: string;
  owner: string;
  dueDate: string;
  imageUrl: string;
  summary: string;
  currentBody: string;
  currentHtml?: string;
  planBody: string;
  planHtml?: string;
  planStages?: BoardPlanStage[];
  tasks: BoardTask[];
  goalBody: string;
  goalHtml?: string;
  stageLabel: string;
  statusLabel: string;
}

interface BoardData {
  categories: BoardCategory[];
  items: BoardItem[];
}

interface BoardItemDraft {
  title: string;
  categoryId: string;
  owner: string;
  dueDate: string;
  imageUrl: string;
  summary: string;
  currentBody: string;
  currentHtml: string;
  planBody: string;
  planHtml: string;
  planStages: BoardPlanStageDraft[];
  tasks: BoardTaskDraft[];
  goalBody: string;
  goalHtml: string;
  stageLabel: string;
  statusLabel: string;
}

interface BoardTaskDraft {
  id: string;
  title: string;
  done: boolean;
  imageUrl: string;
}

interface BoardPlanStageDraft {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
}

interface CategoryDraft {
  name: string;
  description: string;
  color: string;
}

interface ProjectBoardPageProps {
  page: CorpPageDefinition;
  mode: BoardMode;
  management?: boolean;
  canManage?: boolean;
}

type ImageTarget =
  | { type: 'cover' }
  | { type: 'plan-stage'; stageId: string }
  | { type: 'task'; taskId: string };

type ContentGenerationTarget = Exclude<DetailTab, 'tasks'>;

interface GeneratedBoardContent {
  currentHtml?: string;
  planHtml?: string;
  goalHtml?: string;
}

interface GenerateProjectBoardContentResponse {
  success?: boolean;
  content?: GeneratedBoardContent;
  error?: string;
}

type BoardConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  tone: 'danger' | 'warning';
  onConfirm: () => Promise<void>;
};

type ImagePreviewState = {
  url: string;
  title: string;
  caption: string;
};

const palette = ['#0f9f87', '#2563eb', '#d97706', '#dc4a57', '#7c3aed', '#334155'];

const boardCopy: Record<
  BoardMode,
  {
    eyebrow: string;
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
    addLabel: string;
    storageKey: string;
  }
> = {
  project: {
    eyebrow: 'Project planning board',
    title: '프로젝트 계획 보드',
    description: '목표를 세우고, 과제를 나누고, 진행률을 한 화면에서 추적합니다.',
    emptyTitle: '조건에 맞는 프로젝트가 없습니다',
    emptyDescription: '검색어나 카테고리를 조정하거나 새 프로젝트를 추가하세요.',
    addLabel: '프로젝트 추가',
    storageKey: 'propig.project-board.project.v1',
  },
  portfolio: {
    eyebrow: 'Portfolio magazine',
    title: '성과 포트폴리오',
    description: '완료된 프로젝트의 계획, 실행 과제, 목표 달성 내용을 사진형 기록으로 정리합니다.',
    emptyTitle: '조건에 맞는 포트폴리오가 없습니다',
    emptyDescription: '검색어나 카테고리를 조정하거나 새 성과 기록을 추가하세요.',
    addLabel: '성과 기록 추가',
    storageKey: 'propig.project-board.portfolio.v1',
  },
};

const detailTabs: Record<
  DetailTab,
  {
    label: string;
    Icon: typeof ClipboardList;
  }
> = {
  plan: { label: '계획', Icon: ClipboardList },
  tasks: { label: '과제', Icon: ListChecks },
  goal: { label: '목표', Icon: Target },
};

const detailTabOrder: DetailTab[] = ['plan', 'tasks', 'goal'];
const contentGenerationTabs: ContentGenerationTarget[] = ['plan', 'goal'];
const allowedDecoratedHtmlTags = new Set([
  'article',
  'section',
  'header',
  'div',
  'h3',
  'h4',
  'p',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'strong',
  'em',
  'b',
  'i',
  'span',
  'small',
  'br',
]);

const DEFAULT_BOARDS: Record<BoardMode, BoardData> = {
  project: {
    categories: [
      { id: 'strategy', name: '전략기획', description: '목표와 범위를 먼저 정리하는 프로젝트', color: '#0f9f87' },
      { id: 'operation', name: '운영개선', description: '반복 업무와 병목을 줄이는 실행 과제', color: '#2563eb' },
      { id: 'growth', name: '성장실험', description: '성과 지표를 빠르게 검증하는 프로젝트', color: '#d97706' },
    ],
    items: [
      {
        id: 'project-ai-workflow',
        title: 'AI 업무 흐름 고도화',
        categoryId: 'strategy',
        owner: '기획팀',
        dueDate: '2026-06-21',
        imageUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1400&q=80',
        summary: '반복 요청을 AI 에이전트 흐름으로 분해해 응답 속도와 품질을 동시에 개선합니다.',
        currentBody:
          '현재는 요청 유형 샘플링과 분류 기준 정리가 완료된 상태입니다. 남은 과제는 응답 초안 UI 연결과 운영 담당자 검수 흐름 테스트입니다.',
        planBody:
          '고객 요청 접수부터 분류, 담당자 배정, 결과 검수까지 이어지는 현재 흐름을 맵으로 정리합니다. 병목이 큰 접점부터 자동화 후보를 선정하고, 사람이 승인해야 하는 지점을 명확히 둡니다.',
        tasks: [
          {
            id: 'task-ai-1',
            title: '요청 유형 20개 샘플링',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-ai-2',
            title: '분류 기준과 예외 규칙 정의',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-ai-3',
            title: '에이전트 응답 초안 UI 연결',
            done: false,
            imageUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-ai-4',
            title: '운영 담당자 검수 플로우 테스트',
            done: false,
            imageUrl: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80',
          },
        ],
        goalBody:
          '반복 문의 처리 시간을 35% 줄이고, 담당자가 직접 개입해야 하는 예외 상황을 추적 가능한 목록으로 남기는 것이 핵심 목표입니다.',
        stageLabel: '2분기 핵심',
        statusLabel: '진행중',
      },
      {
        id: 'project-content-studio',
        title: '콘텐츠 제작 보드',
        categoryId: 'operation',
        owner: '콘텐츠팀',
        dueDate: '2026-07-04',
        imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80',
        summary: '아이디어, 원고, 이미지, 게시 상태를 한 장의 보드에서 관리합니다.',
        currentBody:
          '현재 콘텐츠 카테고리와 사진형 카드 구조는 정리되었습니다. 월간 성과 리포트 연결만 남아 있어 완료 후 포트폴리오 기록으로 전환할 수 있습니다.',
        planBody:
          '웹진형 콘텐츠를 주제별로 묶고, 원고 상태와 이미지 준비 상태를 같은 단위로 관리합니다. 카드 클릭 시 기획 의도, 작업 항목, 발행 목표를 바로 볼 수 있게 구성합니다.',
        tasks: [
          {
            id: 'task-content-1',
            title: '콘텐츠 카테고리 6개 정리',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-content-2',
            title: '사진형 카드 레이아웃 검토',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-content-3',
            title: '발행 전 검수 체크리스트 적용',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-content-4',
            title: '월간 성과 리포트 연결',
            done: false,
            imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80',
          },
        ],
        goalBody:
          '콘텐츠별 상태를 한눈에 보여주고, 발행 누락을 줄이며, 완료된 결과물을 포트폴리오로 전환할 수 있는 구조를 만드는 것이 목표입니다.',
        stageLabel: '운영개선',
        statusLabel: '검증',
      },
      {
        id: 'project-market-signal',
        title: '시장 반응 실험',
        categoryId: 'growth',
        owner: '성장팀',
        dueDate: '2026-07-18',
        imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1400&q=80',
        summary: '작은 실험 단위로 메시지, 채널, 전환 지표를 비교합니다.',
        currentBody:
          '현재 핵심 가설 3개가 정리되었습니다. 채널별 메시지 변형 제작과 전환 이벤트 기준 연결이 다음 실행 순서입니다.',
        planBody:
          '가설을 하나의 카드로 만들고, 채널별 노출과 반응을 같은 규칙으로 기록합니다. 각 실험은 최소 실행 단위, 판단 기준, 다음 행동으로 분리합니다.',
        tasks: [
          {
            id: 'task-market-1',
            title: '핵심 가설 3개 작성',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-market-2',
            title: '채널별 메시지 변형 제작',
            done: false,
            imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-market-3',
            title: '전환 이벤트 기준 연결',
            done: false,
            imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80',
          },
        ],
        goalBody:
          '2주 안에 가장 반응이 좋은 메시지 조합을 찾고, 다음 캠페인의 예산 배분 기준으로 사용할 수 있는 근거를 확보합니다.',
        stageLabel: '실험',
        statusLabel: '준비',
      },
    ],
  },
  portfolio: {
    categories: [
      { id: 'completed', name: '완료 프로젝트', description: '완료 후 재사용 가능한 성과 기록', color: '#0f9f87' },
      { id: 'customer-impact', name: '고객성과', description: '고객 경험과 지표 개선이 확인된 사례', color: '#dc4a57' },
      { id: 'automation', name: '자동화', description: '반복 업무를 줄인 운영 자동화 사례', color: '#2563eb' },
    ],
    items: [
      {
        id: 'portfolio-ops-dashboard',
        title: '운영 대시보드 구축',
        categoryId: 'completed',
        owner: '운영팀',
        dueDate: '2026-04-30',
        imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80',
        summary: '분산된 업무 현황을 하나의 대시보드로 통합해 의사결정 시간을 줄였습니다.',
        currentBody:
          '현재 모든 구축 과제가 완료되어 운영 회의에서 사용 중입니다. 다음 단계는 지표 확장과 부서별 맞춤 뷰 정리입니다.',
        planBody:
          '주요 지표, 업무 상태, 담당자별 병목을 같은 화면에 배치하는 것을 목표로 했습니다. 우선순위가 높은 지표부터 시작해 운영 회의에서 바로 쓰는 뷰로 좁혔습니다.',
        tasks: [
          {
            id: 'task-ops-1',
            title: '지표 목록 확정',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-ops-2',
            title: '데이터 연결',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-ops-3',
            title: '모바일 확인 화면 정리',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-ops-4',
            title: '운영 회의 피드백 반영',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
          },
        ],
        goalBody:
          '회의 준비 시간을 줄이고, 지연 이슈를 회의 전에 발견할 수 있도록 만드는 목표를 달성했습니다.',
        stageLabel: '완료',
        statusLabel: '100%',
      },
      {
        id: 'portfolio-customer-care',
        title: '고객 응대 품질 개선',
        categoryId: 'customer-impact',
        owner: 'CX팀',
        dueDate: '2026-03-19',
        imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1400&q=80',
        summary: '응대 기준과 이슈 분류표를 정비해 반복 문의 대응 품질을 높였습니다.',
        currentBody:
          '현재 품질 리뷰 기준 배포까지 완료되었습니다. 신규 담당자 온보딩 자료에 이 구조를 반영하는 후속 작업만 남았습니다.',
        planBody:
          '고객 문의를 유형별로 묶고, 답변 품질이 흔들리는 구간을 표준 문서와 검수 루틴으로 보강했습니다.',
        tasks: [
          {
            id: 'task-care-1',
            title: '문의 유형 재분류',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-care-2',
            title: '답변 템플릿 정비',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-care-3',
            title: '품질 리뷰 기준 배포',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80',
          },
        ],
        goalBody:
          '신규 담당자도 같은 기준으로 응대할 수 있게 만들고, 고객 재문의율을 낮추는 것이 목표였습니다.',
        stageLabel: '고객성과',
        statusLabel: '완료',
      },
      {
        id: 'portfolio-approval-flow',
        title: '승인 프로세스 자동화',
        categoryId: 'automation',
        owner: '자동화팀',
        dueDate: '2026-02-28',
        imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1400&q=80',
        summary: '반복 승인 요청을 규칙화해 누락과 지연을 줄였습니다.',
        currentBody:
          '현재 승인 조건, 상태 변경 알림, 예외 승인 로그, 관리자 검수까지 완료되었습니다. 운영팀에서 실제 승인 흐름에 적용 중입니다.',
        planBody:
          '승인 요청의 입력 항목, 담당자, 예외 기준을 명확히 분리했습니다. 알림과 상태 변경을 자동화하되 최종 판단은 담당자가 확인하도록 설계했습니다.',
        tasks: [
          {
            id: 'task-approval-1',
            title: '승인 조건 표준화',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-approval-2',
            title: '상태 변경 알림 연결',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-approval-3',
            title: '예외 승인 로그 저장',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'task-approval-4',
            title: '관리자 검수 완료',
            done: true,
            imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
          },
        ],
        goalBody:
          '처리 누락을 줄이고 승인 이력을 추적 가능한 형태로 남겨 운영 투명성을 높였습니다.',
        stageLabel: '자동화',
        statusLabel: '완료',
      },
    ],
  },
};

function cloneBoardData(data: BoardData): BoardData {
  const normalized = normalizeBoardData(data);

  return {
    categories: normalized.categories.map((category) => ({ ...category })),
    items: normalized.items.map((item) => ({
      ...item,
      planStages: item.planStages?.map((stage) => ({ ...stage })),
      tasks: item.tasks.map((task) => ({ ...task })),
    })),
  };
}

function sanitizeDecoratedHtml(value?: string): string | undefined {
  if (!value || typeof value !== 'string') return undefined;

  const cleaned = value
    .replace(/```(?:html)?/gi, '')
    .replace(/```/g, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)\b[\s\S]*?<\/(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)>/gi, '')
    .replace(/<(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)\b[^>]*\/?>/gi, '')
    .replace(/<\/?([a-z][a-z0-9-]*)([^>]*)>/gi, (match, tagName, attrs) => {
      const tag = String(tagName).toLowerCase();
      if (!allowedDecoratedHtmlTags.has(tag)) return '';
      if (match.startsWith('</')) return `</${tag}>`;
      if (tag === 'br') return '<br>';

      const safeAttrs = Array.from(String(attrs).matchAll(/\s(rowspan|colspan)=["']?(\d{1,2})["']?/gi))
        .map(([, name, rawValue]) => {
          if (tag !== 'td' && tag !== 'th') return '';
          const value = Math.max(1, Math.min(8, Number(rawValue) || 1));
          return ` ${String(name).toLowerCase()}="${value}"`;
        })
        .join('');

      return `<${tag}${safeAttrs}>`;
    })
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeBoardData(data: BoardData): BoardData {
  return {
    categories: data.categories,
    items: data.items.map((item) => ({
      ...item,
      currentBody:
        item.currentBody ||
        `${item.statusLabel} 단계입니다. 과제 진행 현황과 다음 실행 내용을 확인하세요.`,
      currentHtml: sanitizeDecoratedHtml(item.currentHtml),
      planHtml: sanitizeDecoratedHtml(item.planHtml),
      planStages: getPlanStages(item),
      tasks: item.tasks.map((task) => ({
        ...task,
        imageUrl: task.imageUrl || item.imageUrl,
      })),
      goalHtml: sanitizeDecoratedHtml(item.goalHtml),
    })),
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getProgress(item: BoardItem) {
  const total = item.tasks.length;
  const done = item.tasks.filter((task) => task.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

function getPlanStages(item: BoardItem): BoardPlanStage[] {
  const normalized =
    item.planStages
      ?.map((stage, index) => ({
        id: stage.id || `${item.id}-plan-stage-${index + 1}`,
        title: stage.title.trim() || `계획 ${index + 1}단계`,
        body: stage.body.trim() || item.planBody,
        imageUrl: stage.imageUrl || item.imageUrl,
      }))
      .filter((stage) => stage.title.length > 0 || stage.body.length > 0 || Boolean(stage.imageUrl)) ?? [];

  if (normalized.length > 0) {
    return normalized;
  }

  if (item.tasks.length > 0) {
    return item.tasks.map((task, index) => ({
      id: `${item.id}-plan-stage-${index + 1}`,
      title: task.title || `계획 ${index + 1}단계`,
      body: index === 0 ? item.planBody || item.summary : item.summary || item.planBody,
      imageUrl: task.imageUrl || item.imageUrl,
    }));
  }

  return [
    {
      id: `${item.id}-plan-stage-overview`,
      title: item.stageLabel || '계획 개요',
      body: item.planBody || '계획 본문을 입력하세요.',
      imageUrl: item.imageUrl,
    },
  ];
}

function createEmptyPlanStageDraft(): BoardPlanStageDraft {
  return {
    id: createId('plan-stage-draft'),
    title: '',
    body: '',
    imageUrl: '',
  };
}

function planStagesToDraft(item: BoardItem): BoardPlanStageDraft[] {
  return getPlanStages(item).map((stage) => ({
    id: stage.id,
    title: stage.title,
    body: stage.body,
    imageUrl: stage.imageUrl ?? '',
  }));
}

function draftPlanStagesToBoardPlanStages(
  stages: BoardPlanStageDraft[],
  fallbackImageUrl: string,
  fallbackBody: string,
  fallbackTitle: string
): BoardPlanStage[] {
  const normalized = stages
    .map((stage, index) => {
      const title = stage.title.trim();
      const body = stage.body.trim();
      const imageUrl = stage.imageUrl.trim();

      return {
        id: stage.id.startsWith('plan-stage-draft') ? createId('plan-stage') : stage.id,
        title: title || `계획 ${index + 1}단계`,
        body: body || fallbackBody,
        imageUrl: imageUrl || fallbackImageUrl,
        hasContent: Boolean(title || body || imageUrl),
      };
    })
    .filter((stage) => stage.hasContent)
    .map((stage) => ({
      id: stage.id,
      title: stage.title,
      body: stage.body,
      imageUrl: stage.imageUrl,
    }));

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      id: createId('plan-stage'),
      title: fallbackTitle,
      body: fallbackBody,
      imageUrl: fallbackImageUrl,
    },
  ];
}

function createEmptyTaskDraft(): BoardTaskDraft {
  return {
    id: createId('task-draft'),
    title: '',
    done: false,
    imageUrl: '',
  };
}

function tasksToDraft(tasks: BoardTask[]): BoardTaskDraft[] {
  if (tasks.length === 0) {
    return [createEmptyTaskDraft()];
  }

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    done: task.done,
    imageUrl: task.imageUrl ?? '',
  }));
}

function draftTasksToBoardTasks(tasks: BoardTaskDraft[], fallbackImageUrl: string): BoardTask[] {
  return tasks
    .map((task) => ({
      id: task.id.startsWith('task-draft') ? createId('task') : task.id,
      title: task.title.trim(),
      done: task.done,
      imageUrl: task.imageUrl.trim() || fallbackImageUrl,
    }))
    .filter((task) => task.title.length > 0);
}

function emptyItemDraft(categoryId: string): BoardItemDraft {
  return {
    title: '',
    categoryId,
    owner: '',
    dueDate: '',
    imageUrl: '',
    summary: '',
    currentBody: '',
    currentHtml: '',
    planBody: '',
    planHtml: '',
    planStages: [createEmptyPlanStageDraft()],
    tasks: [createEmptyTaskDraft()],
    goalBody: '',
    goalHtml: '',
    stageLabel: '신규',
    statusLabel: '준비',
  };
}

function itemToDraft(item: BoardItem): BoardItemDraft {
  return {
    title: item.title,
    categoryId: item.categoryId,
    owner: item.owner,
    dueDate: item.dueDate,
    imageUrl: item.imageUrl,
    summary: item.summary,
    currentBody: item.currentBody,
    currentHtml: item.currentHtml ?? '',
    planBody: item.planBody,
    planHtml: item.planHtml ?? '',
    planStages: planStagesToDraft(item),
    tasks: tasksToDraft(item.tasks),
    goalBody: item.goalBody,
    goalHtml: item.goalHtml ?? '',
    stageLabel: item.stageLabel,
    statusLabel: item.statusLabel,
  };
}

function getCategory(categories: BoardCategory[], categoryId: string) {
  return categories.find((category) => category.id === categoryId) ?? categories[0];
}

function getImageTargetLabel(target: ImageTarget) {
  if (target.type === 'cover') return '대표 이미지';
  if (target.type === 'plan-stage') return '계획 단계 이미지';
  return '과제 이미지';
}

function isImagePhotoItem(item: PhotoItem) {
  return item.type !== 'video';
}

export default function ProjectBoardPage({ page, mode, management = false, canManage = false }: ProjectBoardPageProps) {
  const copy = boardCopy[mode];
  const initialBoard = React.useMemo(() => cloneBoardData(DEFAULT_BOARDS[mode]), [mode]);
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const canManageBoard = canManage && Boolean(currentUser);
  const canManageCategories = management && canManageBoard;
  const { data: photoAlbums = [], isLoading: isPhotoAlbumsLoading } = usePhotoAlbumsQuery(canManageBoard);
  const [categories, setCategories] = React.useState<BoardCategory[]>(initialBoard.categories);
  const [items, setItems] = React.useState<BoardItem[]>(initialBoard.items);
  const [isBoardLoading, setIsBoardLoading] = React.useState(true);
  const [boardLoadError, setBoardLoadError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState('all');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = React.useState<DetailTab>('plan');
  const [cardPreviewTabs, setCardPreviewTabs] = React.useState<Record<string, DetailTab>>({});
  const [isComposerOpen, setIsComposerOpen] = React.useState(false);
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [itemDraft, setItemDraft] = React.useState<BoardItemDraft>(() => emptyItemDraft(initialBoard.categories[0].id));
  const [editingCategoryId, setEditingCategoryId] = React.useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = React.useState<CategoryDraft>({
    name: '',
    description: '',
    color: palette[0],
  });
  const detailRef = React.useRef<HTMLElement | null>(null);
  const composerRef = React.useRef<HTMLElement | null>(null);
  const detailScrollTokenRef = React.useRef(0);
  const imageUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = React.useState('');
  const [imageUploadTarget, setImageUploadTarget] = React.useState<ImageTarget | null>(null);
  const [photoPickerTarget, setPhotoPickerTarget] = React.useState<ImageTarget | null>(null);
  const [isUploadingImage, setIsUploadingImage] = React.useState(false);
  const [aiContentTarget, setAiContentTarget] = React.useState<ContentGenerationTarget | null>(null);
  const [confirmRequest, setConfirmRequest] = React.useState<BoardConfirmRequest | null>(null);
  const [imagePreview, setImagePreview] = React.useState<ImagePreviewState | null>(null);

  React.useEffect(() => {
    setIsBoardLoading(true);
    setBoardLoadError(null);

    return projectBoardService.subscribe(
      mode,
      initialBoard,
      (boardData) => {
        const normalized = normalizeBoardData(boardData);
        setCategories(normalized.categories);
        setItems(normalized.items);
        setIsBoardLoading(false);
      },
      (error) => {
        console.error('[ProjectBoard] Firestore sync failed:', error);
        const fallback = cloneBoardData(DEFAULT_BOARDS[mode]);
        setCategories(fallback.categories);
        setItems(fallback.items);
        setBoardLoadError('Firestore 데이터를 불러오지 못해 샘플 데이터를 표시합니다.');
        setIsBoardLoading(false);
      }
    );
  }, [initialBoard, mode]);

  React.useEffect(() => {
    if (!canManageBoard || selectedAlbumId || photoAlbums.length === 0) return;
    setSelectedAlbumId(photoAlbums[0].id ?? '');
  }, [canManageBoard, photoAlbums, selectedAlbumId]);

  const persistBoard = React.useCallback(
    async (nextBoard: BoardData, successMessage?: string) => {
      if (!canManageBoard || !currentUser) {
        toast.error('관리자 권한이 있어야 저장할 수 있습니다.');
        return false;
      }

      const normalized = normalizeBoardData(nextBoard);
      setCategories(normalized.categories);
      setItems(normalized.items);
      setIsSaving(true);

      try {
        await projectBoardService.saveBoard(mode, normalized, {
          uid: currentUser.uid,
          email: currentUser.email,
        });
        if (successMessage) {
          toast.success(successMessage);
        }
        return true;
      } catch (error) {
        console.error('[ProjectBoard] save failed:', error);
        toast.error('Firestore 저장에 실패했습니다.');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [canManageBoard, currentUser, mode]
  );

  const applyImageUrlToDraft = React.useCallback((target: ImageTarget, imageUrl: string) => {
    if (target.type === 'cover') {
      setItemDraft((draft) => ({ ...draft, imageUrl }));
      return;
    }

    if (target.type === 'plan-stage') {
      setItemDraft((draft) => ({
        ...draft,
        planStages: draft.planStages.map((stage) => (stage.id === target.stageId ? { ...stage, imageUrl } : stage)),
      }));
      return;
    }

    setItemDraft((draft) => ({
      ...draft,
      tasks: draft.tasks.map((task) => (task.id === target.taskId ? { ...task, imageUrl } : task)),
    }));
  }, []);

  const resolveUploadAlbumId = React.useCallback(async () => {
    const selectedAlbum = photoAlbums.find((album) => album.id === selectedAlbumId);
    if (selectedAlbum?.id) return selectedAlbum.id;

    const boardAlbum = photoAlbums.find((album) => album.title === '프로젝트 보드');
    if (boardAlbum?.id) {
      setSelectedAlbumId(boardAlbum.id);
      return boardAlbum.id;
    }

    const albumId = await photoService.createAlbum({
      title: '프로젝트 보드',
      description: '프로젝트 보드에서 업로드한 대표 이미지와 과제 이미지를 모아둡니다.',
    });
    setSelectedAlbumId(albumId);
    await queryClient.invalidateQueries({ queryKey: PHOTO_ALBUMS_QUERY_KEY });
    return albumId;
  }, [photoAlbums, queryClient, selectedAlbumId]);

  const openImageUpload = (target: ImageTarget) => {
    if (!canManageBoard) {
      toast.error('관리자 권한이 있어야 사진을 업로드할 수 있습니다.');
      return;
    }

    setImageUploadTarget(target);
    imageUploadInputRef.current?.click();
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file || !imageUploadTarget) return;

    setIsUploadingImage(true);

    try {
      const albumId = await resolveUploadAlbumId();
      const uploaded = await photoService.uploadPhotos(albumId, [file]);
      await photoService.addPhotoItems(albumId, uploaded);
      const uploadedPhoto = uploaded[0];

      if (uploadedPhoto?.url) {
        applyImageUrlToDraft(imageUploadTarget, uploadedPhoto.url);
        toast.success(`${getImageTargetLabel(imageUploadTarget)}를 업로드하고 사진첩에 등록했습니다.`);
      }

      await queryClient.invalidateQueries({ queryKey: PHOTO_ALBUMS_QUERY_KEY });
    } catch (error) {
      console.error('[ProjectBoard] image upload failed:', error);
      toast.error('사진 업로드에 실패했습니다.');
    } finally {
      setIsUploadingImage(false);
      setImageUploadTarget(null);
    }
  };

  const selectPhotoFromAlbum = (target: ImageTarget, item: PhotoItem) => {
    if (!isImagePhotoItem(item)) {
      toast.error('이미지 파일만 선택할 수 있습니다.');
      return;
    }

    applyImageUrlToDraft(target, item.url);
    setPhotoPickerTarget(null);
    toast.success(`${getImageTargetLabel(target)}에 사진첩 이미지를 적용했습니다.`);
  };

  const applyGeneratedContentToDraft = React.useCallback((content: GeneratedBoardContent) => {
    setItemDraft((draft) => {
      return {
        ...draft,
        currentHtml: sanitizeDecoratedHtml(content.currentHtml) ?? draft.currentHtml,
        planHtml: sanitizeDecoratedHtml(content.planHtml) ?? draft.planHtml,
        goalHtml: sanitizeDecoratedHtml(content.goalHtml) ?? draft.goalHtml,
      };
    });
  }, []);

  const generateBoardContent = async (target: ContentGenerationTarget) => {
    if (!canManageBoard || !currentUser) {
      toast.error('관리자 권한이 있어야 Gemini 콘텐츠를 생성할 수 있습니다.');
      return;
    }

    if (!itemDraft.title.trim()) {
      toast.error('프로젝트 제목을 먼저 입력하세요.');
      return;
    }

    const sourceBody = target === 'plan' ? itemDraft.planBody : itemDraft.goalBody;
    if (!sourceBody.trim()) {
      toast.error(`${detailTabs[target].label} 본문을 먼저 입력하세요.`);
      return;
    }

    setAiContentTarget(target);
    const toastId = `project-board-content-${target}`;
    toast.loading('Gemini로 표시용 HTML 디자인을 생성 중입니다.', { id: toastId });

    try {
      const response = await fetch('/api/generate-project-board-content', {
        method: 'POST',
        headers: await buildJsonAuthHeaders(currentUser),
        body: JSON.stringify({
          mode,
          section: target,
          title: itemDraft.title,
          categoryName: getCategory(categories, itemDraft.categoryId)?.name ?? '',
          owner: itemDraft.owner,
          dueDate: itemDraft.dueDate,
          stageLabel: itemDraft.stageLabel,
          statusLabel: itemDraft.statusLabel,
          summary: itemDraft.summary,
          currentBody: itemDraft.currentBody,
          planBody: itemDraft.planBody,
          goalBody: itemDraft.goalBody,
          tasks: itemDraft.tasks.map((task) => ({
            title: task.title,
            done: task.done,
          })),
        }),
      });
      const payload = (await response.json()) as GenerateProjectBoardContentResponse;

      if (!response.ok || !payload.success || !payload.content) {
        throw new Error(payload.error || 'Gemini HTML 디자인 생성에 실패했습니다.');
      }

      applyGeneratedContentToDraft(payload.content);
      toast.success('Gemini HTML 디자인을 적용했습니다. 저장하면 본문 화면에 반영됩니다.', { id: toastId });
    } catch (error) {
      console.error('[ProjectBoard] Gemini content generation failed:', error);
      toast.error(error instanceof Error ? error.message : 'Gemini HTML 디자인 생성에 실패했습니다.', { id: toastId });
    } finally {
      setAiContentTarget(null);
    }
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleItems = React.useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = selectedCategoryId === 'all' || item.categoryId === selectedCategoryId;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          item.title,
          item.summary,
          item.owner,
          item.statusLabel,
          item.stageLabel,
          ...getPlanStages(item).flatMap((stage) => [stage.title, stage.body]),
        ].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        );

      return matchesCategory && matchesSearch;
    });
  }, [items, normalizedSearch, selectedCategoryId]);

  const selectedItem = React.useMemo(
    () => (selectedItemId ? visibleItems.find((item) => item.id === selectedItemId) ?? null : null),
    [selectedItemId, visibleItems]
  );
  const activeItem = selectedItem ?? visibleItems[0] ?? null;

  const boardStats = React.useMemo(() => {
    const taskCount = items.reduce((sum, item) => sum + item.tasks.length, 0);
    const doneCount = items.reduce((sum, item) => sum + item.tasks.filter((task) => task.done).length, 0);
    const percent = taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100);

    return {
      taskCount,
      doneCount,
      percent,
      itemCount: items.length,
    };
  }, [items]);

  const gridItems = visibleItems;

  const openDetail = (itemId: string, tab: DetailTab) => {
    detailScrollTokenRef.current += 1;
    setSelectedItemId(itemId);
    setActiveDetailTab(tab);
    setCardPreviewTabs((tabs) => ({ ...tabs, [itemId]: tab }));
  };

  const openCardPreview = (itemId: string, tab: DetailTab) => {
    detailScrollTokenRef.current = 0;
    setSelectedItemId(itemId);
    setActiveDetailTab(tab);
    setCardPreviewTabs((tabs) => ({ ...tabs, [itemId]: tab }));
  };

  const selectCategory = (categoryId: string) => {
    detailScrollTokenRef.current = 0;
    setSelectedCategoryId(categoryId);
    setSelectedItemId(null);
    setActiveDetailTab('plan');
  };

  React.useEffect(() => {
    if (!selectedItem || detailScrollTokenRef.current === 0) return;

    const scrollToken = detailScrollTokenRef.current;
    const frame = window.requestAnimationFrame(() => {
      if (detailScrollTokenRef.current === scrollToken) {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeDetailTab, selectedItem]);

  React.useEffect(() => {
    if (!isComposerOpen) return;

    const frame = window.requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editingItemId, isComposerOpen]);

  const openNewItem = () => {
    if (!canManageBoard) {
      toast.error('관리자 권한이 있어야 추가할 수 있습니다.');
      return;
    }

    const fallbackCategoryId = selectedCategoryId === 'all' ? categories[0].id : selectedCategoryId;
    setEditingItemId(null);
    setItemDraft(emptyItemDraft(fallbackCategoryId));
    setIsComposerOpen(true);
  };

  const openEditItem = (item: BoardItem) => {
    if (!canManageBoard) {
      toast.error('관리자 권한이 있어야 수정할 수 있습니다.');
      return;
    }

    setEditingItemId(item.id);
    setItemDraft(itemToDraft(item));
    setIsComposerOpen(true);
  };

  const saveItem = async () => {
    const title = itemDraft.title.trim();
    const fallbackCategoryId = categories[0]?.id;

    if (!title) {
      toast.error('제목을 입력하세요.');
      return;
    }

    if (!fallbackCategoryId) {
      toast.error('카테고리를 먼저 추가하세요.');
      return;
    }

    const fallbackImageUrl =
      itemDraft.imageUrl.trim() ||
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80';
    const planBody = itemDraft.planBody.trim() || '계획 본문을 입력하세요.';
    const planStages = draftPlanStagesToBoardPlanStages(
      itemDraft.planStages,
      fallbackImageUrl,
      planBody,
      itemDraft.stageLabel.trim() || '계획 개요'
    );
    const tasks = draftTasksToBoardTasks(itemDraft.tasks, fallbackImageUrl);
    const nextItem: BoardItem = {
      id: editingItemId ?? createId('board'),
      title,
      categoryId: categories.some((category) => category.id === itemDraft.categoryId) ? itemDraft.categoryId : fallbackCategoryId,
      owner: itemDraft.owner.trim() || '담당자 미정',
      dueDate: itemDraft.dueDate,
      imageUrl: fallbackImageUrl,
      summary: itemDraft.summary.trim() || '프로젝트 요약을 입력하세요.',
      currentBody: itemDraft.currentBody.trim() || '현재 진행 상태를 입력하세요.',
      currentHtml: sanitizeDecoratedHtml(itemDraft.currentHtml),
      planBody,
      planHtml: sanitizeDecoratedHtml(itemDraft.planHtml),
      planStages,
      tasks:
        tasks.length > 0
          ? tasks
          : [{ id: createId('task'), title: '첫 번째 과제', done: false, imageUrl: fallbackImageUrl }],
      goalBody: itemDraft.goalBody.trim() || '목표 본문을 입력하세요.',
      goalHtml: sanitizeDecoratedHtml(itemDraft.goalHtml),
      stageLabel: itemDraft.stageLabel.trim() || '신규',
      statusLabel: itemDraft.statusLabel.trim() || '준비',
    };

    const nextItems = editingItemId
      ? items.map((item) => (item.id === editingItemId ? nextItem : item))
      : [nextItem, ...items];
    const didSave = await persistBoard(
      { categories, items: nextItems },
      editingItemId ? '게시물을 수정했습니다.' : '게시물을 추가했습니다.'
    );

    if (didSave) {
      setIsComposerOpen(false);
      setEditingItemId(null);
    }
  };

  const deleteItem = async (itemId: string) => {
    const targetItem = items.find((item) => item.id === itemId);
    setConfirmRequest({
      title: '게시물 삭제',
      body: `'${targetItem?.title ?? '선택한 게시물'}'을 삭제합니다. 공개 페이지에서도 즉시 사라집니다.`,
      confirmLabel: '삭제',
      tone: 'danger',
      onConfirm: async () => {
        await persistBoard({ categories, items: items.filter((item) => item.id !== itemId) }, '게시물을 삭제했습니다.');
        if (selectedItemId === itemId) {
          setSelectedItemId(null);
        }
      },
    });
  };

  const saveCategory = async () => {
    const name = categoryDraft.name.trim();

    if (!name) {
      toast.error('카테고리명을 입력하세요.');
      return;
    }

    if (editingCategoryId) {
      const nextCategories = categories.map((category) =>
          category.id === editingCategoryId
            ? {
                ...category,
                name,
                description: categoryDraft.description.trim() || '설명이 없습니다.',
                color: categoryDraft.color,
              }
            : category
      );
      await persistBoard({ categories: nextCategories, items }, '카테고리를 수정했습니다.');
    } else {
      const newCategory: BoardCategory = {
        id: createId('category'),
        name,
        description: categoryDraft.description.trim() || '설명이 없습니다.',
        color: categoryDraft.color,
      };
      await persistBoard({ categories: [...categories, newCategory], items }, '카테고리를 추가했습니다.');
      selectCategory(newCategory.id);
    }

    setEditingCategoryId(null);
    setCategoryDraft({ name: '', description: '', color: palette[0] });
  };

  const editCategory = (category: BoardCategory) => {
    setEditingCategoryId(category.id);
    setCategoryDraft({
      name: category.name,
      description: category.description,
      color: category.color,
    });
  };

  const deleteCategory = async (categoryId: string) => {
    if (categories.length <= 1) {
      toast.error('카테고리는 최소 1개가 필요합니다.');
      return;
    }

    const category = categories.find((item) => item.id === categoryId);
    const fallbackCategory = categories.find((item) => item.id !== categoryId);
    if (!fallbackCategory) return;

    const affectedCount = items.filter((item) => item.categoryId === categoryId).length;
    setConfirmRequest({
      title: '카테고리 삭제',
      body: `'${category?.name ?? '선택한 카테고리'}'를 삭제합니다. 연결된 게시물 ${affectedCount}개는 '${fallbackCategory.name}' 카테고리로 이동합니다.`,
      confirmLabel: '카테고리 삭제',
      tone: 'danger',
      onConfirm: async () => {
        const nextCategories = categories.filter((item) => item.id !== categoryId);
        const nextItems = items.map((item) => (item.categoryId === categoryId ? { ...item, categoryId: fallbackCategory.id } : item));

        await persistBoard(
          {
            categories: nextCategories,
            items: nextItems,
          },
          '카테고리를 삭제했습니다.'
        );
        selectCategory('all');
        if (editingCategoryId === categoryId) {
          setEditingCategoryId(null);
          setCategoryDraft({ name: '', description: '', color: palette[0] });
        }
      },
    });
  };

  const toggleTask = async (itemId: string, taskId: string) => {
    const nextItems = items.map((item) => {
        if (item.id !== itemId) return item;

        return {
          ...item,
          tasks: item.tasks.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task)),
        };
      });

    await persistBoard({ categories, items: nextItems });
  };

  const resetBoard = async () => {
    setConfirmRequest({
      title: '샘플 데이터로 초기화',
      body: `현재 ${copy.title}의 카테고리 ${categories.length}개와 게시물 ${items.length}개가 샘플 데이터로 교체됩니다.`,
      confirmLabel: '초기화',
      tone: 'warning',
      onConfirm: async () => {
        const freshBoard = cloneBoardData(DEFAULT_BOARDS[mode]);
        await persistBoard(freshBoard, '보드를 초기화했습니다.');
        selectCategory('all');
        setEditingCategoryId(null);
        setCategoryDraft({ name: '', description: '', color: palette[0] });
        setIsComposerOpen(false);
      },
    });
  };

  const addDraftPlanStage = () => {
    setItemDraft((draft) => ({
      ...draft,
      planStages: [...draft.planStages, createEmptyPlanStageDraft()],
    }));
  };

  const updateDraftPlanStage = (stageId: string, updates: Partial<BoardPlanStageDraft>) => {
    setItemDraft((draft) => ({
      ...draft,
      planStages: draft.planStages.map((stage) => (stage.id === stageId ? { ...stage, ...updates } : stage)),
    }));
  };

  const removeDraftPlanStage = (stageId: string) => {
    setItemDraft((draft) => {
      if (draft.planStages.length <= 1) {
        return {
          ...draft,
          planStages: [createEmptyPlanStageDraft()],
        };
      }

      return {
        ...draft,
        planStages: draft.planStages.filter((stage) => stage.id !== stageId),
      };
    });
  };

  const addDraftTask = () => {
    setItemDraft((draft) => ({
      ...draft,
      tasks: [...draft.tasks, createEmptyTaskDraft()],
    }));
  };

  const updateDraftTask = (taskId: string, updates: Partial<BoardTaskDraft>) => {
    setItemDraft((draft) => ({
      ...draft,
      tasks: draft.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
    }));
  };

  const removeDraftTask = (taskId: string) => {
    setItemDraft((draft) => {
      if (draft.tasks.length <= 1) {
        return {
          ...draft,
          tasks: [createEmptyTaskDraft()],
        };
      }

      return {
        ...draft,
        tasks: draft.tasks.filter((task) => task.id !== taskId),
      };
    });
  };

  const openImagePreview = (url: string, title: string, caption: string) => {
    if (!url.trim()) return;
    setImagePreview({ url, title, caption });
  };

  const updateDraftHtml = (target: ContentGenerationTarget, value: string) => {
    setItemDraft((draft) => {
      if (target === 'plan') return { ...draft, planHtml: value };
      return { ...draft, goalHtml: value };
    });
  };

  const clearDraftHtml = (target: ContentGenerationTarget) => {
    updateDraftHtml(target, '');
  };

  const renderBodyArticle = (title: string, body: string, html?: string) => {
    const safeHtml = sanitizeDecoratedHtml(html);

    if (safeHtml) {
      return (
        <HtmlArticle>
          <h3>{title}</h3>
          <div className="html-canvas" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </HtmlArticle>
      );
    }

    return (
      <TextArticle>
        <h3>{title}</h3>
        <p>{body}</p>
      </TextArticle>
    );
  };

  const renderCardPreview = (item: BoardItem, tab: DetailTab) => {
    const progress = getProgress(item);
    const stages = getPlanStages(item);

    if (tab === 'tasks') {
      return (
        <CardPreviewPanel>
          <CardPreviewHeader>
            <span>과제 요약</span>
            <strong>
              {progress.done}/{progress.total}
            </strong>
          </CardPreviewHeader>
          <TaskPreview>
            {Array.from({ length: 3 }, (_, index) => {
              const task = item.tasks[index];

              if (!task) {
                return (
                  <TaskPlaceholder key={`${item.id}-task-placeholder-${index}`}>
                    <span />
                    <Circle size={15} />
                    <span className="task-title">과제 대기</span>
                  </TaskPlaceholder>
                );
              }

              return (
                <TaskToggle
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => (canManageBoard ? void toggleTask(item.id, task.id) : openCardPreview(item.id, 'tasks'))}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    if (canManageBoard) {
                      void toggleTask(item.id, task.id);
                    } else {
                      openCardPreview(item.id, 'tasks');
                    }
                  }}
                  $done={task.done}
                >
                  <TaskPreviewPhoto
                    type="button"
                    $image={task.imageUrl || item.imageUrl}
                    onClick={(event) => {
                      event.stopPropagation();
                      openCardPreview(item.id, 'tasks');
                    }}
                    aria-label={`${task.title} 과제 요약 보기`}
                  />
                  {task.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                  <span className="task-title">{task.title}</span>
                </TaskToggle>
              );
            })}
          </TaskPreview>
        </CardPreviewPanel>
      );
    }

    const isPlan = tab === 'plan';
    const body = isPlan
      ? item.planBody || stages[0]?.body || item.summary
      : item.goalBody || item.summary;
    const chips = isPlan ? stages.slice(0, 2).map((stage) => stage.title) : [item.stageLabel, item.statusLabel].filter(Boolean);

    return (
      <CardPreviewPanel>
        <CardPreviewHeader>
          <span>{isPlan ? '계획 요약' : '목표 요약'}</span>
          <strong>{isPlan ? `${stages.length}단계` : `${progress.percent}%`}</strong>
        </CardPreviewHeader>
        <CardPreviewText>{body}</CardPreviewText>
        <CardPreviewChips>
          {chips.map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </CardPreviewChips>
      </CardPreviewPanel>
    );
  };

  const renderDetailPanel = (item: BoardItem, options?: { pinned?: boolean }) => (
    <DetailPanel
      ref={detailRef}
      $pinned={Boolean(options?.pinned)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 14 }}
      layout
    >
      <DetailHero>
        <DetailImageFrame
          type="button"
          $image={item.imageUrl}
          onClick={() => openImagePreview(item.imageUrl, item.title, '대표 이미지')}
          aria-label={`${item.title} 대표 사진 크게 보기`}
        />
        <DetailTitleRow $hasAction={!options?.pinned || canManageBoard}>
          <div>
            <span>{getCategory(categories, item.categoryId)?.name ?? '카테고리 없음'}</span>
            <h2>{item.title}</h2>
            <DetailMetaLine>
              <small>
                <UserRound size={14} />
                {item.owner}
              </small>
              <small>
                <CalendarDays size={14} />
                {item.dueDate || '일정 미정'}
              </small>
            </DetailMetaLine>
          </div>
          {options?.pinned ? (
            canManageBoard ? (
              <button type="button" onClick={() => openEditItem(item)} aria-label={`${item.title} 수정`}>
                <Pencil size={18} />
              </button>
            ) : null
          ) : (
            <button type="button" onClick={() => setSelectedItemId(null)} aria-label="본문 닫기">
              <X size={18} />
            </button>
          )}
        </DetailTitleRow>
      </DetailHero>

      <DetailTabs>
        {detailTabOrder.map((tab) => {
          const { Icon, label } = detailTabs[tab];

          return (
            <button key={tab} type="button" className={activeDetailTab === tab ? 'active' : ''} onClick={() => setActiveDetailTab(tab)}>
              <Icon size={17} />
              {label}
            </button>
          );
        })}
      </DetailTabs>

      <DetailBody>
        {activeDetailTab === 'plan' && (
          <>
            <PlanStageArticle>
              <PlanStageHeader>
                <div>
                  <h3>계획 단계</h3>
                  <span>{getPlanStages(item).length}단계로 나누어 실행합니다.</span>
                </div>
                <strong>{item.stageLabel}</strong>
              </PlanStageHeader>
              <PlanStageList>
                {getPlanStages(item).map((stage, index) => (
                  <PlanStageCard key={stage.id}>
                    <PlanStagePhoto
                      type="button"
                      $image={stage.imageUrl || item.imageUrl}
                      onClick={() =>
                        openImagePreview(stage.imageUrl || item.imageUrl, stage.title, `${item.title} 계획 단계 이미지`)
                      }
                      aria-label={`${stage.title} 계획 단계 이미지 크게 보기`}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                    </PlanStagePhoto>
                    <div>
                      <small>STEP {index + 1}</small>
                      <h4>{stage.title}</h4>
                      <p>{stage.body}</p>
                    </div>
                  </PlanStageCard>
                ))}
              </PlanStageList>
            </PlanStageArticle>
            {renderBodyArticle('계획 본문', item.planBody, item.planHtml)}
          </>
        )}

        {activeDetailTab === 'tasks' && (
          <TaskArticle>
            <TaskArticleHeader>
              <h3>과제 목록</h3>
              <strong>{getProgress(item).percent}%</strong>
            </TaskArticleHeader>
            <ProgressTrack>
              <ProgressFill
                $color={getCategory(categories, item.categoryId)?.color ?? '#0f9f87'}
                $percent={getProgress(item).percent}
              />
            </ProgressTrack>
            <DetailTaskList>
              {item.tasks.map((task) => (
                <DetailTaskButton
                  key={task.id}
                  role={canManageBoard ? 'button' : undefined}
                  tabIndex={canManageBoard ? 0 : undefined}
                  onClick={() => {
                    if (canManageBoard) {
                      void toggleTask(item.id, task.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!canManageBoard || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    void toggleTask(item.id, task.id);
                  }}
                  $done={task.done}
                  $interactive={canManageBoard}
                >
                  <DetailTaskPhoto
                    type="button"
                    $image={task.imageUrl || item.imageUrl}
                    onClick={(event) => {
                      event.stopPropagation();
                      openImagePreview(task.imageUrl || item.imageUrl, task.title, `${item.title} 과제 이미지`);
                    }}
                    aria-label={`${task.title} 과제 이미지 크게 보기`}
                  />
                  <span className="task-state">{task.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
                  <span className="task-title">{task.title}</span>
                </DetailTaskButton>
              ))}
            </DetailTaskList>
          </TaskArticle>
        )}

        {activeDetailTab === 'goal' && renderBodyArticle('목표 본문', item.goalBody, item.goalHtml)}
      </DetailBody>
    </DetailPanel>
  );

  const showProjectSelector = Boolean(management);

  return (
    <PageShell id="content-area" data-route={page.path}>
      {canManageBoard && (
        <input
          ref={imageUploadInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageFileChange}
        />
      )}
      <BoardTop $management={management}>
        <TitleBlock>
          <span>
            <Layers3 size={15} />
            {copy.eyebrow}
          </span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </TitleBlock>

        <TopActions>
          <SearchBox>
            <Search size={17} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="검색"
              aria-label="게시물 검색"
            />
          </SearchBox>
          {canManageBoard && (
            <ActionButton type="button" onClick={openNewItem}>
              <Plus size={17} />
              {copy.addLabel}
            </ActionButton>
          )}
        </TopActions>
      </BoardTop>

      {(isBoardLoading || boardLoadError || isSaving) && (
        <BoardNotice role={boardLoadError ? 'alert' : 'status'}>
          {isBoardLoading ? (
            <>
              <Loader2 size={16} className="spin" />
              Firestore 보드 데이터를 불러오는 중입니다.
            </>
          ) : boardLoadError ? (
            boardLoadError
          ) : (
            <>
              <Loader2 size={16} className="spin" />
              변경 내용을 Firestore에 저장하는 중입니다.
            </>
          )}
        </BoardNotice>
      )}

      <StatsStrip aria-label="보드 진행 현황">
        <StatItem>
          <Archive size={18} />
          <strong>{boardStats.itemCount}</strong>
          <span>게시물</span>
        </StatItem>
        <StatItem>
          <CheckCircle2 size={18} />
          <strong>
            {boardStats.doneCount}/{boardStats.taskCount}
          </strong>
          <span>완료 과제</span>
        </StatItem>
        <StatProgress>
          <div>
            <Gauge size={18} />
            <span>전체 진행률</span>
            <strong>{boardStats.percent}%</strong>
          </div>
          <ProgressTrack aria-hidden="true">
            <ProgressFill $color="#0f9f87" $percent={boardStats.percent} />
          </ProgressTrack>
        </StatProgress>
      </StatsStrip>

      <Workspace $management={management}>
        <CategoryPanel $management={management} aria-label={management ? '카테고리 관리' : '카테고리 필터'}>
          <CategoryHeader>
            <strong>카테고리</strong>
            <button type="button" onClick={() => selectCategory('all')} aria-label="전체 카테고리 보기">
              전체
            </button>
          </CategoryHeader>

          <CategoryList $horizontal={!management}>
            <CategoryFilterButton
              type="button"
              $active={selectedCategoryId === 'all'}
              $color="#111827"
              $horizontal={!management}
              onClick={() => selectCategory('all')}
            >
              <span className="swatch" />
              <span className="name">전체</span>
              <small>{items.length}</small>
            </CategoryFilterButton>

            {categories.map((category) => {
              const count = items.filter((item) => item.categoryId === category.id).length;

              return canManageCategories ? (
                <CategoryRow key={category.id}>
                  <CategoryFilterButton
                    type="button"
                    $active={selectedCategoryId === category.id}
                    $color={category.color}
                    $horizontal={!management}
                    onClick={() => selectCategory(category.id)}
                  >
                    <span className="swatch" />
                    <span className="name">{category.name}</span>
                    <small>{count}</small>
                  </CategoryFilterButton>
                  <IconButton type="button" onClick={() => editCategory(category)} aria-label={`${category.name} 수정`}>
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton
                    type="button"
                    onClick={() => deleteCategory(category.id)}
                    aria-label={`${category.name} 삭제`}
                    $danger
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </CategoryRow>
              ) : (
                <CategoryFilterButton
                  key={category.id}
                  type="button"
                  $active={selectedCategoryId === category.id}
                  $color={category.color}
                  $horizontal={!management}
                  onClick={() => selectCategory(category.id)}
                >
                  <span className="swatch" />
                  <span className="name">{category.name}</span>
                  <small>{count}</small>
                </CategoryFilterButton>
              );
            })}
          </CategoryList>

          {canManageCategories ? (
            <>
              <CategoryEditor>
                <EditorTitle>
                  <FolderPlus size={16} />
                  {editingCategoryId ? '카테고리 수정' : '카테고리 추가'}
                </EditorTitle>
                <input
                  value={categoryDraft.name}
                  onChange={(event) => setCategoryDraft((draft) => ({ ...draft, name: event.target.value }))}
                  placeholder="카테고리명"
                  aria-label="카테고리명"
                />
                <textarea
                  value={categoryDraft.description}
                  onChange={(event) => setCategoryDraft((draft) => ({ ...draft, description: event.target.value }))}
                  placeholder="설명"
                  aria-label="카테고리 설명"
                  rows={3}
                />
                <SwatchGrid aria-label="카테고리 색상">
                  {palette.map((color) => (
                    <SwatchButton
                      key={color}
                      type="button"
                      $color={color}
                      $active={categoryDraft.color === color}
                      onClick={() => setCategoryDraft((draft) => ({ ...draft, color }))}
                      aria-label={`${color} 색상 선택`}
                    />
                  ))}
                </SwatchGrid>
                <CategoryEditorActions>
                  {editingCategoryId && (
                    <QuietButton
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(null);
                        setCategoryDraft({ name: '', description: '', color: palette[0] });
                      }}
                    >
                      취소
                    </QuietButton>
                  )}
                  <ActionButton type="button" onClick={saveCategory}>
                    <Save size={16} />
                    저장
                  </ActionButton>
                </CategoryEditorActions>
              </CategoryEditor>

              <ResetButton type="button" onClick={resetBoard}>
                샘플로 초기화
              </ResetButton>
            </>
          ) : !canManageBoard ? (
            <ReadOnlyNote $compact={!management}>
              관리자만 이 페이지에서 프로젝트를 관리할 수 있습니다.
            </ReadOnlyNote>
          ) : null}
        </CategoryPanel>

        <BoardArea>
          {visibleItems.length > 0 && activeItem ? (
            <>
              <FocusBoard $hasSelector={showProjectSelector}>
                {showProjectSelector && (
                  <ProjectSelector aria-label={mode === 'portfolio' ? '포트폴리오 선택 목록' : '프로젝트 선택 목록'}>
                    <ProjectSelectorHead>
                      <div>
                        <span>
                          <Eye size={14} />
                          선택 목록
                        </span>
                        <strong>{mode === 'portfolio' ? '포트폴리오' : '프로젝트'}</strong>
                      </div>
                      <small>{visibleItems.length}개</small>
                    </ProjectSelectorHead>

                    <ProjectSelectList>
                      {visibleItems.map((item) => {
                        const category = getCategory(categories, item.categoryId);
                        const progress = getProgress(item);

                        return (
                          <ProjectSelectButton
                            key={item.id}
                            type="button"
                            $active={activeItem.id === item.id}
                            $color={category?.color ?? '#0f9f87'}
                            onClick={() => openDetail(item.id, 'plan')}
                          >
                            <span className="project-index-thumb" style={{ backgroundImage: `url(${item.imageUrl})` }} />
                            <span className="project-index-body">
                              <span className="project-index-top">
                                <b>{category?.name ?? '카테고리 없음'}</b>
                              </span>
                              <strong>{item.title}</strong>
                              <span className="project-index-meta">
                                {item.owner}
                                <i />
                                {item.dueDate || '일정 미정'}
                              </span>
                              <span className="project-index-progress">
                                <span>
                                  <span style={{ width: `${progress.percent}%` }} />
                                </span>
                                <b>{progress.percent}%</b>
                              </span>
                            </span>
                          </ProjectSelectButton>
                        );
                      })}
                    </ProjectSelectList>
                  </ProjectSelector>
                )}

                <FocusDetailSlot>{renderDetailPanel(activeItem, { pinned: true })}</FocusDetailSlot>
              </FocusBoard>

              <BoardListHeader>
                <div>
                  <strong>{mode === 'portfolio' ? '포트폴리오 목록' : '프로젝트 목록'}</strong>
                  <span>필터 조건에 맞는 항목을 제목과 본문 중심으로 정리했습니다.</span>
                </div>
                <small>{gridItems.length}개 항목</small>
              </BoardListHeader>

              <AnimatePresence initial={false}>
                <CardGrid as={motion.div}>
                  {gridItems.map((item) => {
                    const category = getCategory(categories, item.categoryId);
                    const cardPreviewTab = cardPreviewTabs[item.id] ?? 'plan';

                    return (
                      <ProjectCard
                        key={item.id}
                        $selected={activeItem.id === item.id}
                        style={{ '--accent': category?.color ?? '#0f9f87' } as React.CSSProperties}
                      >
                        <CardPhoto
                          type="button"
                          $image={item.imageUrl}
                          onClick={() => openDetail(item.id, 'plan')}
                          aria-label={`${item.title} 본문 보기`}
                        />

                        <CardBody>
                          <CardMeta>
                            <span>
                              <Tag size={14} />
                              {category?.name ?? '카테고리 없음'}
                            </span>
                            <span>
                              <CalendarDays size={14} />
                              {item.dueDate || '미정'}
                            </span>
                          </CardMeta>
                          <h3>
                            <CardTitleButton type="button" onClick={() => openDetail(item.id, 'plan')}>
                              {item.title}
                            </CardTitleButton>
                          </h3>
                          <p>{item.summary}</p>

                          <ProgressBlock>
                            <ProgressCopy>
                              <span>
                                과제 {getProgress(item).done}/{getProgress(item).total}
                              </span>
                              <strong>{getProgress(item).percent}%</strong>
                            </ProgressCopy>
                            <ProgressTrack>
                              <ProgressFill $color={category?.color ?? '#0f9f87'} $percent={getProgress(item).percent} />
                            </ProgressTrack>
                          </ProgressBlock>

                          <StageStrip>
                            {detailTabOrder.map((tab) => {
                              const { Icon, label } = detailTabs[tab];

                              return (
                                <StagePhotoButton
                                  key={tab}
                                  type="button"
                                  $active={cardPreviewTab === tab}
                                  $image={item.imageUrl}
                                  onClick={() => openCardPreview(item.id, tab)}
                                  aria-pressed={cardPreviewTab === tab}
                                >
                                  <Icon size={17} />
                                  <span>{label}</span>
                                </StagePhotoButton>
                              );
                            })}
                          </StageStrip>

                          {renderCardPreview(item, cardPreviewTab)}
                        </CardBody>

                        {canManageBoard && (
                          <CardActions>
                            <button type="button" onClick={() => openEditItem(item)}>
                              <Pencil size={15} />
                              수정
                            </button>
                            <button type="button" onClick={() => void deleteItem(item.id)} className="danger">
                              <Trash2 size={15} />
                              삭제
                            </button>
                          </CardActions>
                        )}
                      </ProjectCard>
                    );
                  })}
                </CardGrid>
              </AnimatePresence>
            </>
          ) : (
            <EmptyState>
              <ImageIcon size={42} />
              <strong>{copy.emptyTitle}</strong>
              <span>{copy.emptyDescription}</span>
              {canManageBoard && (
                <ActionButton type="button" onClick={openNewItem}>
                  <Plus size={17} />
                  {copy.addLabel}
                </ActionButton>
              )}
            </EmptyState>
          )}
        </BoardArea>
      </Workspace>

      <AnimatePresence>
        {isComposerOpen && (
          <ComposerBackdrop
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
          >
            <ComposerPanel
              ref={composerRef}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <ComposerHeader>
                <div>
                  <span>{editingItemId ? '게시물 수정' : copy.addLabel}</span>
                  <h2>{editingItemId ? '내용 업데이트' : '새 기록 작성'}</h2>
                </div>
                <button type="button" onClick={() => setIsComposerOpen(false)} aria-label="작성 패널 닫기">
                  <X size={18} />
                </button>
              </ComposerHeader>

              <ComposerForm>
                <Field>
                  <span>제목</span>
                  <input
                    value={itemDraft.title}
                    onChange={(event) => setItemDraft((draft) => ({ ...draft, title: event.target.value }))}
                    placeholder="프로젝트 제목"
                  />
                </Field>

                <Field>
                  <span>카테고리</span>
                  <select
                    value={itemDraft.categoryId}
                    onChange={(event) => setItemDraft((draft) => ({ ...draft, categoryId: event.target.value }))}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <TwoFields>
                  <Field>
                    <span>담당</span>
                    <input
                      value={itemDraft.owner}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, owner: event.target.value }))}
                      placeholder="담당팀"
                    />
                  </Field>
                  <Field>
                    <span>일정</span>
                    <input
                      type="date"
                      value={itemDraft.dueDate}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, dueDate: event.target.value }))}
                    />
                  </Field>
                </TwoFields>

                <ImageAssetEditor>
                  <AssetPreview
                    type="button"
                    $image={itemDraft.imageUrl}
                    onClick={() => openImagePreview(itemDraft.imageUrl, itemDraft.title || '작성 중인 게시물', '대표 이미지 미리보기')}
                    disabled={!itemDraft.imageUrl}
                    aria-label="대표 이미지 미리보기 크게 보기"
                  >
                    {!itemDraft.imageUrl && <ImageIcon size={22} />}
                  </AssetPreview>
                  <AssetControls>
                    <AssetTitle>
                      <span>대표 이미지</span>
                      <small>업로드한 사진은 사진첩에도 자동 등록됩니다.</small>
                    </AssetTitle>
                    <input
                      value={itemDraft.imageUrl}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, imageUrl: event.target.value }))}
                      placeholder="사진첩 선택 또는 업로드 후 자동 입력"
                    />
                    <AssetToolbar>
                      <select
                        value={selectedAlbumId}
                        onChange={(event) => setSelectedAlbumId(event.target.value)}
                        disabled={isPhotoAlbumsLoading || isUploadingImage}
                        aria-label="사진첩 선택"
                      >
                        {photoAlbums.length === 0 ? (
                          <option value="">업로드 시 프로젝트 보드 사진첩 생성</option>
                        ) : (
                          photoAlbums.map((album) => (
                            <option key={album.id} value={album.id ?? ''}>
                              {album.title}
                            </option>
                          ))
                        )}
                      </select>
                      <button type="button" onClick={() => openImageUpload({ type: 'cover' })} disabled={isUploadingImage}>
                        {isUploadingImage && imageUploadTarget?.type === 'cover' ? <Loader2 size={15} className="spin" /> : <UploadCloud size={15} />}
                        업로드
                      </button>
                      <button type="button" onClick={() => setPhotoPickerTarget({ type: 'cover' })} disabled={photoAlbums.length === 0}>
                        <FolderOpen size={15} />
                        사진첩
                      </button>
                      {itemDraft.imageUrl && (
                        <button type="button" onClick={() => setItemDraft((draft) => ({ ...draft, imageUrl: '' }))}>
                          <X size={15} />
                          삭제
                        </button>
                      )}
                    </AssetToolbar>
                  </AssetControls>
                </ImageAssetEditor>

                <Field>
                  <span>단계 라벨</span>
                  <input
                    value={itemDraft.stageLabel}
                    onChange={(event) => setItemDraft((draft) => ({ ...draft, stageLabel: event.target.value }))}
                    placeholder="2분기 핵심"
                  />
                </Field>

                <Field>
                  <span>요약</span>
                  <textarea
                    value={itemDraft.summary}
                    onChange={(event) => setItemDraft((draft) => ({ ...draft, summary: event.target.value }))}
                    rows={3}
                    placeholder="카드에 보일 요약"
                  />
                </Field>

                <AiContentPanel>
                  <AiContentHead>
                    <div>
                      <strong>Gemini 콘텐츠 꾸미기</strong>
                      <small>본문 원문은 그대로 두고 표시용 HTML 섹션과 표만 생성합니다.</small>
                    </div>
                  </AiContentHead>
                  <AiContentButtons>
                    {contentGenerationTabs.map((tab) => {
                      const { Icon, label } = detailTabs[tab];

                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => void generateBoardContent(tab)}
                          disabled={Boolean(aiContentTarget) || !itemDraft.title.trim()}
                        >
                          {aiContentTarget === tab ? <Loader2 size={14} className="spin" /> : <Icon size={14} />}
                          {label}
                        </button>
                      );
                    })}
                  </AiContentButtons>
                </AiContentPanel>

                <Field>
                  <span>계획 본문</span>
                  <textarea
                    value={itemDraft.planBody}
                    onChange={(event) => setItemDraft((draft) => ({ ...draft, planBody: event.target.value }))}
                    rows={5}
                    placeholder="계획과 범위"
                  />
                </Field>
                <HtmlDesignField>
                  <HtmlDesignHeader>
                    <span>계획 HTML 디자인</span>
                    {itemDraft.planHtml && (
                      <button type="button" onClick={() => clearDraftHtml('plan')}>
                        <X size={14} />
                        삭제
                      </button>
                    )}
                  </HtmlDesignHeader>
                  <textarea
                    value={itemDraft.planHtml}
                    onChange={(event) => updateDraftHtml('plan', event.target.value)}
                    rows={5}
                    aria-label="계획 본문 HTML 디자인"
                  />
                </HtmlDesignField>

                <PlanStageDraftSection>
                  <TaskDraftHead>
                    <span>계획 단계</span>
                    <button type="button" onClick={addDraftPlanStage}>
                      <Plus size={15} />
                      단계 추가
                    </button>
                  </TaskDraftHead>
                  {itemDraft.planStages.map((stage, index) => (
                    <PlanStageDraftCard key={stage.id}>
                      <PlanStageDraftCardTop>
                        <strong>계획 {index + 1}단계</strong>
                        <button type="button" onClick={() => removeDraftPlanStage(stage.id)} aria-label={`계획 ${index + 1}단계 삭제`}>
                          <Trash2 size={15} />
                        </button>
                      </PlanStageDraftCardTop>
                      <input
                        value={stage.title}
                        onChange={(event) => updateDraftPlanStage(stage.id, { title: event.target.value })}
                        placeholder="단계 제목"
                      />
                      <textarea
                        value={stage.body}
                        onChange={(event) => updateDraftPlanStage(stage.id, { body: event.target.value })}
                        placeholder="단계 설명"
                        rows={3}
                      />
                      <input
                        value={stage.imageUrl}
                        onChange={(event) => updateDraftPlanStage(stage.id, { imageUrl: event.target.value })}
                        placeholder="단계 사진"
                      />
                      <TaskAssetTools>
                        <TaskAssetPreview
                          type="button"
                          $image={stage.imageUrl || itemDraft.imageUrl}
                          onClick={() =>
                            openImagePreview(stage.imageUrl || itemDraft.imageUrl, stage.title || `계획 ${index + 1}단계`, '계획 단계 이미지 미리보기')
                          }
                          disabled={!stage.imageUrl && !itemDraft.imageUrl}
                          aria-label={`계획 ${index + 1}단계 이미지 미리보기 크게 보기`}
                        >
                          {!stage.imageUrl && !itemDraft.imageUrl && <ImageIcon size={15} />}
                        </TaskAssetPreview>
                        <button type="button" onClick={() => openImageUpload({ type: 'plan-stage', stageId: stage.id })} disabled={isUploadingImage}>
                          {isUploadingImage && imageUploadTarget?.type === 'plan-stage' && imageUploadTarget.stageId === stage.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <UploadCloud size={14} />
                          )}
                          업로드
                        </button>
                        <button
                          type="button"
                          onClick={() => setPhotoPickerTarget({ type: 'plan-stage', stageId: stage.id })}
                          disabled={photoAlbums.length === 0}
                        >
                          <FolderOpen size={14} />
                          사진첩
                        </button>
                        {stage.imageUrl && (
                          <button type="button" onClick={() => updateDraftPlanStage(stage.id, { imageUrl: '' })}>
                            <X size={14} />
                            삭제
                          </button>
                        )}
                      </TaskAssetTools>
                    </PlanStageDraftCard>
                  ))}
                </PlanStageDraftSection>

                <TaskDraftSection>
                  <TaskDraftHead>
                    <span>과제 목록</span>
                    <button type="button" onClick={addDraftTask}>
                      <Plus size={15} />
                      과제 추가
                    </button>
                  </TaskDraftHead>
                  {itemDraft.tasks.map((task, index) => (
                    <TaskDraftCard key={task.id}>
                      <TaskDraftCardTop>
                        <strong>과제 {index + 1}</strong>
                        <label>
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={(event) => updateDraftTask(task.id, { done: event.target.checked })}
                          />
                          완료
                        </label>
                        <button type="button" onClick={() => removeDraftTask(task.id)} aria-label={`과제 ${index + 1} 삭제`}>
                          <Trash2 size={15} />
                        </button>
                      </TaskDraftCardTop>
                      <input
                        value={task.title}
                        onChange={(event) => updateDraftTask(task.id, { title: event.target.value })}
                        placeholder="과제명"
                      />
                      <input
                        value={task.imageUrl}
                        onChange={(event) => updateDraftTask(task.id, { imageUrl: event.target.value })}
                        placeholder="과제 사진"
                      />
                      <TaskAssetTools>
                        <TaskAssetPreview
                          type="button"
                          $image={task.imageUrl || itemDraft.imageUrl}
                          onClick={() => openImagePreview(task.imageUrl || itemDraft.imageUrl, task.title || `과제 ${index + 1}`, '과제 이미지 미리보기')}
                          disabled={!task.imageUrl && !itemDraft.imageUrl}
                          aria-label={`과제 ${index + 1} 이미지 미리보기 크게 보기`}
                        >
                          {!task.imageUrl && !itemDraft.imageUrl && <ImageIcon size={15} />}
                        </TaskAssetPreview>
                        <button type="button" onClick={() => openImageUpload({ type: 'task', taskId: task.id })} disabled={isUploadingImage}>
                          {isUploadingImage && imageUploadTarget?.type === 'task' && imageUploadTarget.taskId === task.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <UploadCloud size={14} />
                          )}
                          업로드
                        </button>
                        <button type="button" onClick={() => setPhotoPickerTarget({ type: 'task', taskId: task.id })} disabled={photoAlbums.length === 0}>
                          <FolderOpen size={14} />
                          사진첩
                        </button>
                        {task.imageUrl && (
                          <button type="button" onClick={() => updateDraftTask(task.id, { imageUrl: '' })}>
                            <X size={14} />
                            삭제
                          </button>
                        )}
                      </TaskAssetTools>
                    </TaskDraftCard>
                  ))}
                </TaskDraftSection>

                <Field>
                  <span>목표 본문</span>
                  <textarea
                    value={itemDraft.goalBody}
                    onChange={(event) => setItemDraft((draft) => ({ ...draft, goalBody: event.target.value }))}
                    rows={5}
                    placeholder="목표와 성공 기준"
                  />
                </Field>
                <HtmlDesignField>
                  <HtmlDesignHeader>
                    <span>목표 HTML 디자인</span>
                    {itemDraft.goalHtml && (
                      <button type="button" onClick={() => clearDraftHtml('goal')}>
                        <X size={14} />
                        삭제
                      </button>
                    )}
                  </HtmlDesignHeader>
                  <textarea
                    value={itemDraft.goalHtml}
                    onChange={(event) => updateDraftHtml('goal', event.target.value)}
                    rows={5}
                    aria-label="목표 본문 HTML 디자인"
                  />
                </HtmlDesignField>
              </ComposerForm>

              <ComposerFooter>
                <QuietButton type="button" onClick={() => setIsComposerOpen(false)}>
                  취소
                </QuietButton>
                <ActionButton type="button" onClick={saveItem}>
                  <Save size={16} />
                  저장
                </ActionButton>
              </ComposerFooter>
            </ComposerPanel>
          </ComposerBackdrop>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {photoPickerTarget && (
          <PhotoPickerBackdrop
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPhotoPickerTarget(null)}
          >
            <PhotoPickerPanel
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <PhotoPickerHead>
                <div>
                  <span>{getImageTargetLabel(photoPickerTarget)}</span>
                  <h2>사진첩에서 선택</h2>
                </div>
                <button type="button" onClick={() => setPhotoPickerTarget(null)} aria-label="사진첩 선택 닫기">
                  <X size={18} />
                </button>
              </PhotoPickerHead>

              <PhotoPickerBody>
                {photoAlbums.length === 0 ? (
                  <PhotoPickerEmpty>
                    <ImagePlus size={28} />
                    <strong>등록된 사진첩이 없습니다</strong>
                    <span>업로드 버튼을 사용하면 프로젝트 보드 사진첩이 자동으로 생성됩니다.</span>
                  </PhotoPickerEmpty>
                ) : (
                  photoAlbums.map((album) => {
                    const imageItems = album.photoItems.filter(isImagePhotoItem);

                    return (
                      <PhotoAlbumBlock key={album.id ?? album.title}>
                        <h3>
                          {album.title}
                          <span>{imageItems.length}장</span>
                        </h3>
                        {imageItems.length === 0 ? (
                          <small>선택 가능한 이미지가 없습니다.</small>
                        ) : (
                          <PhotoPickerGrid>
                            {imageItems.map((item) => (
                              <PhotoPickerItem
                                key={item.id}
                                type="button"
                                $image={item.url}
                                onClick={() => selectPhotoFromAlbum(photoPickerTarget, item)}
                                aria-label={`${item.fileName || album.title} 선택`}
                              >
                                <span>{item.fileName || item.extension || '사진'}</span>
                              </PhotoPickerItem>
                            ))}
                          </PhotoPickerGrid>
                        )}
                      </PhotoAlbumBlock>
                    );
                  })
                )}
              </PhotoPickerBody>
            </PhotoPickerPanel>
          </PhotoPickerBackdrop>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmRequest && (
          <ConfirmBackdrop
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ConfirmPanel
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="project-board-confirm-title"
              aria-describedby="project-board-confirm-body"
              $tone={confirmRequest.tone}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
            >
              <ConfirmIcon $tone={confirmRequest.tone}>
                <AlertTriangle size={21} />
              </ConfirmIcon>
              <div>
                <h2 id="project-board-confirm-title">{confirmRequest.title}</h2>
                <p id="project-board-confirm-body">{confirmRequest.body}</p>
              </div>
              <ConfirmActions>
                <QuietButton type="button" onClick={() => setConfirmRequest(null)}>
                  취소
                </QuietButton>
                <button
                  type="button"
                  onClick={async () => {
                    const request = confirmRequest;
                    setConfirmRequest(null);
                    await request.onConfirm();
                  }}
                >
                  {confirmRequest.confirmLabel}
                </button>
              </ConfirmActions>
            </ConfirmPanel>
          </ConfirmBackdrop>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {imagePreview && (
          <ImagePreviewBackdrop
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setImagePreview(null)}
          >
            <ImagePreviewPanel
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-board-image-preview-title"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <ImagePreviewHeader>
                <div>
                  <span>{imagePreview.caption}</span>
                  <h2 id="project-board-image-preview-title">{imagePreview.title}</h2>
                </div>
                <button type="button" onClick={() => setImagePreview(null)} aria-label="사진 크게 보기 닫기">
                  <X size={18} />
                </button>
              </ImagePreviewHeader>
              <ImagePreviewCanvas $image={imagePreview.url} role="img" aria-label={imagePreview.title} />
            </ImagePreviewPanel>
          </ImagePreviewBackdrop>
        )}
      </AnimatePresence>
    </PageShell>
  );
}

const PageShell = styled.main`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  background:
    linear-gradient(90deg, rgba(15, 23, 42, 0.032) 1px, transparent 1px),
    linear-gradient(0deg, rgba(15, 23, 42, 0.028) 1px, transparent 1px),
    #f6f8f5;
  background-size: 34px 34px, 34px 34px, auto;
  color: #17211d;
  font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  letter-spacing: 0;

  *,
  *::before,
  *::after {
    letter-spacing: 0;
  }

  .spin {
    animation: boardSpin 0.9s linear infinite;
  }

  @keyframes boardSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 680px) {
    background-size: 26px 26px, 26px 26px, auto;
  }
`;

const BoardTop = styled.section<{ $management?: boolean }>`
  width: min(100%, 1500px);
  margin: 0 auto;
  padding: ${(props) => (props.$management ? '10px 24px 8px' : '16px 28px 10px')};
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: ${(props) => (props.$management ? '12px' : '18px')};
  align-items: center;

  > div:first-child {
    h1 {
      font-size: ${(props) => (props.$management ? 'clamp(1.2rem, 1.8vw, 1.65rem)' : 'clamp(1.65rem, 2.8vw, 2.75rem)')};
    }

    p {
      max-width: ${(props) => (props.$management ? '560px' : '740px')};
      margin-top: ${(props) => (props.$management ? '5px' : '10px')};
      font-size: ${(props) => (props.$management ? '0.88rem' : '0.96rem')};
    }
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 680px) {
    gap: 14px;
    padding: 14px 16px 12px;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;

  > span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #0f766e;
    font-size: 0.82rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  h1 {
    margin: 6px 0 0;
    color: #17211d;
    font-size: clamp(1.8rem, 3.4vw, 3.6rem);
    line-height: 1.04;
    font-weight: 950;
    word-break: keep-all;
  }

  p {
    max-width: 780px;
    margin: 7px 0 0;
    color: #52645e;
    font-size: 1rem;
    line-height: 1.56;
    word-break: keep-all;
  }

  @media (max-width: 680px) {
    > span {
      gap: 7px;
      font-size: 0.74rem;
    }

    h1 {
      font-size: clamp(1.78rem, 9vw, 2.25rem);
      line-height: 1.08;
    }

    p {
      margin-top: 9px;
      font-size: 0.94rem;
      line-height: 1.62;
    }
  }
`;

const TopActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;

  @media (max-width: 680px) {
    display: grid;
    grid-template-columns: 1fr;
    justify-content: stretch;

    > button {
      width: 100%;
    }
  }
`;

const SearchBox = styled.label`
  min-width: 260px;
  height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(23, 33, 29, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  display: flex;
  align-items: center;
  gap: 9px;
  color: #63756f;

  input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #17211d;
    font: inherit;
    font-weight: 700;
  }

  input::placeholder {
    color: #93a39d;
  }

  &:focus-within {
    border-color: rgba(15, 159, 135, 0.5);
    box-shadow: 0 0 0 4px rgba(15, 159, 135, 0.12);
  }

  @media (max-width: 680px) {
    height: 46px;
    min-width: 0;
  }
`;

const ActionButton = styled.button`
  min-height: 44px;
  padding: 0 15px;
  border: 1px solid rgba(15, 159, 135, 0.38);
  border-radius: 8px;
  background: #0f9f87;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;

  &:hover,
  &:focus-visible {
    background: #0c8a75;
    transform: translateY(-1px);
    box-shadow: 0 12px 28px rgba(15, 159, 135, 0.22);
  }
`;

const QuietButton = styled.button`
  min-height: 40px;
  padding: 0 13px;
  border: 1px solid rgba(23, 33, 29, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
  color: #34443f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 900;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: rgba(23, 33, 29, 0.24);
    background: #ffffff;
  }
`;

const BoardNotice = styled.div`
  width: min(100%, 1500px);
  min-height: 36px;
  margin: 0 auto 8px;
  padding: 0 28px;
  color: #52645e;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  font-weight: 850;

  svg {
    color: #0f9f87;
  }

  @media (max-width: 680px) {
    padding: 0 16px;
  }
`;

const StatsStrip = styled.section`
  width: min(100%, 1500px);
  margin: 0 auto;
  padding: 0 28px 8px;
  display: grid;
  grid-template-columns: 128px 168px minmax(240px, 1fr);
  gap: 8px;

  @media (max-width: 840px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 680px) {
    padding: 0 16px 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
`;

const StatItem = styled.div`
  min-height: 52px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.76);
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-content: center;
  column-gap: 10px;
  padding: 9px 12px;

  svg {
    grid-row: 1 / 3;
    color: #0f9f87;
    align-self: center;
  }

  strong {
    color: #17211d;
    font-size: 1.18rem;
    line-height: 1;
  }

  span {
    margin-top: 3px;
    color: #63756f;
    font-size: 0.78rem;
    font-weight: 800;
  }

  @media (max-width: 680px) {
    min-height: 58px;
    grid-template-columns: 20px minmax(0, 1fr);
    column-gap: 7px;
    padding: 8px;

    strong {
      font-size: 1rem;
    }

    span {
      font-size: 0.68rem;
    }
  }
`;

const StatProgress = styled.div`
  min-height: 52px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.76);
  display: grid;
  align-content: center;
  gap: 10px;
  padding: 9px 12px;

  div:first-child {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  svg {
    color: #0f9f87;
  }

  span {
    color: #63756f;
    font-weight: 850;
  }

  strong {
    margin-left: auto;
    color: #17211d;
    font-size: 1.25rem;
  }

  @media (max-width: 840px) {
    grid-column: 1 / -1;
  }

  @media (max-width: 680px) {
    min-height: 58px;
    grid-column: 1 / -1;
    gap: 6px;
    padding: 8px;

    div:first-child {
      gap: 6px;
    }

    span {
      display: inline;
      font-size: 0.78rem;
    }

    strong {
      margin-left: auto;
      font-size: 1rem;
    }
  }
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 9px;
  border-radius: 999px;
  background: rgba(23, 33, 29, 0.1);
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number; $color: string }>`
  width: ${(props) => Math.max(0, Math.min(100, props.$percent))}%;
  height: 100%;
  border-radius: inherit;
  background: ${(props) => props.$color};
  transition: width 0.28s ease;
`;

const Workspace = styled.section<{ $management: boolean }>`
  width: min(100%, 1500px);
  margin: 0 auto;
  padding: 0 28px 26px;
  display: grid;
  grid-template-columns: ${(props) => (props.$management ? '310px minmax(0, 1fr)' : '1fr')};
  gap: 14px;
  align-items: start;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 680px) {
    padding: 0 16px 28px;
    gap: 12px;
  }
`;

const CategoryPanel = styled.aside<{ $management: boolean }>`
  position: ${(props) => (props.$management ? 'sticky' : 'static')};
  top: 14px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  padding: 14px;
  box-shadow: 0 18px 38px rgba(23, 33, 29, 0.07);
  display: ${(props) => (props.$management ? 'block' : 'grid')};
  grid-template-columns: ${(props) => (props.$management ? 'none' : 'auto minmax(0, 1fr) minmax(220px, 0.32fr)')};
  align-items: center;
  gap: ${(props) => (props.$management ? '0' : '12px')};

  @media (max-width: 1120px) {
    position: static;
    grid-template-columns: ${(props) => (props.$management ? 'none' : '1fr')};
  }

  @media (max-width: 680px) {
    position: static;
    padding: 12px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(14px);
  }
`;

const CategoryHeader = styled.div`
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  strong {
    color: #17211d;
    font-size: 0.96rem;
  }

  button {
    border: 0;
    background: transparent;
    color: #0f766e;
    font-weight: 900;
    cursor: pointer;
  }
`;

const CategoryList = styled.div<{ $horizontal: boolean }>`
  min-width: 0;
  margin-top: ${(props) => (props.$horizontal ? '0' : '10px')};
  display: ${(props) => (props.$horizontal ? 'flex' : 'grid')};
  gap: 7px;
  overflow-x: ${(props) => (props.$horizontal ? 'auto' : 'visible')};
  padding-bottom: ${(props) => (props.$horizontal ? '2px' : '0')};
  overscroll-behavior-x: contain;
  scroll-snap-type: ${(props) => (props.$horizontal ? 'x proximity' : 'none')};
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    display: ${(props) => (props.$horizontal ? 'none' : 'initial')};
  }

  @media (max-width: 680px) {
    gap: 8px;
    padding-bottom: 0;
    scrollbar-width: none;
  }
`;

const CategoryRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px 32px;
  gap: 5px;
`;

const CategoryFilterButton = styled.button<{ $active: boolean; $color: string; $horizontal?: boolean }>`
  min-width: ${(props) => (props.$horizontal ? '150px' : '0')};
  width: ${(props) => (props.$horizontal ? 'auto' : '100%')};
  flex: ${(props) => (props.$horizontal ? '0 0 auto' : 'initial')};
  min-height: 38px;
  padding: 0 9px;
  border: 1px solid ${(props) => (props.$active ? props.$color : 'rgba(23, 33, 29, 0.1)')};
  border-radius: 8px;
  background: ${(props) => (props.$active ? 'rgba(15, 159, 135, 0.09)' : 'rgba(255, 255, 255, 0.58)')};
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: #17211d;
  cursor: pointer;
  text-align: left;
  scroll-snap-align: start;

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: ${(props) => props.$color};
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 850;
  }

  small {
    color: #63756f;
    font-weight: 900;
  }

  @media (max-width: 680px) {
    min-width: ${(props) => (props.$horizontal ? '150px' : '0')};
    min-height: 42px;
    padding: 0 10px;
  }
`;

const IconButton = styled.button<{ $danger?: boolean }>`
  width: 32px;
  height: 38px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
  color: ${(props) => (props.$danger ? '#dc4a57' : '#52645e')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: ${(props) => (props.$danger ? 'rgba(220, 74, 87, 0.38)' : 'rgba(15, 159, 135, 0.38)')};
    background: #ffffff;
  }
`;

const CategoryEditor = styled.div`
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(23, 33, 29, 0.1);
  display: grid;
  gap: 9px;

  input,
  textarea {
    width: 100%;
    border: 1px solid rgba(23, 33, 29, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.72);
    color: #17211d;
    outline: 0;
    font: inherit;
    font-size: 0.88rem;
  }

  input {
    min-height: 38px;
    padding: 0 10px;
  }

  textarea {
    resize: vertical;
    padding: 10px;
    line-height: 1.45;
  }

  input:focus,
  textarea:focus {
    border-color: rgba(15, 159, 135, 0.46);
    box-shadow: 0 0 0 3px rgba(15, 159, 135, 0.12);
  }
`;

const EditorTitle = styled.strong`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #17211d;
  font-size: 0.9rem;

  svg {
    color: #0f9f87;
  }
`;

const SwatchGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
`;

const SwatchButton = styled.button<{ $color: string; $active: boolean }>`
  height: 30px;
  border: 2px solid ${(props) => (props.$active ? '#17211d' : 'rgba(23, 33, 29, 0.08)')};
  border-radius: 8px;
  background: ${(props) => props.$color};
  cursor: pointer;
`;

const CategoryEditorActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const ResetButton = styled.button`
  width: 100%;
  min-height: 38px;
  margin-top: 12px;
  border: 1px solid rgba(23, 33, 29, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
  color: #52645e;
  font-weight: 900;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: #ffffff;
    color: #17211d;
  }
`;

const ReadOnlyNote = styled.div<{ $compact?: boolean }>`
  margin-top: ${(props) => (props.$compact ? '0' : '14px')};
  padding: 12px;
  border: 1px solid rgba(15, 159, 135, 0.14);
  border-radius: 8px;
  background: rgba(15, 159, 135, 0.07);
  color: #52645e;
  font-size: 0.82rem;
  font-weight: 850;
  line-height: 1.5;
  word-break: keep-all;

  @media (max-width: 680px) {
    display: ${(props) => (props.$compact ? 'none' : 'block')};
  }
`;

const BoardArea = styled.div`
  min-width: 0;
  display: grid;
  gap: 14px;
`;

const FocusBoard = styled.section<{ $hasSelector: boolean }>`
  display: grid;
  grid-template-columns: ${(props) => (props.$hasSelector ? 'minmax(260px, 0.34fr) minmax(0, 1fr)' : 'minmax(0, 1fr)')};
  gap: 10px;
  align-items: stretch;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 680px) {
    gap: 12px;
  }
`;

const ProjectSelector = styled.aside`
  min-width: 0;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 12px 28px rgba(23, 33, 29, 0.075);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;

  @media (max-width: 1180px) {
    grid-template-rows: auto;
  }

  @media (max-width: 680px) {
    order: 1;
  }
`;

const ProjectSelectorHead = styled.header`
  min-height: 58px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #0f766e;
    font-size: 0.74rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    color: #17211d;
    font-size: 1rem;
  }

  small {
    min-height: 28px;
    padding: 0 9px;
    border-radius: 999px;
    background: rgba(15, 159, 135, 0.08);
    color: #0f766e;
    display: inline-flex;
    align-items: center;
    font-size: 0.78rem;
    font-weight: 950;
  }
`;

const ProjectSelectList = styled.div`
  min-height: 0;
  max-height: 548px;
  overflow: auto;
  padding: 8px;
  display: grid;
  grid-auto-rows: 104px;
  gap: 7px;
  align-content: start;
  scrollbar-width: thin;

  @media (max-width: 1180px) {
    display: flex;
    overflow-x: auto;
    max-height: none;
  }

  @media (max-width: 680px) {
    gap: 8px;
    padding: 10px;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const ProjectSelectButton = styled.button<{ $active: boolean; $color: string }>`
  min-width: 0;
  width: 100%;
  height: 104px;
  min-height: 0;
  padding: 8px;
  border: 1px solid ${(props) => (props.$active ? props.$color : 'rgba(23, 33, 29, 0.09)')};
  border-radius: 8px;
  background: ${(props) =>
    props.$active
      ? 'linear-gradient(180deg, color-mix(in srgb, var(--project-color) 12%, #ffffff), #ffffff 58%)'
      : '#ffffff'};
  color: #17211d;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  box-shadow: ${(props) => (props.$active ? '0 0 0 3px color-mix(in srgb, var(--project-color) 16%, transparent)' : 'none')};
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  --project-color: ${(props) => props.$color};

  &:hover,
  &:focus-visible {
    border-color: var(--project-color);
    outline: 3px solid color-mix(in srgb, var(--project-color) 15%, transparent);
  }

  .project-index-thumb {
    width: 64px;
    height: 88px;
    border-radius: 8px;
    background-color: #e7ece8;
    background-position: center;
    background-size: cover;
    box-shadow: inset 0 0 0 1px rgba(23, 33, 29, 0.08);
  }

  .project-index-body {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 5px;
  }

  .project-index-top,
  .project-index-meta,
  .project-index-progress {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .project-index-top b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.72rem;
    font-weight: 950;
  }

  .project-index-top b {
    color: var(--project-color);
  }

  strong {
    min-width: 0;
    color: #17211d;
    font-size: 0.95rem;
    line-height: 1.28;
    font-weight: 950;
    word-break: keep-all;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .project-index-meta {
    color: #63756f;
    font-size: 0.74rem;
    font-weight: 850;
    overflow: hidden;
    white-space: nowrap;
  }

  .project-index-meta :first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-index-meta i {
    width: 3px;
    height: 3px;
    border-radius: 999px;
    background: #a5b2ad;
  }

  .project-index-progress {
    margin-top: 2px;
  }

  .project-index-progress > span {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: rgba(23, 33, 29, 0.09);
    overflow: hidden;
  }

  .project-index-progress > span > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--project-color);
  }

  .project-index-progress b {
    color: #17211d;
    font-size: 0.74rem;
    font-weight: 950;
  }

  @media (max-width: 1180px) {
    width: 292px;
    flex: 0 0 292px;
  }

  @media (max-width: 680px) {
    width: min(292px, 82vw);
    flex-basis: min(292px, 82vw);
    height: 98px;
    scroll-snap-align: start;

    .project-index-thumb {
      height: 82px;
    }
  }
`;

const FocusDetailSlot = styled.div`
  min-width: 0;

  @media (max-width: 680px) {
    order: 2;
  }
`;

const BoardListHeader = styled.div`
  min-height: 50px;
  padding: 10px 14px;
  border: 1px solid rgba(23, 33, 29, 0.09);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  strong {
    color: #17211d;
    font-size: 0.98rem;
  }

  span,
  small {
    color: #63756f;
    font-size: 0.8rem;
    font-weight: 850;
    word-break: keep-all;
  }

  small {
    flex: 0 0 auto;
  }

  @media (max-width: 620px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const CardGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  grid-auto-rows: 1fr;
  align-items: stretch;
  gap: 12px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 14px;
  }
`;

const ProjectCard = styled(motion.article)<{ $selected?: boolean }>`
  --accent: #0f9f87;
  min-width: 0;
  height: 100%;
  position: relative;
  border: 1px solid ${(props) => (props.$selected ? 'var(--accent)' : 'rgba(23, 33, 29, 0.1)')};
  border-radius: 8px;
  overflow: hidden;
  background: ${(props) =>
    props.$selected
      ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, #ffffff), #ffffff 52%)'
      : 'rgba(255, 255, 255, 0.88)'};
  box-shadow: ${(props) =>
    props.$selected
      ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 18px 38px rgba(15, 159, 135, 0.14)'
      : '0 10px 24px rgba(23, 33, 29, 0.065)'};
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 6px;
    pointer-events: none;
    box-shadow: ${(props) => (props.$selected ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 42%, #ffffff)' : 'none')};
  }

  @media (max-width: 760px) {
    box-shadow: ${(props) =>
      props.$selected
        ? '0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent), 0 14px 30px rgba(15, 159, 135, 0.12)'
        : '0 10px 24px rgba(23, 33, 29, 0.07)'};
  }
`;

const CardPhoto = styled.button<{ $image: string }>`
  width: 100%;
  aspect-ratio: 16 / 7.2;
  min-height: 176px;
  max-height: 232px;
  border: 0;
  background:
    linear-gradient(180deg, rgba(10, 15, 13, 0.02), rgba(10, 15, 13, 0.12)),
    url(${(props) => props.$image}) center / cover no-repeat;
  display: block;
  cursor: pointer;
  transition:
    filter 0.18s ease,
    transform 0.18s ease;

  &:hover,
  &:focus-visible {
    filter: saturate(1.08) contrast(1.04);
    outline: 3px solid color-mix(in srgb, var(--accent) 32%, transparent);
    outline-offset: -3px;
  }

  @media (max-width: 760px) {
    aspect-ratio: 16 / 9;
    min-height: 0;
    max-height: none;
  }
`;

const CardBody = styled.div`
  padding: 14px;
  display: grid;
  grid-template-rows: 28px calc(1.24em * 2) calc(1.48em * 2) 38px 42px 154px;
  gap: 10px;
  align-content: start;
  overflow: hidden;

  h3 {
    margin: 0;
    color: #17211d;
    font-size: 1.14rem;
    line-height: 1.24;
    font-weight: 950;
    word-break: keep-all;
  }

  p {
    margin: 0;
    color: #52645e;
    line-height: 1.48;
    word-break: keep-all;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  @media (max-width: 760px) {
    padding: 14px 14px 15px;
    grid-template-rows: 28px auto auto 38px 42px 154px;
    gap: 9px;

    h3 {
      font-size: 1.08rem;
      line-height: 1.28;
    }

    p {
      -webkit-line-clamp: 2;
    }
  }
`;

const CardTitleButton = styled.button`
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  padding: 0;
  font: inherit;
  font-weight: inherit;
  line-height: inherit;
  text-align: left;
  word-break: keep-all;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    color: var(--accent);
    outline: 0;
    text-decoration: underline;
    text-underline-offset: 4px;
  }
`;

const CardMeta = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;

  span {
    min-width: 0;
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid rgba(23, 33, 29, 0.08);
    border-radius: 999px;
    background: #f5f7f4;
    color: #52645e;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.74rem;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  svg {
    flex: 0 0 auto;
  }

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const ProgressBlock = styled.div`
  padding-top: 2px;
`;

const ProgressCopy = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;

  span {
    color: #63756f;
    font-size: 0.8rem;
    font-weight: 900;
  }

  strong {
    color: #17211d;
    font-size: 0.9rem;
  }
`;

const StageStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  height: 42px;
  margin-top: 0;

  @media (max-width: 480px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    height: auto;
  }
`;

const StagePhotoButton = styled.button<{ $image: string; $active: boolean }>`
  min-width: 0;
  min-height: 42px;
  border: 1px solid ${(props) => (props.$active ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 18%, rgba(23, 33, 29, 0.1))')};
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background: ${(props) => (props.$active ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 7%, #ffffff)')};
  color: ${(props) => (props.$active ? '#ffffff' : '#34443f')};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 8px;
  cursor: pointer;

  svg {
    flex: 0 0 auto;
    color: ${(props) => (props.$active ? '#ffffff' : 'var(--accent)')};
  }

  span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.74rem;
    font-weight: 950;
  }

  &:hover,
  &:focus-visible {
    background: ${(props) => (props.$active ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 12%, #ffffff)')};
    outline: 3px solid color-mix(in srgb, var(--accent) 18%, transparent);
  }
`;

const CardPreviewPanel = styled.div`
  min-width: 0;
  min-height: 154px;
  border-top: 1px solid color-mix(in srgb, var(--accent) 18%, rgba(23, 33, 29, 0.08));
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, #ffffff), rgba(255, 255, 255, 0.66));
  padding: 10px 2px 0;
  display: grid;
  grid-template-rows: 24px minmax(0, 1fr) auto;
  gap: 8px;
  overflow: hidden;
`;

const CardPreviewHeader = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  span {
    color: #63756f;
    font-size: 0.76rem;
    font-weight: 950;
  }

  strong {
    min-height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, #ffffff);
    color: var(--accent);
    display: inline-flex;
    align-items: center;
    font-size: 0.76rem;
    font-weight: 950;
    white-space: nowrap;
  }
`;

const CardPreviewText = styled.p`
  min-width: 0;
  margin: 0;
  color: #40504b;
  font-size: 0.86rem;
  line-height: 1.52;
  word-break: keep-all;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const CardPreviewChips = styled.div`
  min-width: 0;
  display: flex;
  gap: 6px;
  overflow: hidden;

  span {
    min-width: 0;
    max-width: 50%;
    min-height: 26px;
    padding: 0 8px;
    border-radius: 999px;
    background: rgba(23, 33, 29, 0.055);
    color: #52645e;
    display: inline-flex;
    align-items: center;
    font-size: 0.72rem;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const TaskPreview = styled.div`
  display: grid;
  grid-template-rows: repeat(3, 32px);
  gap: 5px;
  height: 106px;
  margin-top: 0;
  overflow: hidden;

  @media (max-width: 760px) {
    grid-template-rows: repeat(3, 32px);
  }
`;

const TaskToggle = styled.div<{ $done: boolean }>`
  min-width: 0;
  min-height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: ${(props) => (props.$done ? '#0f9f87' : '#63756f')};
  display: grid;
  grid-template-columns: 36px 16px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  padding: 3px;

  &:hover,
  &:focus-visible {
    background: rgba(15, 159, 135, 0.07);
  }

  .task-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${(props) => (props.$done ? '#17211d' : '#52645e')};
    font-size: 0.82rem;
    text-decoration: ${(props) => (props.$done ? 'line-through' : 'none')};
  }
`;

const TaskPreviewPhoto = styled.button<{ $image: string }>`
  width: 36px;
  height: 28px;
  border: 0;
  border-radius: 7px;
  background:
    linear-gradient(180deg, rgba(10, 15, 13, 0.04), rgba(10, 15, 13, 0.22)),
    url(${(props) => props.$image}) center / cover;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    outline: 3px solid rgba(15, 159, 135, 0.24);
    outline-offset: -2px;
  }
`;

const TaskPlaceholder = styled.div`
  min-width: 0;
  min-height: 32px;
  border-radius: 8px;
  color: #9ca8a3;
  display: grid;
  grid-template-columns: 36px 16px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  padding: 3px;
  opacity: 0.72;

  > span:first-child {
    width: 36px;
    height: 28px;
    border-radius: 7px;
    background:
      linear-gradient(135deg, rgba(23, 33, 29, 0.06), rgba(23, 33, 29, 0.02)),
      repeating-linear-gradient(45deg, rgba(23, 33, 29, 0.08) 0 1px, transparent 1px 7px);
  }

  svg {
    color: #b8c2be;
  }

  .task-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.82rem;
    font-weight: 850;
  }
`;

const CardActions = styled.div`
  min-height: 46px;
  border-top: 1px solid rgba(23, 33, 29, 0.08);
  display: grid;
  grid-template-columns: 1fr 1fr;

  button {
    border: 0;
    background: transparent;
    color: #52645e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-weight: 900;
    cursor: pointer;
  }

  button + button {
    border-left: 1px solid rgba(23, 33, 29, 0.08);
  }

  .danger {
    color: #dc4a57;
  }

  button:hover,
  button:focus-visible {
    background: rgba(15, 159, 135, 0.07);
  }
`;

const EmptyState = styled.div`
  min-height: 360px;
  border: 1px dashed rgba(23, 33, 29, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  color: #63756f;
  padding: 28px;

  strong {
    color: #17211d;
    font-size: 1.1rem;
  }
`;

const DetailPanel = styled(motion.article)<{ $pinned?: boolean }>`
  width: 100%;
  scroll-margin-top: 16px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
  color: #17211d;
  box-shadow: ${(props) => (props.$pinned ? '0 14px 30px rgba(23, 33, 29, 0.08)' : '0 16px 38px rgba(23, 33, 29, 0.09)')};
  display: flex;
  flex-direction: column;

  @media (max-width: 760px) {
    scroll-margin-top: 12px;
  }
`;

const DetailHero = styled.header`
  display: grid;
  grid-template-columns: minmax(220px, 0.36fr) minmax(0, 1fr);
  background: #ffffff;
  border-bottom: 1px solid rgba(23, 33, 29, 0.1);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const DetailImageFrame = styled.button<{ $image: string }>`
  width: 100%;
  height: 100%;
  min-height: 188px;
  border: 0;
  background-color: #111a17;
  background-image: url(${(props) => props.$image});
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: zoom-in;

  &:hover,
  &:focus-visible {
    outline: 3px solid rgba(15, 159, 135, 0.28);
    outline-offset: -3px;
  }

  @media (max-width: 620px) {
    min-height: 146px;
    aspect-ratio: 16 / 7;
  }
`;

const DetailTitleRow = styled.div<{ $hasAction?: boolean }>`
  padding: 18px 20px;
  display: grid;
  grid-template-columns: ${(props) => (props.$hasAction ? 'minmax(0, 1fr) 40px' : 'minmax(0, 1fr)')};
  align-items: center;
  gap: 16px;

  > div {
    min-width: 0;
  }

  button {
    width: 40px;
    height: 40px;
    border: 1px solid rgba(23, 33, 29, 0.1);
    border-radius: 8px;
    background: #f5f7f4;
    color: #17211d;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  span {
    width: fit-content;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(15, 159, 135, 0.1);
    color: #0f766e;
    display: inline-flex;
    align-items: center;
    font-size: 0.8rem;
    font-weight: 950;
  }

  h2 {
    max-width: 760px;
    margin: 9px 0 0;
    color: #17211d;
    font-size: clamp(1.38rem, 2.5vw, 2.12rem);
    line-height: 1.12;
    font-weight: 950;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    padding: 16px;
    grid-template-columns: ${(props) => (props.$hasAction ? 'minmax(0, 1fr) 38px' : 'minmax(0, 1fr)')};

    button {
      width: 38px;
      height: 38px;
    }

    span {
      max-width: 100%;
    }

    h2 {
      font-size: clamp(1.28rem, 7vw, 1.7rem);
      line-height: 1.16;
    }
  }
`;

const DetailMetaLine = styled.div`
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;

  small {
    min-height: 28px;
    padding: 0 9px;
    border: 1px solid rgba(23, 33, 29, 0.08);
    border-radius: 999px;
    background: #f5f7f4;
    color: #52645e;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 850;
  }
`;

const DetailTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid rgba(23, 33, 29, 0.1);

  @media (max-width: 520px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  button {
    min-height: 44px;
    min-width: 0;
    border: 0;
    background: #ffffff;
    color: #63756f;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 950;
    cursor: pointer;
  }

  button svg {
    flex: 0 0 auto;
  }

  button + button {
    border-left: 1px solid rgba(23, 33, 29, 0.08);
  }

  button.active {
    color: #0f766e;
    background: rgba(15, 159, 135, 0.08);
  }
`;

const DetailBody = styled.div`
  overflow-y: auto;
  padding: 16px 20px 20px;

  @media (max-width: 620px) {
    padding: 14px;
  }
`;

const TextArticle = styled.article`
  h3 {
    margin: 0 0 12px;
    color: #17211d;
    font-size: 1.2rem;
  }

  p {
    margin: 0;
    color: #40504b;
    font-size: 0.98rem;
    line-height: 1.72;
    white-space: pre-line;
    word-break: keep-all;
  }
`;

const HtmlArticle = styled.article`
  h3 {
    margin: 0 0 12px;
    color: #17211d;
    font-size: 1.2rem;
  }

  .html-canvas {
    display: grid;
    gap: 12px;
    color: #2d3b36;
    font-size: 0.96rem;
    line-height: 1.68;
    word-break: keep-all;
  }

  .html-canvas :where(section, article, div) {
    display: grid;
    gap: 9px;
  }

  .html-canvas > :where(section, article, div) {
    border: 1px solid rgba(23, 33, 29, 0.1);
    border-radius: 8px;
    background: #ffffff;
    padding: 13px;
  }

  .html-canvas :where(header) {
    display: grid;
    gap: 4px;
  }

  .html-canvas :where(h3, h4) {
    margin: 0;
    color: #17211d;
    font-size: 1rem;
    line-height: 1.35;
  }

  .html-canvas :where(p, ul, ol) {
    margin: 0;
  }

  .html-canvas :where(ul, ol) {
    padding-left: 20px;
  }

  .html-canvas :where(li + li) {
    margin-top: 4px;
  }

  .html-canvas :where(strong, th) {
    color: #17211d;
    font-weight: 900;
  }

  .html-canvas table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    overflow: hidden;
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .html-canvas th,
  .html-canvas td {
    border: 1px solid rgba(23, 33, 29, 0.1);
    padding: 9px 10px;
    vertical-align: top;
    text-align: left;
  }

  .html-canvas th {
    background: rgba(15, 159, 135, 0.08);
  }

  .html-canvas small {
    color: #63756f;
  }

  @media (max-width: 520px) {
    .html-canvas {
      font-size: 0.92rem;
    }

    .html-canvas > :where(section, article, div) {
      padding: 11px;
    }

    .html-canvas table {
      display: block;
      overflow-x: auto;
      white-space: nowrap;
      scrollbar-width: thin;
    }
  }
`;

const PlanStageArticle = styled.article`
  display: grid;
  gap: 13px;
  margin-bottom: 18px;
`;

const PlanStageHeader = styled.div`
  min-height: 40px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  h3 {
    margin: 0;
    color: #17211d;
    font-size: 1.2rem;
  }

  span {
    color: #63756f;
    font-size: 0.86rem;
    font-weight: 800;
    word-break: keep-all;
  }

  strong {
    min-height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(15, 159, 135, 0.09);
    color: #0f766e;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    font-size: 0.82rem;
    font-weight: 950;
  }

  @media (max-width: 520px) {
    flex-direction: column;
  }
`;

const PlanStageList = styled.div`
  display: grid;
  gap: 10px;
`;

const PlanStageCard = styled.section`
  min-width: 0;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(15, 159, 135, 0.07), #ffffff 42%);
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(132px, 0.28fr) minmax(0, 1fr);

  > div {
    min-width: 0;
    padding: 16px;
    display: grid;
    align-content: center;
    gap: 7px;
  }

  small {
    color: #0f766e;
    font-size: 0.75rem;
    font-weight: 950;
  }

  h4 {
    margin: 0;
    color: #17211d;
    font-size: 1.05rem;
    line-height: 1.35;
    font-weight: 950;
    word-break: keep-all;
  }

  p {
    margin: 0;
    color: #40504b;
    line-height: 1.62;
    white-space: pre-line;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const PlanStagePhoto = styled.button<{ $image: string }>`
  min-height: 140px;
  border: 0;
  position: relative;
  background:
    linear-gradient(180deg, rgba(10, 15, 13, 0.02), rgba(10, 15, 13, 0.2)),
    url(${(props) => props.$image}) center / cover;
  cursor: zoom-in;

  span {
    position: absolute;
    left: 10px;
    top: 10px;
    min-width: 38px;
    height: 28px;
    padding: 0 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    color: #17211d;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    font-weight: 950;
  }

  &:hover,
  &:focus-visible {
    outline: 3px solid rgba(15, 159, 135, 0.26);
    outline-offset: -3px;
  }

  @media (max-width: 620px) {
    min-height: 150px;
    aspect-ratio: 16 / 8;
  }
`;

const TaskArticle = styled.article`
  display: grid;
  gap: 14px;
`;

const TaskArticleHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h3 {
    margin: 0;
    color: #17211d;
    font-size: 1.2rem;
  }

  strong {
    color: #0f766e;
    font-size: 1.4rem;
  }
`;

const DetailTaskList = styled.div`
  display: grid;
  gap: 8px;
`;

const DetailTaskButton = styled.div<{ $done: boolean; $interactive: boolean }>`
  min-height: 74px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: ${(props) => (props.$done ? 'rgba(15, 159, 135, 0.08)' : '#ffffff')};
  color: ${(props) => (props.$done ? '#0f766e' : '#63756f')};
  display: grid;
  grid-template-columns: 82px 22px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 8px 12px 8px 8px;
  text-align: left;
  cursor: ${(props) => (props.$interactive ? 'pointer' : 'default')};

  .task-state {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .task-title {
    color: #17211d;
    font-weight: 850;
    text-decoration: ${(props) => (props.$done ? 'line-through' : 'none')};
  }

  @media (max-width: 520px) {
    grid-template-columns: 64px minmax(0, 1fr);

    .task-state {
      display: none;
    }
  }
`;

const DetailTaskPhoto = styled.button<{ $image: string }>`
  width: 74px;
  height: 56px;
  border: 0;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(10, 15, 13, 0.04), rgba(10, 15, 13, 0.26)),
    url(${(props) => props.$image}) center / cover;
  cursor: zoom-in;

  &:hover,
  &:focus-visible {
    outline: 3px solid rgba(15, 159, 135, 0.24);
    outline-offset: -2px;
  }

  @media (max-width: 520px) {
    width: 56px;
    height: 48px;
  }
`;

const ComposerBackdrop = styled(motion.div)`
  width: min(100%, 1500px);
  margin: 0 auto 34px;
  padding: 0 28px;
  display: block;

  @media (max-width: 680px) {
    padding: 0 14px;
  }
`;

const ComposerPanel = styled(motion.aside)`
  width: 100%;
  max-width: 1040px;
  margin-left: auto;
  scroll-margin-top: 94px;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #ffffff;
  color: #17211d;
  box-shadow: 0 24px 70px rgba(23, 33, 29, 0.14);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 1120px) {
    max-width: none;
  }

  @media (max-width: 680px) {
    border-radius: 8px;
    box-shadow: 0 18px 48px rgba(23, 33, 29, 0.14);
  }
`;

const ComposerHeader = styled.header`
  min-height: 94px;
  padding: 20px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.1);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;

  span {
    color: #0f766e;
    font-size: 0.78rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  h2 {
    margin: 6px 0 0;
    color: #17211d;
    font-size: 1.45rem;
  }

  button {
    width: 38px;
    height: 38px;
    border: 1px solid rgba(23, 33, 29, 0.1);
    border-radius: 8px;
    background: #ffffff;
    color: #52645e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  @media (max-width: 620px) {
    min-height: 78px;
    padding: 16px;

    h2 {
      font-size: 1.2rem;
    }
  }
`;

const ComposerForm = styled.div`
  padding: 20px;
  display: grid;
  gap: 13px;

  @media (min-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > div,
    > label:has(textarea) {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 620px) {
    padding: 16px;
    gap: 12px;
  }
`;

const Field = styled.label`
  min-width: 0;
  display: grid;
  gap: 6px;

  span {
    color: #63756f;
    font-size: 0.78rem;
    font-weight: 950;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid rgba(23, 33, 29, 0.13);
    border-radius: 8px;
    background: #f8faf8;
    color: #17211d;
    outline: 0;
    font: inherit;
  }

  input,
  select {
    min-height: 40px;
    padding: 0 10px;
  }

  textarea {
    resize: vertical;
    padding: 10px;
    line-height: 1.5;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: rgba(15, 159, 135, 0.48);
    box-shadow: 0 0 0 3px rgba(15, 159, 135, 0.12);
  }
`;

const HtmlDesignField = styled.div`
  min-width: 0;
  display: grid;
  gap: 6px;

  textarea {
    width: 100%;
    min-height: 126px;
    min-width: 0;
    border: 1px solid rgba(23, 33, 29, 0.13);
    border-radius: 8px;
    background: #f8faf8;
    color: #17211d;
    outline: 0;
    font: 0.86rem/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    resize: vertical;
    padding: 10px;
  }

  textarea:focus {
    border-color: rgba(15, 159, 135, 0.48);
    box-shadow: 0 0 0 3px rgba(15, 159, 135, 0.12);
  }
`;

const HtmlDesignHeader = styled.div`
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  span {
    color: #63756f;
    font-size: 0.78rem;
    font-weight: 950;
  }

  button {
    min-height: 30px;
    padding: 0 9px;
    border: 1px solid rgba(220, 74, 87, 0.18);
    border-radius: 8px;
    background: rgba(220, 74, 87, 0.07);
    color: #dc4a57;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 0.76rem;
    font-weight: 900;
    cursor: pointer;
  }
`;

const AiContentPanel = styled.div`
  min-width: 0;
  border: 1px solid rgba(15, 159, 135, 0.18);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(15, 159, 135, 0.1), rgba(37, 99, 235, 0.06));
  padding: 12px;
  display: grid;
  gap: 10px;
`;

const AiContentHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: center;

  div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  strong {
    color: #17211d;
    font-size: 0.92rem;
  }

  small {
    color: #63756f;
    line-height: 1.45;
    word-break: keep-all;
  }

  button {
    min-height: 36px;
    padding: 0 11px;
    border: 1px solid rgba(15, 159, 135, 0.28);
    border-radius: 8px;
    background: #0f9f87;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: 950;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.52;
    cursor: not-allowed;
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const AiContentButtons = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;

  button {
    min-width: 0;
    min-height: 34px;
    padding: 0 8px;
    border: 1px solid rgba(23, 33, 29, 0.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.72);
    color: #34443f;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 0.78rem;
    font-weight: 900;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.52;
    cursor: not-allowed;
  }

  @media (max-width: 460px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const ImageAssetEditor = styled.div`
  min-width: 0;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #f8faf8;
  padding: 10px;
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  gap: 12px;

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const AssetPreview = styled.button<{ $image: string }>`
  min-height: 108px;
  border: 0;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(10, 15, 13, 0.04), rgba(10, 15, 13, 0.26)),
    ${(props) => (props.$image ? `url(${props.$image}) center / cover` : '#edf2ef')};
  color: #93a39d;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ${(props) => (props.$image ? 'zoom-in' : 'default')};

  &:disabled {
    cursor: default;
  }

  &:not(:disabled):hover,
  &:not(:disabled):focus-visible {
    outline: 3px solid rgba(15, 159, 135, 0.24);
    outline-offset: -2px;
  }
`;

const AssetControls = styled.div`
  min-width: 0;
  display: grid;
  gap: 8px;

  input,
  select {
    width: 100%;
    min-width: 0;
    min-height: 38px;
    border: 1px solid rgba(23, 33, 29, 0.13);
    border-radius: 8px;
    background: #ffffff;
    color: #17211d;
    outline: 0;
    font: inherit;
    padding: 0 10px;
  }
`;

const AssetTitle = styled.div`
  display: grid;
  gap: 2px;

  span {
    color: #63756f;
    font-size: 0.78rem;
    font-weight: 950;
  }

  small {
    color: #7b8a86;
    line-height: 1.35;
  }
`;

const AssetToolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, auto);
  gap: 7px;

  button {
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid rgba(23, 33, 29, 0.12);
    border-radius: 8px;
    background: #ffffff;
    color: #34443f;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: 900;
    cursor: pointer;
  }

  button:disabled,
  select:disabled {
    opacity: 0.52;
    cursor: not-allowed;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr 1fr;

    select {
      grid-column: 1 / -1;
    }
  }
`;

const TwoFields = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const PlanStageDraftSection = styled.div`
  display: grid;
  gap: 9px;
`;

const PlanStageDraftCard = styled.div`
  border: 1px solid rgba(15, 159, 135, 0.16);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(15, 159, 135, 0.08), #f8faf8 42%);
  padding: 10px;
  display: grid;
  gap: 8px;

  input,
  textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid rgba(23, 33, 29, 0.12);
    border-radius: 8px;
    background: #ffffff;
    color: #17211d;
    outline: 0;
    font: inherit;
  }

  input {
    min-height: 38px;
    padding: 0 10px;
  }

  textarea {
    resize: vertical;
    padding: 10px;
    line-height: 1.5;
  }

  input:focus,
  textarea:focus {
    border-color: rgba(15, 159, 135, 0.48);
    box-shadow: 0 0 0 3px rgba(15, 159, 135, 0.12);
  }
`;

const PlanStageDraftCardTop = styled.div`
  min-height: 28px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  align-items: center;
  gap: 8px;

  strong {
    color: #17211d;
    font-size: 0.86rem;
  }

  button {
    width: 30px;
    height: 30px;
    border: 1px solid rgba(220, 74, 87, 0.18);
    border-radius: 8px;
    background: rgba(220, 74, 87, 0.07);
    color: #dc4a57;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
`;

const TaskDraftSection = styled.div`
  display: grid;
  gap: 9px;
`;

const TaskDraftHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  span {
    color: #63756f;
    font-size: 0.78rem;
    font-weight: 950;
  }

  button {
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid rgba(15, 159, 135, 0.28);
    border-radius: 8px;
    background: rgba(15, 159, 135, 0.08);
    color: #0f766e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: 900;
    cursor: pointer;
  }
`;

const TaskDraftCard = styled.div`
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  background: #f8faf8;
  padding: 10px;
  display: grid;
  gap: 8px;

  input[type='text'],
  input:not([type]) {
    width: 100%;
    min-height: 38px;
    border: 1px solid rgba(23, 33, 29, 0.12);
    border-radius: 8px;
    background: #ffffff;
    color: #17211d;
    outline: 0;
    font: inherit;
    padding: 0 10px;
  }

  input:focus {
    border-color: rgba(15, 159, 135, 0.48);
    box-shadow: 0 0 0 3px rgba(15, 159, 135, 0.12);
  }
`;

const TaskDraftCardTop = styled.div`
  min-height: 28px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 30px;
  align-items: center;
  gap: 8px;

  strong {
    color: #17211d;
    font-size: 0.86rem;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #52645e;
    font-size: 0.78rem;
    font-weight: 900;
  }

  input {
    accent-color: #0f9f87;
  }

  button {
    width: 30px;
    height: 30px;
    border: 1px solid rgba(220, 74, 87, 0.18);
    border-radius: 8px;
    background: rgba(220, 74, 87, 0.07);
    color: #dc4a57;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
`;

const TaskAssetTools = styled.div`
  display: grid;
  grid-template-columns: 42px repeat(3, minmax(0, 1fr));
  gap: 7px;
  align-items: center;

  button {
    min-width: 0;
    min-height: 34px;
    border: 1px solid rgba(23, 33, 29, 0.12);
    border-radius: 8px;
    background: #ffffff;
    color: #34443f;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 0.75rem;
    font-weight: 900;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.52;
    cursor: not-allowed;
  }

  @media (max-width: 520px) {
    grid-template-columns: 42px repeat(2, minmax(0, 1fr));
  }
`;

const TaskAssetPreview = styled.button<{ $image: string }>`
  width: 42px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(10, 15, 13, 0.04), rgba(10, 15, 13, 0.22)),
    ${(props) => (props.$image ? `url(${props.$image}) center / cover` : '#edf2ef')};
  color: #93a39d;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: ${(props) => (props.$image ? 'zoom-in' : 'default')};

  &:disabled {
    cursor: default;
  }

  &:not(:disabled):hover,
  &:not(:disabled):focus-visible {
    outline: 3px solid rgba(15, 159, 135, 0.24);
    outline-offset: -2px;
  }
`;

const ComposerFooter = styled.footer`
  padding: 14px 20px;
  border-top: 1px solid rgba(23, 33, 29, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 9px;

  @media (max-width: 620px) {
    position: sticky;
    bottom: 0;
    z-index: 2;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(14px);

    button {
      flex: 1;
    }
  }
`;

const PhotoPickerBackdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 3400;
  padding: 24px;
  background: rgba(7, 10, 9, 0.48);
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 620px) {
    padding: 10px;
  }
`;

const PhotoPickerPanel = styled(motion.section)`
  width: min(880px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  border-radius: 8px;
  background: #ffffff;
  color: #17211d;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.28);

  @media (max-width: 620px) {
    max-height: calc(100dvh - 20px);
  }
`;

const PhotoPickerHead = styled.header`
  min-height: 78px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(23, 33, 29, 0.1);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;

  span {
    color: #0f766e;
    font-size: 0.76rem;
    font-weight: 950;
  }

  h2 {
    margin: 4px 0 0;
    color: #17211d;
    font-size: 1.35rem;
  }

  button {
    width: 38px;
    height: 38px;
    border: 1px solid rgba(23, 33, 29, 0.1);
    border-radius: 8px;
    background: #ffffff;
    color: #52645e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
`;

const PhotoPickerBody = styled.div`
  overflow-y: auto;
  padding: 18px 20px 22px;
  display: grid;
  gap: 18px;
`;

const PhotoPickerEmpty = styled.div`
  min-height: 240px;
  border: 1px dashed rgba(23, 33, 29, 0.18);
  border-radius: 8px;
  background: #f8faf8;
  color: #63756f;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  text-align: center;

  strong {
    color: #17211d;
  }
`;

const PhotoAlbumBlock = styled.section`
  display: grid;
  gap: 10px;

  h3 {
    margin: 0;
    color: #17211d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.98rem;
  }

  h3 span,
  > small {
    color: #63756f;
    font-size: 0.78rem;
    font-weight: 850;
  }
`;

const PhotoPickerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
`;

const PhotoPickerItem = styled.button<{ $image: string }>`
  min-width: 0;
  aspect-ratio: 1;
  border: 1px solid rgba(23, 33, 29, 0.1);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background:
    linear-gradient(180deg, rgba(10, 15, 13, 0.02), rgba(10, 15, 13, 0.48)),
    url(${(props) => props.$image}) center / cover;
  cursor: pointer;

  span {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 8px;
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  &:hover,
  &:focus-visible {
    border-color: rgba(15, 159, 135, 0.65);
    outline: 3px solid rgba(15, 159, 135, 0.18);
  }
`;

const ConfirmBackdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 3600;
  padding: 24px;
  background: rgba(7, 10, 9, 0.44);
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 620px) {
    padding: 12px;
  }
`;

const ConfirmPanel = styled(motion.section)<{ $tone: 'danger' | 'warning' }>`
  width: min(460px, 100%);
  border: 1px solid ${(props) => (props.$tone === 'danger' ? 'rgba(220, 74, 87, 0.22)' : 'rgba(217, 119, 6, 0.22)')};
  border-radius: 8px;
  background: #ffffff;
  color: #17211d;
  padding: 20px;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.28);
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 14px;

  h2 {
    margin: 0;
    color: #17211d;
    font-size: 1.18rem;
  }

  p {
    margin: 8px 0 0;
    color: #52645e;
    line-height: 1.6;
    word-break: keep-all;
  }
`;

const ConfirmIcon = styled.div<{ $tone: 'danger' | 'warning' }>`
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: ${(props) => (props.$tone === 'danger' ? 'rgba(220, 74, 87, 0.09)' : 'rgba(217, 119, 6, 0.1)')};
  color: ${(props) => (props.$tone === 'danger' ? '#dc4a57' : '#d97706')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const ConfirmActions = styled.div`
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 9px;

  > button:last-child {
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid rgba(220, 74, 87, 0.22);
    border-radius: 8px;
    background: #dc4a57;
    color: #ffffff;
    font-weight: 900;
    cursor: pointer;
  }

  @media (max-width: 520px) {
    button {
      flex: 1;
    }
  }
`;

const ImagePreviewBackdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 3700;
  padding: 24px;
  background: rgba(7, 10, 9, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 620px) {
    padding: 12px;
  }
`;

const ImagePreviewPanel = styled(motion.section)`
  width: min(1120px, 100%);
  max-height: calc(100vh - 48px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: #0b1110;
  color: #ffffff;
  overflow: hidden;
  box-shadow: 0 34px 110px rgba(0, 0, 0, 0.42);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
`;

const ImagePreviewHeader = styled.header`
  min-height: 68px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  align-items: start;
  gap: 14px;

  span {
    color: rgba(255, 255, 255, 0.58);
    font-size: 0.78rem;
    font-weight: 900;
  }

  h2 {
    margin: 4px 0 0;
    color: #ffffff;
    font-size: clamp(1rem, 2vw, 1.35rem);
    line-height: 1.25;
  }

  button {
    width: 40px;
    height: 40px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
`;

const ImagePreviewCanvas = styled.div<{ $image: string }>`
  min-height: min(72vh, 720px);
  background:
    linear-gradient(45deg, rgba(255, 255, 255, 0.035) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.035) 25%, transparent 25%),
    url(${(props) => props.$image}) center / contain no-repeat;
  background-color: #090d0c;
  background-size: 22px 22px, 22px 22px, contain;

  @media (max-width: 620px) {
    min-height: 62vh;
  }
`;
