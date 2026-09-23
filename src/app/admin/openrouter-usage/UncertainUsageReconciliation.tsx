'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ReceiptText,
  ShieldAlert,
  X,
} from 'lucide-react';
import styled from 'styled-components';

export type UsageOperation = 'text' | 'image' | 'video';

export type UncertainUsageRecord = {
  id: string;
  operation: UsageOperation;
  model: string | null;
  estimatedCostUsd: number | null;
  reservedCostUsd: number | null;
  day: string | null;
  reservedAt: string | null;
  updatedAt: string | null;
  jobId: string | null;
  projectId: string | null;
  stage: string | null;
  requestId: string | null;
  provider: string | null;
};

export type UncertainResolutionInput = {
  operationId: string;
  decision: 'charged' | 'not_charged';
  actualCostUsd?: number;
  note?: string;
};

type Props = {
  summary: {
    count: number;
    reservedCostUsd: number;
  };
  items: UncertainUsageRecord[];
  truncated: boolean;
  onResolve: (input: UncertainResolutionInput) => Promise<void>;
};

type DialogSelection = {
  item: UncertainUsageRecord;
  decision: UncertainResolutionInput['decision'];
};

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const formatUsd = (value: number | null) => typeof value === 'number' && Number.isFinite(value) ? USD_FORMATTER.format(value) : '금액 미기록';

const formatTimestamp = (value: string | null, fallbackDay: string | null) => {
  if (!value) return fallbackDay ? `${fallbackDay} 기록` : '시각 미기록';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? (fallbackDay ? `${fallbackDay} 기록` : '시각 미기록') : DATE_TIME_FORMATTER.format(parsed);
};

const operationLabel = (operation: UsageOperation) => {
  if (operation === 'image') return '이미지';
  if (operation === 'video') return '영상';
  return '텍스트';
};

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message.trim()
    ? error.message
    : '정산을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function UncertainUsageReconciliation({ summary, items, truncated, onResolve }: Props) {
  const [selection, setSelection] = useState<DialogSelection | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const visibleCount = summary.count.toLocaleString('ko-KR');

  const openDialog = useCallback((
    item: UncertainUsageRecord,
    decision: UncertainResolutionInput['decision'],
    trigger: HTMLButtonElement,
  ) => {
    triggerRef.current = trigger;
    setSelection({ item, decision });
  }, []);

  const closeDialog = useCallback(() => {
    const focusTarget = triggerRef.current?.isConnected ? triggerRef.current : sectionRef.current;
    setSelection(null);
    window.requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
  }, []);

  return (
    <ReconciliationGroup aria-labelledby="uncertain-usage-title">
      {summary.count > 0 ? (
        <ReservationAlert>
          <AlertIcon aria-hidden="true"><AlertTriangle size={20} /></AlertIcon>
          <ReservationCopy role="status" aria-live="polite" aria-atomic="true">
            <strong>{visibleCount}{truncated ? '건 이상의' : '건의'} 비용 확인이 필요합니다</strong>
            <span>
              {truncated
                ? `표시된 미확정 항목에 ${formatUsd(summary.reservedCostUsd)}가 보수적으로 반영되어 있습니다.`
                : `응답이 불명확한 이미지 비용 ${formatUsd(summary.reservedCostUsd)}가 예산에 보수적으로 반영되어 있습니다.`}
              Activity 기록과 대조한 뒤 정산하세요.
            </span>
          </ReservationCopy>
          <ActivityLink
            href="https://openrouter.ai/activity"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="OpenRouter Activity 새 탭에서 열기"
          >
            OpenRouter Activity
            <ExternalLink size={15} aria-hidden="true" />
          </ActivityLink>
        </ReservationAlert>
      ) : null}

      <ReconciliationCard ref={sectionRef} tabIndex={-1}>
        <SectionHeader>
          <div>
            <SectionTitle id="uncertain-usage-title">불확실 비용 정산</SectionTitle>
            <SectionHint>선택 계정의 이미지 미확정 비용입니다. 정산은 내부 원장 조정이며 환불이나 생성 재시도가 아닙니다.</SectionHint>
          </div>
          <SectionHeaderActions>
            {summary.count > 0 ? (
              <ReservedBadge aria-label={`미확정 비용 ${truncated ? '표시분 ' : ''}${formatUsd(summary.reservedCostUsd)}`}>
                {visibleCount}{truncated ? '건 이상' : '건'} · {truncated ? '표시분 ' : ''}{formatUsd(summary.reservedCostUsd)}
              </ReservedBadge>
            ) : null}
            <SectionActivityLink
              href="https://openrouter.ai/activity"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="OpenRouter Activity 새 탭에서 열기"
            >
              Activity 확인
              <ExternalLink size={14} aria-hidden="true" />
            </SectionActivityLink>
          </SectionHeaderActions>
        </SectionHeader>

        {truncated ? (
          <TruncatedNotice role="status">
            보류 내역이 많아 일부만 표시합니다. 표시된 항목을 정산한 뒤 목록을 새로고침하세요.
          </TruncatedNotice>
        ) : null}

        {items.length === 0 ? (
          <EmptyState>
            <EmptyIcon aria-hidden="true"><CheckCircle2 size={22} /></EmptyIcon>
            <div>
              <strong>확인이 필요한 미확정 비용이 없습니다</strong>
              <span>불확실한 호출이 생기면 이곳에서 Activity 기록과 대조할 수 있습니다.</span>
            </div>
          </EmptyState>
        ) : (
          <UncertainList aria-label="불확실 비용 목록">
            {items.map((item) => (
              <UncertainRow key={item.id}>
                <RowIdentity>
                  <OperationBadge $operation={item.operation}>{operationLabel(item.operation)}</OperationBadge>
                  <ModelName title={item.model ?? undefined} translate="no">{item.model || '모델 미기록'}</ModelName>
                  <TimeText>{formatTimestamp(item.reservedAt ?? item.updatedAt, item.day)}</TimeText>
                </RowIdentity>

                <Facts>
                  <Fact>
                    <dt>단계</dt>
                    <dd><Identifier translate="no">{item.stage || '미기록'}</Identifier></dd>
                  </Fact>
                  <Fact>
                    <dt>작업 ID</dt>
                    <dd><Identifier title={item.jobId || undefined} translate="no">{item.jobId || '없음'}</Identifier></dd>
                  </Fact>
                  <Fact>
                    <dt>요청 ID</dt>
                    <dd><Identifier title={item.requestId || undefined} translate="no">{item.requestId || '없음'}</Identifier></dd>
                  </Fact>
                  <Fact>
                    <dt>프로젝트</dt>
                    <dd><Identifier title={item.projectId || undefined} translate="no">{item.projectId || '없음'}</Identifier></dd>
                  </Fact>
                  <Fact>
                    <dt>공급자</dt>
                    <dd><Identifier translate="no">{item.provider || 'openrouter'}</Identifier></dd>
                  </Fact>
                </Facts>

                <CostAndActions>
                  <CostBlock>
                    <span>미확정 반영액</span>
                    <strong>{formatUsd(item.reservedCostUsd)}</strong>
                    {item.estimatedCostUsd !== item.reservedCostUsd ? (
                      <small>예상 {formatUsd(item.estimatedCostUsd)}</small>
                    ) : null}
                  </CostBlock>
                  <RowActions>
                    <ResolveButton
                      type="button"
                      $tone="charged"
                      onClick={(event) => openDialog(item, 'charged', event.currentTarget)}
                    >
                      과금 확인
                    </ResolveButton>
                    <ResolveButton
                      type="button"
                      $tone="released"
                      onClick={(event) => openDialog(item, 'not_charged', event.currentTarget)}
                    >
                      미과금 정산
                    </ResolveButton>
                  </RowActions>
                </CostAndActions>
              </UncertainRow>
            ))}
          </UncertainList>
        )}
      </ReconciliationCard>

      {selection ? (
        <ResolutionDialog selection={selection} onResolve={onResolve} onClose={closeDialog} />
      ) : null}
    </ReconciliationGroup>
  );
}

function ResolutionDialog({
  selection,
  onResolve,
  onClose,
}: {
  selection: DialogSelection;
  onResolve: Props['onResolve'];
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const actualCostRef = useRef<HTMLInputElement | null>(null);
  const successButtonRef = useRef<HTMLButtonElement | null>(null);
  const isSubmittingRef = useRef(false);
  const [actualCost, setActualCost] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const isCharged = selection.decision === 'charged';
  const isSubmitting = status === 'submitting';

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    if (status !== 'success') return;
    const focusFrame = window.requestAnimationFrame(() => successButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [status]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const firstTarget = isCharged
        ? actualCostRef.current
        : dialogRef.current?.querySelector<HTMLButtonElement>('[data-primary-action="true"]');
      firstTarget?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
        ),
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCharged, onClose]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingRef.current || isSubmitting || status === 'success') return;

    let parsedActualCost: number | undefined;
    if (isCharged) {
      const trimmedCost = actualCost.trim();
      parsedActualCost = Number(trimmedCost);
      if (!trimmedCost || !Number.isFinite(parsedActualCost) || parsedActualCost < 0 || parsedActualCost > 100) {
        setError('실제 과금액을 0~100 USD 범위로 입력해 주세요.');
        actualCostRef.current?.focus();
        return;
      }
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length < 10) { setError('공급자 기록과 대조한 확인 근거를 10자 이상 입력해 주세요.'); return; }
    isSubmittingRef.current = true;
    setError(null);
    setStatus('submitting');
    try {
      await onResolve({
        operationId: selection.item.id,
        decision: selection.decision,
        ...(parsedActualCost !== undefined ? { actualCostUsd: parsedActualCost } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      setStatus('success');
    } catch (resolutionError) {
      isSubmittingRef.current = false;
      setError(errorMessage(resolutionError));
      setStatus('idle');
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSubmitting) onClose();
  };

  return (
    <DialogBackdrop onClick={handleBackdropClick}>
      <DialogPanel
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={isSubmitting}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <DialogHeader>
          <DialogHeading>
            <DialogIcon $tone={isCharged ? 'charged' : 'released'} aria-hidden="true">
              {isCharged ? <ReceiptText size={20} /> : <ShieldAlert size={20} />}
            </DialogIcon>
            <div>
              <h2 id={titleId}>{isCharged ? '과금 내역 확정' : '미과금 원장 정산'}</h2>
              <p translate="no">{selection.item.model || '모델 미기록'}</p>
            </div>
          </DialogHeading>
          <CloseButton type="button" onClick={onClose} disabled={isSubmitting} aria-label="정산 대화상자 닫기">
            <X size={19} aria-hidden="true" />
          </CloseButton>
        </DialogHeader>

        <DialogDescription id={descriptionId} $warning={!isCharged}>
          {isCharged
            ? 'OpenRouter Activity와 대조한 금액을 입력하세요. 관리자 확인 기록에 따라 내부 이미지 예산을 조정하며 공급자 청구서나 환불은 변경하지 않습니다.'
            : 'Activity에 과금이 없을 때만 해제하세요. 실제로 과금된 호출을 해제하면 비용이 누락되고 같은 예산을 다시 사용해 중복 과금될 수 있습니다.'}
        </DialogDescription>

        {status === 'success' ? (
          <SuccessPanel role="status" aria-live="polite">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div>
              <strong>정산을 반영했습니다</strong>
              <span>원장 저장을 확인했습니다. 화면 안내에 따라 최신 예산을 확인하세요.</span>
            </div>
            <DialogButton ref={successButtonRef} type="button" $tone="primary" onClick={onClose}>닫기</DialogButton>
          </SuccessPanel>
        ) : (
          <DialogForm onSubmit={handleSubmit} noValidate>
            {isCharged ? (
              <FieldGroup>
                <label htmlFor={`${titleId}-actual-cost`}>실제 과금액 (USD) <RequiredText>필수</RequiredText></label>
                <InputShell>
                  <CurrencyPrefix aria-hidden="true">$</CurrencyPrefix>
                  <CostInput
                    ref={actualCostRef}
                    id={`${titleId}-actual-cost`}
                    name="actualCostUsd"
                    type="number"
                    inputMode="decimal"
                    autoComplete="off"
                    min="0"
                    max="100"
                    step="0.000001"
                    readOnly={isSubmitting}
                    value={actualCost}
                    onChange={(event) => {
                      setActualCost(event.target.value);
                      setError(null);
                    }}
                    placeholder="예: 0.0125…"
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${titleId}-form-error` : undefined}
                  />
                </InputShell>
                <FieldHelp>OpenRouter Activity의 금액을 그대로 입력하세요. 입력 가능 범위는 0~100 USD입니다.</FieldHelp>
              </FieldGroup>
            ) : null}

            <FieldGroup>
              <LabelRow>
                <label htmlFor={`${titleId}-note`}>확인 근거 <OptionalText>필수 · 10자 이상</OptionalText></label>
                <CharacterCount>{note.length}/300</CharacterCount>
              </LabelRow>
              <NoteInput
                id={`${titleId}-note`}
                name="note"
                autoComplete="off"
                maxLength={300}
                rows={3}
                readOnly={isSubmitting}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="확인 근거나 Activity 요청 ID를 남겨 주세요…"
              />
            </FieldGroup>

            <DialogStatus aria-live="polite" aria-atomic="true">
              {isSubmitting ? '정산을 처리하는 중입니다…' : null}
              {error ? <FormError id={`${titleId}-form-error`} role="alert">{error}</FormError> : null}
            </DialogStatus>

            <DialogActions>
              <DialogButton type="button" $tone="secondary" onClick={onClose} disabled={isSubmitting}>
                취소
              </DialogButton>
              <DialogButton
                type="submit"
                $tone={isCharged ? 'primary' : 'warning'}
                disabled={isSubmitting}
                data-primary-action="true"
              >
                {isSubmitting ? '처리 중…' : isCharged ? '과금으로 확정' : '미과금으로 정산'}
              </DialogButton>
            </DialogActions>
          </DialogForm>
        )}
      </DialogPanel>
    </DialogBackdrop>
  );
}

const ReconciliationGroup = styled.section`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ReservationAlert = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 9px;

  @media (max-width: 720px) {
    grid-template-columns: auto minmax(0, 1fr);
  }
`;

const AlertIcon = styled.span`
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.14);
  border-radius: 8px;
`;

const ReservationCopy = styled.span`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  strong { color: #fef3c7; font-size: 0.88rem; }
  span { color: #fcd98c; font-size: 0.78rem; line-height: 1.45; }
`;

const ActivityLink = styled.a`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 11px;
  color: #fef3c7;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 7px;
  font-size: 0.78rem;
  font-weight: 800;
  text-decoration: none;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease;

  &:hover { background: rgba(245, 158, 11, 0.16); border-color: rgba(245, 158, 11, 0.45); }
  &:focus-visible { outline: 3px solid rgba(245, 158, 11, 0.32); outline-offset: 2px; }

  @media (max-width: 720px) { grid-column: 1 / -1; width: 100%; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const ReconciliationCard = styled.section`
  min-width: 0;
  padding: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 9px;

  &:focus-visible { outline: 3px solid rgba(96, 165, 250, 0.28); outline-offset: 3px; }

  @media (max-width: 620px) { padding: 14px; }
`;

const SectionHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;

  @media (max-width: 620px) { flex-direction: column; }
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: var(--text-main);
  font-size: 1rem;
  line-height: 1.3;
  text-wrap: balance;
`;

const SectionHeaderActions = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;

  @media (max-width: 620px) { width: 100%; justify-content: space-between; }
  @media (max-width: 420px) { align-items: stretch; flex-direction: column; }
`;

const SectionActivityLink = styled.a`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 10px;
  color: #bfdbfe;
  background: rgba(59, 130, 246, 0.07);
  border: 1px solid rgba(96, 165, 250, 0.22);
  border-radius: 7px;
  font-size: 0.74rem;
  font-weight: 800;
  text-decoration: none;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease;

  &:hover { background: rgba(59, 130, 246, 0.13); border-color: rgba(96, 165, 250, 0.38); }
  &:focus-visible { outline: 3px solid rgba(96, 165, 250, 0.3); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const SectionHint = styled.p`
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 0.77rem;
  line-height: 1.45;
`;

const ReservedBadge = styled.span`
  flex: 0 0 auto;
  padding: 6px 9px;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.11);
  border: 1px solid rgba(245, 158, 11, 0.24);
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 850;
  font-variant-numeric: tabular-nums;
`;

const TruncatedNotice = styled.p`
  margin: 0 0 12px;
  padding: 10px 12px;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.08);
  border-radius: 7px;
  font-size: 0.78rem;
  line-height: 1.45;
`;

const EmptyState = styled.div`
  min-height: 118px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 22px;
  color: var(--text-muted);
  background: rgba(16, 185, 129, 0.035);
  border: 1px dashed rgba(16, 185, 129, 0.25);
  border-radius: 8px;

  div { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  strong { color: var(--text-main); font-size: 0.87rem; }
  span { font-size: 0.77rem; line-height: 1.45; }

  @media (max-width: 480px) { align-items: flex-start; justify-content: flex-start; padding: 17px; }
`;

const EmptyIcon = styled.span`
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.12);
  border-radius: 8px;
`;

const UncertainList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const UncertainRow = styled.article`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(360px, 1.7fr) auto;
  align-items: center;
  gap: 14px;
  padding: 13px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  content-visibility: auto;
  contain-intrinsic-size: 148px;

  @media (max-width: 1060px) { grid-template-columns: minmax(180px, 0.8fr) minmax(0, 1.2fr); }
  @media (max-width: 680px) { grid-template-columns: minmax(0, 1fr); gap: 12px; }
`;

const RowIdentity = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 6px 8px;
`;

const OperationBadge = styled.span<{ $operation: UsageOperation }>`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 7px;
  color: ${({ $operation }) => ($operation === 'text' ? '#bfdbfe' : $operation === 'image' ? '#fbcfe8' : '#ddd6fe')};
  background: ${({ $operation }) => ($operation === 'text' ? 'rgba(59,130,246,.12)' : $operation === 'image' ? 'rgba(236,72,153,.12)' : 'rgba(139,92,246,.12)')};
  border-radius: 5px;
  font-size: 0.7rem;
  font-weight: 850;
`;

const ModelName = styled.strong`
  min-width: 0;
  overflow: hidden;
  color: var(--text-main);
  font-size: 0.79rem;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TimeText = styled.span`
  grid-column: 1 / -1;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
`;

const Facts = styled.dl`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0;

  @media (max-width: 1180px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 430px) { grid-template-columns: minmax(0, 1fr); }
`;

const Fact = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  dt { color: var(--text-muted); font-size: 0.66rem; font-weight: 750; }
  dd { min-width: 0; margin: 0; }
`;

const Identifier = styled.code`
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #dbe7f3;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.69rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 430px) { overflow-wrap: anywhere; white-space: normal; }
`;

const CostAndActions = styled.div`
  min-width: 184px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;

  @media (max-width: 1060px) { grid-column: 1 / -1; flex-direction: row; align-items: center; justify-content: space-between; }
  @media (max-width: 560px) { min-width: 0; flex-direction: column; align-items: stretch; }
`;

const CostBlock = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-variant-numeric: tabular-nums;

  span, small { color: var(--text-muted); font-size: 0.67rem; }
  strong { color: #fde68a; font-size: 0.86rem; }

  @media (max-width: 560px) { align-items: flex-start; }
`;

const RowActions = styled.div`
  display: flex;
  gap: 6px;

  @media (max-width: 560px) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const ResolveButton = styled.button<{ $tone: 'charged' | 'released' }>`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 10px;
  border: 1px solid ${({ $tone }) => ($tone === 'charged' ? 'rgba(16,185,129,.32)' : 'rgba(245,158,11,.3)')};
  border-radius: 7px;
  background: ${({ $tone }) => ($tone === 'charged' ? 'rgba(16,185,129,.1)' : 'rgba(245,158,11,.08)')};
  color: ${({ $tone }) => ($tone === 'charged' ? '#a7f3d0' : '#fde68a')};
  font-size: 0.74rem;
  font-weight: 850;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease;

  &:hover { background: ${({ $tone }) => ($tone === 'charged' ? 'rgba(16,185,129,.17)' : 'rgba(245,158,11,.15)')}; }
  &:focus-visible { outline: 3px solid rgba(96,165,250,.32); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const DialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(2, 8, 18, 0.72);
  overscroll-behavior: contain;
`;

const DialogPanel = styled.div`
  width: min(520px, 100%);
  max-height: min(720px, calc(100dvh - 32px));
  overflow: auto;
  overscroll-behavior: contain;
  padding: 20px;
  color: var(--text-main);
  background: #101925;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 11px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.46);

  @media (max-width: 480px) { padding: 16px; border-radius: 9px; }
`;

const DialogHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const DialogHeading = styled.div`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;

  div { min-width: 0; }
  h2 { margin: 0; color: var(--text-main); font-size: 1.05rem; line-height: 1.35; text-wrap: balance; }
  p { margin: 4px 0 0; overflow: hidden; color: var(--text-muted); font-size: 0.72rem; text-overflow: ellipsis; white-space: nowrap; }
`;

const DialogIcon = styled.span<{ $tone: 'charged' | 'released' }>`
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ $tone }) => ($tone === 'charged' ? '#6ee7b7' : '#fbbf24')};
  background: ${({ $tone }) => ($tone === 'charged' ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.12)')};
  border-radius: 8px;
`;

const CloseButton = styled.button`
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  touch-action: manipulation;

  &:hover:not(:disabled) { color: var(--text-main); background: rgba(255,255,255,.06); }
  &:focus-visible { outline: 3px solid rgba(96,165,250,.32); outline-offset: 2px; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DialogDescription = styled.p<{ $warning: boolean }>`
  margin: 15px 0;
  padding: 11px 12px;
  color: ${({ $warning }) => ($warning ? '#fde68a' : '#cbd5e1')};
  background: ${({ $warning }) => ($warning ? 'rgba(245,158,11,.09)' : 'rgba(96,165,250,.07)')};
  border-left: 3px solid ${({ $warning }) => ($warning ? '#f59e0b' : '#60a5fa')};
  border-radius: 6px;
  font-size: 0.8rem;
  line-height: 1.55;
`;

const DialogForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;

  label { color: var(--text-main); font-size: 0.79rem; font-weight: 800; }
`;

const RequiredText = styled.span`
  margin-left: 4px;
  color: #fca5a5;
  font-size: 0.68rem;
`;

const OptionalText = styled.span`
  margin-left: 4px;
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 600;
`;

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const CharacterCount = styled.span`
  color: var(--text-muted);
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
`;

const InputShell = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  border: 1px solid var(--border-medium);
  border-radius: 7px;
  background: rgba(2, 8, 18, 0.45);

  &:focus-within { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(96,165,250,.18); }
`;

const CurrencyPrefix = styled.span`
  padding-left: 12px;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 800;
`;

const CostInput = styled.input`
  min-width: 0;
  min-height: 44px;
  padding: 9px 12px 9px 7px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-main);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;

  &::placeholder { color: #64748b; }
  &:read-only { opacity: 0.72; cursor: wait; }
`;

const NoteInput = styled.textarea`
  width: 100%;
  min-height: 88px;
  resize: vertical;
  padding: 10px 11px;
  border: 1px solid var(--border-medium);
  border-radius: 7px;
  outline: 0;
  background: rgba(2, 8, 18, 0.45);
  color: var(--text-main);
  font: inherit;
  font-size: 0.82rem;
  line-height: 1.45;

  &::placeholder { color: #64748b; }
  &:focus-visible { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(96,165,250,.18); }
  &:read-only { opacity: 0.72; cursor: wait; }
`;

const FieldHelp = styled.span`
  color: var(--text-muted);
  font-size: 0.69rem;
  line-height: 1.4;
`;

const DialogStatus = styled.div`
  min-height: 20px;
  color: #bfdbfe;
  font-size: 0.76rem;
  line-height: 1.45;
`;

const FormError = styled.span`
  color: #fca5a5;
`;

const DialogActions = styled.footer`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  @media (max-width: 440px) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const DialogButton = styled.button<{ $tone: 'primary' | 'secondary' | 'warning' }>`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 14px;
  border: 1px solid ${({ $tone }) => ($tone === 'primary' ? 'rgba(16,185,129,.4)' : $tone === 'warning' ? 'rgba(245,158,11,.4)' : 'var(--border-medium)')};
  border-radius: 7px;
  background: ${({ $tone }) => ($tone === 'primary' ? 'var(--primary)' : $tone === 'warning' ? '#f59e0b' : 'rgba(255,255,255,.035)')};
  color: ${({ $tone }) => ($tone === 'secondary' ? 'var(--text-main)' : '#07110d')};
  font-size: 0.8rem;
  font-weight: 850;
  cursor: pointer;
  touch-action: manipulation;
  transition: filter 120ms ease, background-color 120ms ease;

  &:hover:not(:disabled) { filter: brightness(1.07); }
  &:focus-visible { outline: 3px solid rgba(96,165,250,.34); outline-offset: 2px; }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const SuccessPanel = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 13px;
  color: #a7f3d0;
  background: rgba(16,185,129,.09);
  border: 1px solid rgba(16,185,129,.24);
  border-radius: 8px;

  div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  strong { color: #d1fae5; font-size: 0.84rem; }
  span { color: #a7f3d0; font-size: 0.73rem; }

  @media (max-width: 440px) {
    grid-template-columns: auto minmax(0, 1fr);
    button { grid-column: 1 / -1; width: 100%; }
  }
`;
