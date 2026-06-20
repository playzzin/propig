'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Eye,
  GripVertical,
  LayoutDashboard,
  Loader2,
  LogIn,
  Plus,
  ShoppingBag,
  X,
} from 'lucide-react';
import styled, { keyframes } from 'styled-components';
import { toast } from 'sonner';
import { PROPIG_STORE_APPS, type PropigStoreApp } from '@/constants/propigStore';
import { useAuth } from '@/contexts/AuthContext';
import { usePropigAppRegistry } from '@/hooks/usePropigAppRegistry';

const WIDGET_LABELS: Record<string, string> = {
  memo: '메모 위젯',
  habit: '습관 위젯',
  bucket: '버킷 위젯',
  todo: '할일 위젯',
};

function getStoreSurfaceLabel(app: Pick<PropigStoreApp, 'widgetId'>): string {
  return app.widgetId ? WIDGET_LABELS[app.widgetId] : '단독 프로그램';
}

export default function PropigStore() {
  const { currentUser, loading: authLoading, isConfigured, loginWithGoogle } = useAuth();
  const appRegistry = usePropigAppRegistry();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [previewAppId, setPreviewAppId] = useState<PropigStoreApp['id'] | null>(null);

  const installedCount = useMemo(
    () => PROPIG_STORE_APPS.filter((app) => app.status === 'available' && appRegistry.installedAppIdSet.has(app.id)).length,
    [appRegistry.installedAppIdSet],
  );
  const installedApps = useMemo(
    () =>
      appRegistry.installedAppIds
        .map((appId) => PROPIG_STORE_APPS.find((app) => app.id === appId))
        .filter((app): app is PropigStoreApp => Boolean(app && app.status === 'available')),
    [appRegistry.installedAppIds],
  );
  const previewApp = useMemo(
    () => PROPIG_STORE_APPS.find((app) => app.id === previewAppId && app.status === 'available') ?? null,
    [previewAppId],
  );

  useEffect(() => {
    if (!previewAppId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewAppId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewAppId]);

  const handleSignIn = async () => {
    if (!isConfigured || isSigningIn) return;
    try {
      setIsSigningIn(true);
      await loginWithGoogle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleStoreToggle = useCallback(
    async (app: PropigStoreApp) => {
      if (app.status !== 'available') return;
      const nextInstalled = !appRegistry.isInstalled(app.id);
      await appRegistry.toggleApp(app.id);
      toast.success(nextInstalled ? `${app.title} 등록 완료` : `${app.title} 등록 해제`);
    },
    [appRegistry],
  );

  const handlePreviewApp = useCallback((app: PropigStoreApp) => {
    if (app.status !== 'available') return;
    setPreviewAppId(app.id);
  }, []);

  const handleConfirmRegistration = useCallback(
    async (app: PropigStoreApp) => {
      if (app.status !== 'available' || appRegistry.isInstalled(app.id)) {
        setPreviewAppId(null);
        return;
      }

      await appRegistry.installApp(app.id);
      toast.success(`${app.title} 등록 완료`);
      setPreviewAppId(null);
    },
    [appRegistry],
  );

  const handleMoveApp = useCallback(
    async (app: PropigStoreApp, direction: -1 | 1) => {
      await appRegistry.moveApp(app.id, direction);
      toast.success('메뉴 순서를 변경했습니다.');
    },
    [appRegistry],
  );

  return (
    <StoreShell>
      <StoreHero>
        <HeroCopy>
          <Eyebrow>
            <ShoppingBag size={16} />
            PROPIG STORE
          </Eyebrow>
          <HeroTitle>상점</HeroTitle>
          <HeroText>
            프로그램은 개인별로 등록하고, 등록된 프로그램의 위젯은 propig 대시보드에서 배치해 사용합니다.
            관리자가 등록한 좌측 메뉴는 고정으로 유지됩니다.
          </HeroText>
        </HeroCopy>

        <HeroActions>
          <StoreStatus>{appRegistry.isLoading ? '확인 중' : `${installedCount}개 사용 중`}</StoreStatus>
          <DashboardLink href="/propig">
            <LayoutDashboard size={16} />
            위젯 대시보드
          </DashboardLink>
          {!currentUser ? (
            <LoginButton type="button" onClick={() => void handleSignIn()} disabled={authLoading || !isConfigured || isSigningIn}>
              {isSigningIn ? <SpinningLoader size={16} /> : <LogIn size={16} />}
              로그인
            </LoginButton>
          ) : null}
        </HeroActions>
      </StoreHero>

      <StoreOrderPanel>
        <StoreOrderHead>
          <div>
            <strong>좌측 메뉴 순서</strong>
            <span>{installedCount}개 등록됨</span>
          </div>
          {appRegistry.isSavingOrder ? <SpinningLoader size={16} /> : <GripVertical size={16} />}
        </StoreOrderHead>

        {installedApps.length > 0 ? (
          <StoreOrderList>
            {installedApps.map((app, index) => (
              <StoreOrderItem key={app.id} $color={app.color}>
                <StoreOrderRank>{index + 1}</StoreOrderRank>
                <StoreOrderIcon $color={app.color}>
                  <i className={`fa-solid fa-${app.icon}`} aria-hidden="true" />
                </StoreOrderIcon>
                <StoreOrderCopy>
                  <strong>{app.title}</strong>
                  <span>{app.badge}</span>
                </StoreOrderCopy>
                <StoreOrderActions>
                  <StoreOrderButton
                    type="button"
                    onClick={() => void handleMoveApp(app, -1)}
                    disabled={index === 0 || appRegistry.isLoading || appRegistry.isSavingOrder}
                    aria-label={`${app.title} 위로 이동`}
                    title="위로 이동"
                  >
                    <ArrowUp size={15} />
                  </StoreOrderButton>
                  <StoreOrderButton
                    type="button"
                    onClick={() => void handleMoveApp(app, 1)}
                    disabled={index === installedApps.length - 1 || appRegistry.isLoading || appRegistry.isSavingOrder}
                    aria-label={`${app.title} 아래로 이동`}
                    title="아래로 이동"
                  >
                    <ArrowDown size={15} />
                  </StoreOrderButton>
                </StoreOrderActions>
              </StoreOrderItem>
            ))}
          </StoreOrderList>
        ) : (
          <StoreOrderEmpty>등록된 프로그램이 없습니다.</StoreOrderEmpty>
        )}
      </StoreOrderPanel>

      <StoreGrid>
        {PROPIG_STORE_APPS.map((app) => renderStoreCard(app, appRegistry, handleStoreToggle, handlePreviewApp))}
      </StoreGrid>
      {appRegistry.error ? <ErrorText>{appRegistry.error}</ErrorText> : null}

      {previewApp ? (
        <PreviewBackdrop role="presentation" onClick={() => setPreviewAppId(null)}>
          <PreviewDialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="propig-store-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <PreviewHeader>
              <StoreAppIcon $color={previewApp.color}>
                <i className={`fa-solid fa-${previewApp.icon}`} aria-hidden="true" />
              </StoreAppIcon>
              <PreviewHeading>
                <span>{previewApp.badge} PREVIEW</span>
                <strong id="propig-store-preview-title">{previewApp.title}</strong>
              </PreviewHeading>
              <PreviewCloseButton type="button" onClick={() => setPreviewAppId(null)} aria-label="미리보기 닫기" title="닫기">
                <X size={18} />
              </PreviewCloseButton>
            </PreviewHeader>

            <PreviewSummary>{previewApp.summary}</PreviewSummary>
            <PreviewDescription>{previewApp.description}</PreviewDescription>

            <PreviewGrid>
              <PreviewPanel>
                <PreviewPanelTitle>좌측 메뉴</PreviewPanelTitle>
                <PreviewMenuItem $color={previewApp.color}>
                  <PreviewMenuIcon $color={previewApp.color}>
                    <i className={`fa-solid fa-${previewApp.icon}`} aria-hidden="true" />
                  </PreviewMenuIcon>
                  <PreviewMenuCopy>
                    <strong>{previewApp.title}</strong>
                    <span>{previewApp.badge}</span>
                  </PreviewMenuCopy>
                  <PreviewMenuBadge>추가</PreviewMenuBadge>
                </PreviewMenuItem>
                <PreviewNote>등록 후 상단 순서 패널에서 좌측 메뉴 위치를 조정할 수 있습니다.</PreviewNote>
              </PreviewPanel>

              <PreviewPanel>
                <PreviewPanelTitle>{previewApp.widgetId ? '대시보드 위젯' : '프로그램 화면'}</PreviewPanelTitle>
                <PreviewWidgetCard $color={previewApp.color}>
                  <PreviewWidgetTop>
                    <span>{getStoreSurfaceLabel(previewApp)}</span>
                    <Check size={16} />
                  </PreviewWidgetTop>
                  <strong>{previewApp.shortTitle}</strong>
                  <p>{previewApp.summary}</p>
                </PreviewWidgetCard>
                <PreviewNote>
                  {previewApp.widgetId
                    ? 'propig 대시보드에서 표시 여부와 위젯 순서를 따로 관리합니다.'
                    : '등록 후 좌측 메뉴에서 바로 열고 사용할 수 있습니다.'}
                </PreviewNote>
              </PreviewPanel>
            </PreviewGrid>

            <PreviewChecklist>
              <li>
                <Check size={15} />
                개인 등록 목록에 저장
              </li>
              <li>
                <Check size={15} />
                {previewApp.widgetId ? '좌측 메뉴와 대시보드 위젯에 반영' : '좌측 메뉴에 프로그램 바로가기 반영'}
              </li>
              <li>
                <Check size={15} />
                언제든 상점에서 등록 해제 가능
              </li>
            </PreviewChecklist>

            <PreviewFooter>
              <PreviewCancelButton type="button" onClick={() => setPreviewAppId(null)}>
                닫기
              </PreviewCancelButton>
              <PreviewConfirmButton
                type="button"
                onClick={() => void handleConfirmRegistration(previewApp)}
                disabled={appRegistry.isInstalled(previewApp.id) || appRegistry.savingAppId === previewApp.id || appRegistry.isLoading}
              >
                {appRegistry.isInstalled(previewApp.id) ? (
                  <Check size={16} />
                ) : appRegistry.savingAppId === previewApp.id ? (
                  <SpinningLoader size={16} />
                ) : (
                  <Plus size={16} />
                )}
                {appRegistry.isInstalled(previewApp.id) ? '등록됨' : '등록하기'}
              </PreviewConfirmButton>
            </PreviewFooter>
          </PreviewDialog>
        </PreviewBackdrop>
      ) : null}
    </StoreShell>
  );
}

function renderStoreCard(
  app: PropigStoreApp,
  appRegistry: ReturnType<typeof usePropigAppRegistry>,
  handleStoreToggle: (app: PropigStoreApp) => Promise<void>,
  handlePreviewApp: (app: PropigStoreApp) => void,
) {
  const installed = appRegistry.isInstalled(app.id);
  const saving = appRegistry.savingAppId === app.id;
  const planned = app.status !== 'available';
  const widgetLabel = getStoreSurfaceLabel(app);

  return (
    <StoreCard key={app.id} $color={app.color} $disabled={planned}>
      <StoreCardHeader>
        <StoreAppIcon $color={app.color}>
          <i className={`fa-solid fa-${app.icon}`} aria-hidden="true" />
        </StoreAppIcon>
        <StoreCardTitle>
          <span>{app.badge}</span>
          <strong>{app.title}</strong>
        </StoreCardTitle>
        {installed ? <StoreInstalledBadge>등록됨</StoreInstalledBadge> : null}
      </StoreCardHeader>

      <StoreSummary>{app.summary}</StoreSummary>
      <StoreDescription>{app.description}</StoreDescription>

      <StoreMeta>
        <span>개인 등록</span>
        <span>{widgetLabel}</span>
        {planned ? <span>개발 예정</span> : null}
      </StoreMeta>

      <StoreCardActions>
        <StoreInstallButton
          type="button"
          $installed={installed}
          disabled={planned || saving || appRegistry.isLoading}
          aria-pressed={planned ? undefined : installed}
          onClick={() => void handleStoreToggle(app)}
        >
          {saving ? <SpinningLoader size={15} /> : installed ? <Check size={15} /> : <Plus size={15} />}
          {planned ? '준비중' : installed ? '해제' : '등록'}
        </StoreInstallButton>
        {!planned ? (
          <StorePreviewButton type="button" onClick={() => handlePreviewApp(app)}>
            <Eye size={15} />
            미리보기
          </StorePreviewButton>
        ) : null}
        {installed && app.path ? (
          <StoreOpenLink href={app.path}>
            <ArrowUpRight size={14} />
            열기
          </StoreOpenLink>
        ) : null}
      </StoreCardActions>
    </StoreCard>
  );
}

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

const StoreShell = styled.main`
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  --surface: #0e1715;
  --surface-soft: #17241f;
  --surface-hover: #1d3129;
  --border: #243831;
  --text: #eff8f1;
  --muted: #a4b4aa;
  --faint: #74847b;
  --accent: #42d392;
  --accent-soft: rgba(66, 211, 146, 0.14);
  --accent-border: rgba(66, 211, 146, 0.42);
  --warning: #f7c76d;
  background:
    linear-gradient(90deg, rgba(66, 211, 146, 0.1) 0 1px, transparent 1px 100%),
    linear-gradient(180deg, rgba(143, 184, 255, 0.07) 0 1px, transparent 1px 100%),
    linear-gradient(145deg, #07110e 0%, #091211 43%, #13150f 100%);
  background-size: 72px 72px, 72px 72px, auto;
  color: var(--text);
  overflow-y: auto;
  padding: clamp(16px, 3vw, 34px);

  @media (max-width: 720px) {
    padding: 18px 16px calc(30px + env(safe-area-inset-bottom));
  }
`;

const StoreHero = styled.header`
  align-items: flex-end;
  border-bottom: 1px solid rgba(66, 211, 146, 0.34);
  display: flex;
  gap: 18px;
  justify-content: space-between;
  margin: 0 auto 18px;
  max-width: 1240px;
  padding: 10px 0 18px;

  @media (max-width: 860px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const HeroCopy = styled.div`
  max-width: 680px;
  min-width: 0;
`;

const Eyebrow = styled.div`
  align-items: center;
  color: #c8f5db;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 950;
  gap: 8px;
  letter-spacing: 0;

  svg {
    color: var(--warning);
  }
`;

const HeroTitle = styled.h1`
  font-size: clamp(1.9rem, 4vw, 3rem);
  letter-spacing: 0;
  line-height: 1.05;
  margin: 8px 0 0;
`;

const HeroText = styled.p`
  color: var(--muted);
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.55;
  margin: 10px 0 0;
`;

const HeroActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;

  @media (max-width: 860px) {
    justify-content: flex-start;
  }
`;

const StoreStatus = styled.span`
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  color: #baf5d0;
  font-size: 0.82rem;
  font-weight: 900;
  padding: 9px 12px;
`;

const DashboardLink = styled(Link)`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  display: inline-flex;
  font-size: 0.86rem;
  font-weight: 950;
  gap: 7px;
  min-height: 40px;
  padding: 0 12px;
  text-decoration: none;

  &:hover {
    background: var(--surface-hover);
  }
`;

const LoginButton = styled.button`
  align-items: center;
  background: linear-gradient(135deg, #42d392, #2dd4bf);
  border: 0;
  border-radius: 8px;
  color: #06110d;
  cursor: pointer;
  display: inline-flex;
  font-weight: 900;
  gap: 7px;
  justify-content: center;
  min-height: 40px;
  padding: 0 14px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

const StoreOrderPanel = styled.section`
  background:
    linear-gradient(180deg, rgba(18, 31, 27, 0.88), rgba(8, 15, 14, 0.82)),
    linear-gradient(135deg, rgba(66, 211, 146, 0.12), rgba(96, 165, 250, 0.08));
  border: 1px solid rgba(66, 211, 146, 0.28);
  border-radius: 8px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24);
  display: grid;
  gap: 10px;
  margin: 0 auto 14px;
  max-width: 1240px;
  padding: 12px;
`;

const StoreOrderHead = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 12px;

  div {
    display: grid;
    gap: 2px;
  }

  strong {
    color: var(--text);
    font-size: 0.98rem;
    font-weight: 950;
  }

  span {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 850;
  }

  svg {
    color: var(--warning);
  }
`;

const StoreOrderList = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));

  @media (max-width: 1080px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const StoreOrderItem = styled.div<{ $color: string }>`
  align-items: center;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid ${({ $color }) => `${$color}4d`};
  border-left: 4px solid ${({ $color }) => $color};
  border-radius: 8px;
  display: grid;
  gap: 8px;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  min-height: 58px;
  padding: 8px;
`;

const StoreOrderRank = styled.span`
  color: var(--faint);
  font-size: 0.74rem;
  font-weight: 950;
  min-width: 18px;
  text-align: center;
`;

const StoreOrderIcon = styled.span<{ $color: string }>`
  align-items: center;
  background: ${({ $color }) => `${$color}1f`};
  border: 1px solid ${({ $color }) => `${$color}66`};
  border-radius: 8px;
  color: ${({ $color }) => $color};
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;
`;

const StoreOrderCopy = styled.span`
  display: grid;
  gap: 2px;
  min-width: 0;

  strong {
    color: var(--text);
    font-size: 0.88rem;
    font-weight: 950;
    overflow-wrap: anywhere;
  }

  span {
    color: var(--faint);
    font-size: 0.68rem;
    font-weight: 900;
  }
`;

const StoreOrderActions = styled.span`
  display: inline-flex;
  gap: 4px;
`;

const StoreOrderButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  height: 32px;
  justify-content: center;
  width: 32px;

  &:hover:not(:disabled) {
    background: var(--surface-hover);
  }

  &:disabled {
    color: var(--faint);
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StoreOrderEmpty = styled.p`
  border: 1px dashed rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: var(--muted);
  font-size: 0.86rem;
  font-weight: 850;
  margin: 0;
  padding: 12px;
`;

const StoreGrid = styled.section`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0 auto;
  max-width: 1240px;

  @media (max-width: 1080px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const StoreCard = styled.article<{ $color: string; $disabled: boolean }>`
  background:
    linear-gradient(180deg, rgba(18, 31, 27, 0.96), rgba(8, 15, 14, 0.94)),
    ${({ $color }) => `linear-gradient(135deg, ${$color}1f, transparent 52%)`};
  border: 1px solid ${({ $color }) => `${$color}4d`};
  border-radius: 8px;
  border-top: 4px solid ${({ $color }) => $color};
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
  display: grid;
  gap: 10px;
  min-height: 226px;
  opacity: ${({ $disabled }) => ($disabled ? 0.68 : 1)};
  padding: 14px;
`;

const StoreCardHeader = styled.div`
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
`;

const StoreAppIcon = styled.span<{ $color: string }>`
  align-items: center;
  background: ${({ $color }) => `${$color}1f`};
  border: 1px solid ${({ $color }) => `${$color}66`};
  border-radius: 8px;
  color: ${({ $color }) => $color};
  display: inline-flex;
  flex: 0 0 auto;
  height: 42px;
  justify-content: center;
  width: 42px;
`;

const StoreCardTitle = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;

  span {
    color: var(--faint);
    font-size: 0.68rem;
    font-weight: 950;
    line-height: 1;
  }

  strong {
    color: var(--text);
    font-size: 1.04rem;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
`;

const StoreInstalledBadge = styled.span`
  background: rgba(66, 211, 146, 0.16);
  border: 1px solid rgba(66, 211, 146, 0.44);
  border-radius: 999px;
  color: #baf5d0;
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 950;
  padding: 5px 8px;
`;

const StoreSummary = styled.p`
  color: var(--text);
  font-size: 0.91rem;
  font-weight: 900;
  line-height: 1.35;
  margin: 0;
`;

const StoreDescription = styled.p`
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 750;
  line-height: 1.45;
  margin: 0;
`;

const StoreMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span {
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 900;
    padding: 5px 8px;
  }
`;

const StoreCardActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
`;

const StoreInstallButton = styled.button<{ $installed: boolean }>`
  align-items: center;
  background: ${({ $installed }) => ($installed ? 'var(--accent-soft)' : 'var(--accent)')};
  border: 1px solid ${({ $installed }) => ($installed ? 'var(--accent-border)' : 'var(--accent)')};
  border-radius: 8px;
  color: ${({ $installed }) => ($installed ? '#baf5d0' : '#06110d')};
  cursor: pointer;
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 950;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;

  &:disabled {
    background: var(--surface-soft);
    border-color: var(--border);
    color: var(--faint);
    cursor: not-allowed;
  }
`;

const StorePreviewButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 950;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;

  &:hover {
    background: var(--surface-hover);
  }
`;

const StoreOpenLink = styled(Link)`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 950;
  gap: 6px;
  min-height: 36px;
  padding: 0 11px;
  text-decoration: none;

  &:hover {
    background: var(--surface-hover);
  }
`;

const ErrorText = styled.p`
  color: #ffb4b4;
  font-size: 0.86rem;
  font-weight: 800;
  margin: 14px auto 0;
  max-width: 1240px;
`;

const PreviewBackdrop = styled.div`
  align-items: center;
  background: rgba(3, 8, 7, 0.74);
  backdrop-filter: blur(14px);
  display: flex;
  inset: 0;
  justify-content: center;
  overflow-y: auto;
  padding: 18px;
  position: fixed;
  z-index: 80;
`;

const PreviewDialog = styled.div`
  background:
    linear-gradient(180deg, rgba(18, 31, 27, 0.98), rgba(7, 14, 12, 0.98)),
    linear-gradient(135deg, rgba(66, 211, 146, 0.12), rgba(96, 165, 250, 0.08));
  border: 1px solid rgba(66, 211, 146, 0.34);
  border-radius: 8px;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.52);
  display: grid;
  gap: 12px;
  max-height: calc(100vh - 36px);
  max-width: 820px;
  overflow-y: auto;
  padding: clamp(16px, 2.4vw, 22px);
  width: 100%;
`;

const PreviewHeader = styled.div`
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr) auto;
`;

const PreviewHeading = styled.div`
  display: grid;
  gap: 3px;
  min-width: 0;

  span {
    color: var(--warning);
    font-size: 0.72rem;
    font-weight: 950;
  }

  strong {
    color: var(--text);
    font-size: clamp(1.24rem, 3vw, 1.7rem);
    line-height: 1.14;
    overflow-wrap: anywhere;
  }
`;

const PreviewCloseButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  height: 38px;
  justify-content: center;
  width: 38px;

  &:hover {
    background: var(--surface-hover);
  }
`;

const PreviewSummary = styled.p`
  color: var(--text);
  font-size: 1rem;
  font-weight: 950;
  line-height: 1.4;
  margin: 0;
`;

const PreviewDescription = styled.p`
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 800;
  line-height: 1.48;
  margin: 0;
`;

const PreviewGrid = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const PreviewPanel = styled.div`
  background: rgba(255, 255, 255, 0.048);
  border: 1px solid rgba(255, 255, 255, 0.095);
  border-radius: 8px;
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px;
`;

const PreviewPanelTitle = styled.strong`
  color: #dff8e8;
  font-size: 0.86rem;
  font-weight: 950;
`;

const PreviewMenuItem = styled.div<{ $color: string }>`
  align-items: center;
  background: linear-gradient(180deg, rgba(23, 36, 31, 0.96), rgba(12, 21, 17, 0.96));
  border: 1px solid ${({ $color }) => `${$color}66`};
  border-left: 4px solid ${({ $color }) => $color};
  border-radius: 8px;
  display: grid;
  gap: 9px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 58px;
  padding: 9px;
`;

const PreviewMenuIcon = styled.span<{ $color: string }>`
  align-items: center;
  background: ${({ $color }) => `${$color}1f`};
  border: 1px solid ${({ $color }) => `${$color}66`};
  border-radius: 8px;
  color: ${({ $color }) => $color};
  display: inline-flex;
  height: 36px;
  justify-content: center;
  width: 36px;
`;

const PreviewMenuCopy = styled.span`
  display: grid;
  gap: 2px;
  min-width: 0;

  strong {
    color: var(--text);
    font-size: 0.9rem;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  span {
    color: var(--faint);
    font-size: 0.68rem;
    font-weight: 950;
  }
`;

const PreviewMenuBadge = styled.span`
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  color: #baf5d0;
  font-size: 0.72rem;
  font-weight: 950;
  padding: 5px 8px;
`;

const PreviewWidgetCard = styled.div<{ $color: string }>`
  background:
    linear-gradient(180deg, rgba(10, 20, 17, 0.96), rgba(7, 14, 12, 0.96)),
    ${({ $color }) => `linear-gradient(135deg, ${$color}26, transparent 58%)`};
  border: 1px solid ${({ $color }) => `${$color}66`};
  border-top: 4px solid ${({ $color }) => $color};
  border-radius: 8px;
  display: grid;
  gap: 8px;
  min-height: 126px;
  padding: 12px;

  strong {
    color: var(--text);
    font-size: 1.06rem;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  p {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 800;
    line-height: 1.42;
    margin: 0;
  }
`;

const PreviewWidgetTop = styled.div`
  align-items: center;
  color: var(--warning);
  display: flex;
  gap: 8px;
  justify-content: space-between;

  span {
    color: var(--warning);
    font-size: 0.72rem;
    font-weight: 950;
  }

  svg {
    color: var(--accent);
  }
`;

const PreviewNote = styled.p`
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1.42;
  margin: 0;
`;

const PreviewChecklist = styled.ul`
  display: grid;
  gap: 7px;
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    align-items: center;
    color: var(--muted);
    display: flex;
    font-size: 0.82rem;
    font-weight: 850;
    gap: 8px;
    line-height: 1.35;
  }

  svg {
    color: var(--accent);
    flex: 0 0 auto;
  }
`;

const PreviewFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 2px;

  @media (max-width: 520px) {
    display: grid;
    grid-template-columns: 1fr;
  }
`;

const PreviewCancelButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.86rem;
  font-weight: 950;
  justify-content: center;
  min-height: 40px;
  padding: 0 14px;

  &:hover {
    background: var(--surface-hover);
  }
`;

const PreviewConfirmButton = styled.button`
  align-items: center;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 8px;
  color: #06110d;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.86rem;
  font-weight: 950;
  gap: 7px;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;

  &:disabled {
    background: var(--surface-soft);
    border-color: var(--border);
    color: var(--faint);
    cursor: not-allowed;
  }
`;

const SpinningLoader = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;
