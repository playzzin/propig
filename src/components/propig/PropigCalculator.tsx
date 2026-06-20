'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, ClipboardCopy, Copy, Divide, Equal, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import styled, { keyframes } from 'styled-components';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { db, ensureFirestorePersistence } from '@/firebase/config';

interface CalculationRecord {
  id: string;
  expression: string;
  result: string;
  createdAt: number;
}

interface CalculatorData {
  version: 1;
  expression: string;
  lastCalculation: CalculationRecord | null;
  savedRecords: CalculationRecord[];
}

const MAX_EXPRESSION_LENGTH = 140;
const MAX_SAVED_RECORDS = 60;
const LOCAL_STORAGE_KEY_PREFIX = 'propig:calculator';

const EMPTY_CALCULATOR_DATA: CalculatorData = {
  version: 1,
  expression: '0',
  lastCalculation: null,
  savedRecords: [],
};

const NUMBER_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'] as const;

function createRecordId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function getStorageKey(uid: string | null | undefined): string {
  return `${LOCAL_STORAGE_KEY_PREFIX}:${uid ?? 'guest'}:v1`;
}

function createCalculatorRef(uid: string) {
  return doc(db, 'users', uid, 'propigCalculator', 'workspace');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCalculationRecord(value: unknown): CalculationRecord | null {
  if (!isPlainRecord(value)) return null;
  if (typeof value.expression !== 'string' || typeof value.result !== 'string') return null;

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : createRecordId(),
    expression: normalizeDisplayExpression(value.expression),
    result: value.result.trim().slice(0, 80) || '0',
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
  };
}

function normalizeCalculatorData(value: unknown): CalculatorData {
  if (!isPlainRecord(value)) return EMPTY_CALCULATOR_DATA;

  const expression = typeof value.expression === 'string' ? normalizeDisplayExpression(value.expression) : '0';
  const savedRecords = Array.isArray(value.savedRecords)
    ? value.savedRecords
        .map(normalizeCalculationRecord)
        .filter((record): record is CalculationRecord => Boolean(record))
        .slice(0, MAX_SAVED_RECORDS)
    : [];

  return {
    version: 1,
    expression: expression.trim() || '0',
    lastCalculation: normalizeCalculationRecord(value.lastCalculation),
    savedRecords,
  };
}

function readLocalData(storageKey: string): CalculatorData {
  if (typeof window === 'undefined') return EMPTY_CALCULATOR_DATA;

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? normalizeCalculatorData(JSON.parse(raw)) : EMPTY_CALCULATOR_DATA;
  } catch {
    return EMPTY_CALCULATOR_DATA;
  }
}

function writeLocalData(storageKey: string, data: CalculatorData): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    toast.error('계산기 저장 공간이 부족합니다.', { duration: 2400 });
  }
}

function normalizeDisplayExpression(value: string): string {
  return value
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/-/g, '−')
    .replace(/[^\d+−×÷().%\s]/g, '')
    .slice(0, MAX_EXPRESSION_LENGTH);
}

function normalizeExpressionForParser(expression: string): string {
  return expression
    .replace(/[,\s]/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');
}

class CalculatorExpressionParser {
  private cursor = 0;

  constructor(private readonly input: string) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipSpaces();

    if (this.cursor < this.input.length) {
      throw new Error('지원하지 않는 기호가 있습니다.');
    }

    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();

    while (true) {
      if (this.match('+')) {
        value += this.parseTerm();
        continue;
      }

      if (this.match('-')) {
        value -= this.parseTerm();
        continue;
      }

      return value;
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();

    while (true) {
      if (this.match('*')) {
        value *= this.parseFactor();
        continue;
      }

      if (this.match('/')) {
        const divisor = this.parseFactor();
        if (divisor === 0) {
          throw new Error('0으로 나눌 수 없습니다.');
        }
        value /= divisor;
        continue;
      }

      return value;
    }
  }

  private parseFactor(): number {
    this.skipSpaces();

    if (this.match('+')) return this.parseFactor();
    if (this.match('-')) return -this.parseFactor();

    if (this.match('(')) {
      const value = this.parseExpression();
      if (!this.match(')')) {
        throw new Error('괄호를 닫아주세요.');
      }
      return this.consumePercent(value);
    }

    return this.consumePercent(this.parseNumber());
  }

  private parseNumber(): number {
    this.skipSpaces();
    const start = this.cursor;
    let hasDecimal = false;

    while (this.cursor < this.input.length) {
      const char = this.input[this.cursor];

      if (char === '.') {
        if (hasDecimal) break;
        hasDecimal = true;
        this.cursor += 1;
        continue;
      }

      if (!/\d/.test(char)) break;
      this.cursor += 1;
    }

    const raw = this.input.slice(start, this.cursor);
    if (!raw || raw === '.') {
      throw new Error('계산식을 확인해주세요.');
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error('계산값이 너무 큽니다.');
    }

    return value;
  }

  private consumePercent(value: number): number {
    let next = value;
    while (this.match('%')) {
      next /= 100;
    }

    return next;
  }

  private match(target: string): boolean {
    this.skipSpaces();
    if (this.input[this.cursor] !== target) return false;
    this.cursor += 1;
    return true;
  }

  private skipSpaces(): void {
    while (this.input[this.cursor] === ' ') {
      this.cursor += 1;
    }
  }
}

function formatResult(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('계산값이 너무 큽니다.');
  }

  if (Object.is(value, -0)) return '0';

  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 1_000_000_000_000 || absolute < 0.00000001)) {
    return value.toExponential(8).replace(/\.?0+e/, 'e');
  }

  return String(Number(value.toFixed(10)));
}

function createCalculationRecord(expression: string): CalculationRecord {
  const normalizedExpression = normalizeDisplayExpression(expression).trim();
  if (!normalizedExpression) {
    throw new Error('계산식을 입력해주세요.');
  }

  const parserInput = normalizeExpressionForParser(normalizedExpression);
  if (!/^[\d+\-*/().%]+$/.test(parserInput)) {
    throw new Error('숫자와 사칙연산만 사용할 수 있습니다.');
  }

  const value = new CalculatorExpressionParser(parserInput).parse();

  return {
    id: createRecordId(),
    expression: normalizedExpression,
    result: formatResult(value),
    createdAt: Date.now(),
  };
}

function formatRecordTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatCopyText(record: CalculationRecord): string {
  return `${record.expression} = ${record.result}`;
}

function getRecordForSave(data: CalculatorData): CalculationRecord {
  if (data.lastCalculation && data.expression.trim() === data.lastCalculation.result) {
    return {
      ...data.lastCalculation,
      id: createRecordId(),
      createdAt: Date.now(),
    };
  }

  return createCalculationRecord(data.expression);
}

export default function PropigCalculator() {
  const { currentUser, loading: authLoading } = useAuth();
  const uid = currentUser?.uid;
  const storageKey = useMemo(() => getStorageKey(uid), [uid]);
  const sourceKey = uid ? `firestore:${uid}` : `local:${storageKey}`;
  const loadedSourceRef = useRef<string | null>(null);
  const lastSavedPayloadRef = useRef('');
  const pendingRemotePayloadRef = useRef<string | null>(null);

  const [data, setData] = useState<CalculatorData>(EMPTY_CALCULATOR_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const updateCalculatorData = useCallback((updater: (current: CalculatorData) => CalculatorData) => {
    setData((current) => {
      const nextData = updater(current);
      pendingRemotePayloadRef.current = JSON.stringify(nextData);
      return nextData;
    });
  }, []);

  useEffect(() => {
    loadedSourceRef.current = null;
    lastSavedPayloadRef.current = '';
    pendingRemotePayloadRef.current = null;
    setStorageError(null);

    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (!uid) {
      const nextData = readLocalData(storageKey);
      setData(nextData);
      lastSavedPayloadRef.current = JSON.stringify(nextData);
      loadedSourceRef.current = sourceKey;
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(
      createCalculatorRef(uid),
      (snapshot) => {
        const nextData = snapshot.exists() ? normalizeCalculatorData(snapshot.data()) : EMPTY_CALCULATOR_DATA;
        const nextPayload = JSON.stringify(nextData);
        const pendingRemotePayload = pendingRemotePayloadRef.current;

        if (pendingRemotePayload && nextPayload !== pendingRemotePayload) {
          loadedSourceRef.current = sourceKey;
          setIsLoading(false);
          return;
        }

        if (pendingRemotePayload && nextPayload === pendingRemotePayload) {
          pendingRemotePayloadRef.current = null;
        }

        setData(nextData);
        lastSavedPayloadRef.current = nextPayload;
        loadedSourceRef.current = sourceKey;
        setIsLoading(false);
        setStorageError(null);
      },
      (error) => {
        console.warn('Failed to load calculator workspace:', error);
        const fallbackData = readLocalData(storageKey);
        setData(fallbackData);
        lastSavedPayloadRef.current = JSON.stringify(fallbackData);
        pendingRemotePayloadRef.current = null;
        loadedSourceRef.current = `local:${storageKey}`;
        setIsLoading(false);
        setStorageError('계산기 저장 데이터를 불러오지 못해 이 기기 저장소를 사용합니다.');
      },
    );

    return () => unsubscribe();
  }, [authLoading, sourceKey, storageKey, uid]);

  useEffect(() => {
    if (!loadedSourceRef.current || authLoading) return;

    const payload = JSON.stringify(data);
    if (payload === lastSavedPayloadRef.current) return;

    const handle = window.setTimeout(() => {
      writeLocalData(storageKey, data);
      lastSavedPayloadRef.current = payload;

      if (!uid || loadedSourceRef.current !== sourceKey) return;

      setIsSaving(true);
      ensureFirestorePersistence()
        .then(() =>
          setDoc(
            createCalculatorRef(uid),
            {
              ...data,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
        )
        .then(() => setStorageError(null))
        .catch((error) => {
          console.warn('Failed to save calculator workspace:', error);
          setStorageError('계산기 데이터를 Firestore에 저장하지 못했습니다.');
        })
        .finally(() => setIsSaving(false));
    }, 420);

    return () => window.clearTimeout(handle);
  }, [authLoading, data, sourceKey, storageKey, uid]);

  const lastCalculationText = data.lastCalculation ? formatCopyText(data.lastCalculation) : '저장된 계산값 없음';
  const savedTotal = data.savedRecords.length;

  const updateExpression = useCallback((nextExpression: string) => {
    updateCalculatorData((current) => ({
      ...current,
      expression: normalizeDisplayExpression(nextExpression).trimStart(),
    }));
  }, [updateCalculatorData]);

  const appendToken = useCallback((token: string) => {
    updateCalculatorData((current) => {
      const currentExpression = current.expression.trim() || '0';
      const lastChar = currentExpression.at(-1) ?? '';
      const isOperator = ['+', '−', '×', '÷'].includes(token);
      const lastIsOperator = ['+', '−', '×', '÷'].includes(lastChar);

      let nextExpression = currentExpression;
      if (NUMBER_KEYS.includes(token as (typeof NUMBER_KEYS)[number])) {
        nextExpression = currentExpression === '0' && token !== '.' ? token : `${currentExpression}${token}`;
      } else if (token === '(') {
        nextExpression = currentExpression === '0' ? token : `${currentExpression}${token}`;
      } else if (isOperator && lastIsOperator) {
        nextExpression = `${currentExpression.slice(0, -1)}${token}`;
      } else {
        nextExpression = `${currentExpression}${token}`;
      }

      return {
        ...current,
        expression: normalizeDisplayExpression(nextExpression),
      };
    });
  }, [updateCalculatorData]);

  const calculateCurrent = useCallback(() => {
    try {
      const record = createCalculationRecord(data.expression);
      updateCalculatorData((current) => ({
        ...current,
        expression: record.result,
        lastCalculation: record,
      }));
      toast.success('계산했습니다.', { duration: 1600 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '계산할 수 없습니다.', { duration: 2400 });
    }
  }, [data.expression, updateCalculatorData]);

  const saveCurrent = useCallback(() => {
    try {
      const record = getRecordForSave(data);
      updateCalculatorData((current) => ({
        ...current,
        expression: record.result,
        lastCalculation: record,
        savedRecords: [record, ...current.savedRecords].slice(0, MAX_SAVED_RECORDS),
      }));
      toast.success('계산값을 저장했습니다.', { duration: 1700 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장할 계산값이 없습니다.', { duration: 2400 });
    }
  }, [data, updateCalculatorData]);

  const copyText = useCallback(async (text: string, successMessage: string) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }

      await navigator.clipboard.writeText(text);
      toast.success(successMessage, { duration: 1600 });
    } catch {
      toast.error('클립보드 복사에 실패했습니다.', { duration: 2400 });
    }
  }, []);

  const copyCurrent = useCallback(() => {
    const text = data.lastCalculation && data.expression.trim() === data.lastCalculation.result
      ? formatCopyText(data.lastCalculation)
      : data.expression;
    void copyText(text, '현재 값을 복사했습니다.');
  }, [copyText, data.expression, data.lastCalculation]);

  const deleteRecord = useCallback((recordId: string) => {
    updateCalculatorData((current) => ({
      ...current,
      savedRecords: current.savedRecords.filter((record) => record.id !== recordId),
    }));
    toast.success('저장값을 삭제했습니다.', { duration: 1600 });
  }, [updateCalculatorData]);

  const clearExpression = useCallback(() => {
    updateCalculatorData((current) => ({
      ...current,
      expression: '0',
    }));
  }, [updateCalculatorData]);

  const backspace = useCallback(() => {
    updateCalculatorData((current) => {
      const nextExpression = current.expression.length > 1 ? current.expression.slice(0, -1) : '0';
      return {
        ...current,
        expression: nextExpression,
      };
    });
  }, [updateCalculatorData]);

  const recallRecord = useCallback((record: CalculationRecord) => {
    updateCalculatorData((current) => ({
      ...current,
      expression: record.result,
      lastCalculation: record,
    }));
    toast.success('계산값을 불러왔습니다.', { duration: 1400 });
  }, [updateCalculatorData]);

  return (
    <CalculatorShell>
      <CalculatorHero>
        <HeroBadge>
          <Calculator size={17} />
          PROPIG CALC
        </HeroBadge>
        <HeroTitle>계산기</HeroTitle>
        <HeroMeta>
          <span>{isLoading ? '불러오는 중' : `${savedTotal}개 저장`}</span>
          <span>{isSaving ? '저장 중' : currentUser ? '계정 동기화' : '기기 저장'}</span>
        </HeroMeta>
      </CalculatorHero>

      <WorkspaceGrid>
        <CalculatorPanel>
          <DisplayBar>
            <ExpressionInput
              aria-label="계산식"
              value={data.expression}
              placeholder="0"
              disabled={isLoading}
              onChange={(event) => updateExpression(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  calculateCurrent();
                }
              }}
              spellCheck={false}
            />
            <ResultStrip>
              <span>마지막</span>
              <strong>{lastCalculationText}</strong>
            </ResultStrip>
          </DisplayBar>

          <ActionRail>
            <SecondaryButton type="button" onClick={clearExpression} disabled={isLoading}>
              <RotateCcw size={16} />
              초기화
            </SecondaryButton>
            <SecondaryButton type="button" onClick={backspace} disabled={isLoading}>
              지우기
            </SecondaryButton>
            <SecondaryButton type="button" onClick={copyCurrent} disabled={isLoading}>
              <Copy size={16} />
              복사
            </SecondaryButton>
            <PrimaryButton type="button" onClick={saveCurrent} disabled={isLoading}>
              <Save size={16} />
              추가 저장
            </PrimaryButton>
          </ActionRail>

          <KeypadGrid>
            <KeyButton type="button" $tone="soft" onClick={() => appendToken('(')} disabled={isLoading}>
              (
            </KeyButton>
            <KeyButton type="button" $tone="soft" onClick={() => appendToken(')')} disabled={isLoading}>
              )
            </KeyButton>
            <KeyButton type="button" $tone="soft" onClick={() => appendToken('%')} disabled={isLoading}>
              %
            </KeyButton>
            <KeyButton type="button" $tone="operator" onClick={() => appendToken('÷')} disabled={isLoading} aria-label="나누기">
              <Divide size={18} />
            </KeyButton>

            <KeyButton type="button" onClick={() => appendToken('7')} disabled={isLoading}>7</KeyButton>
            <KeyButton type="button" onClick={() => appendToken('8')} disabled={isLoading}>8</KeyButton>
            <KeyButton type="button" onClick={() => appendToken('9')} disabled={isLoading}>9</KeyButton>
            <KeyButton type="button" $tone="operator" onClick={() => appendToken('×')} disabled={isLoading}>×</KeyButton>

            <KeyButton type="button" onClick={() => appendToken('4')} disabled={isLoading}>4</KeyButton>
            <KeyButton type="button" onClick={() => appendToken('5')} disabled={isLoading}>5</KeyButton>
            <KeyButton type="button" onClick={() => appendToken('6')} disabled={isLoading}>6</KeyButton>
            <KeyButton type="button" $tone="operator" onClick={() => appendToken('−')} disabled={isLoading}>−</KeyButton>

            <KeyButton type="button" onClick={() => appendToken('1')} disabled={isLoading}>1</KeyButton>
            <KeyButton type="button" onClick={() => appendToken('2')} disabled={isLoading}>2</KeyButton>
            <KeyButton type="button" onClick={() => appendToken('3')} disabled={isLoading}>3</KeyButton>
            <KeyButton type="button" $tone="operator" onClick={() => appendToken('+')} disabled={isLoading}>
              <Plus size={18} />
            </KeyButton>

            <KeyButton type="button" $wide onClick={() => appendToken('0')} disabled={isLoading}>0</KeyButton>
            <KeyButton type="button" onClick={() => appendToken('.')} disabled={isLoading}>.</KeyButton>
            <KeyButton type="button" $tone="equals" onClick={calculateCurrent} disabled={isLoading} aria-label="계산">
              <Equal size={20} />
            </KeyButton>
          </KeypadGrid>
        </CalculatorPanel>

        <SavedPanel>
          <SavedHead>
            <div>
              <span>저장 목록</span>
              <strong>{savedTotal}개</strong>
            </div>
            {isSaving ? <SpinningLoader size={18} /> : <ClipboardCopy size={18} />}
          </SavedHead>

          {storageError ? <StorageWarning>{storageError}</StorageWarning> : null}

          {data.savedRecords.length > 0 ? (
            <SavedList>
              {data.savedRecords.map((record) => (
                <SavedItem key={record.id}>
                  <SavedButton type="button" onClick={() => recallRecord(record)}>
                    <strong>{record.result}</strong>
                    <span>{record.expression}</span>
                    <time>{formatRecordTime(record.createdAt)}</time>
                  </SavedButton>
                  <SavedActions>
                    <IconAction
                      type="button"
                      onClick={() => void copyText(formatCopyText(record), '저장값을 복사했습니다.')}
                      aria-label={`${record.result} 복사`}
                      title="복사"
                    >
                      <Copy size={16} />
                    </IconAction>
                    <IconAction
                      type="button"
                      onClick={() => deleteRecord(record.id)}
                      aria-label={`${record.result} 삭제`}
                      title="삭제"
                      $danger
                    >
                      <Trash2 size={16} />
                    </IconAction>
                  </SavedActions>
                </SavedItem>
              ))}
            </SavedList>
          ) : (
            <EmptyState>
              <strong>저장값 없음</strong>
              <span>계산 후 추가 저장을 누르면 여기에 쌓입니다.</span>
            </EmptyState>
          )}
        </SavedPanel>
      </WorkspaceGrid>
    </CalculatorShell>
  );
}

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

const CalculatorShell = styled.main`
  --surface: #0c1117;
  --surface-soft: #131b23;
  --surface-raised: #192331;
  --surface-hover: #223041;
  --border: #2a3948;
  --border-strong: #40556b;
  --text: #f4f8fb;
  --muted: #a9b7c5;
  --faint: #738293;
  --accent: #f472b6;
  --accent-strong: #fb7185;
  --accent-soft: rgba(244, 114, 182, 0.16);
  --green: #42d392;
  --green-soft: rgba(66, 211, 146, 0.14);
  --amber: #f7c76d;
  --danger: #ff8f8f;
  --danger-soft: rgba(255, 143, 143, 0.12);
  background:
    linear-gradient(90deg, rgba(244, 114, 182, 0.09) 0 1px, transparent 1px 100%),
    linear-gradient(180deg, rgba(66, 211, 146, 0.07) 0 1px, transparent 1px 100%),
    radial-gradient(circle at 18% 12%, rgba(244, 114, 182, 0.18), transparent 34%),
    linear-gradient(145deg, #080c11 0%, #0c1419 48%, #11130e 100%);
  background-size: 76px 76px, 76px 76px, auto, auto;
  color: var(--text);
  min-height: 100%;
  overflow-y: auto;
  padding: clamp(16px, 3vw, 34px);

  @media (max-width: 720px) {
    padding: 18px 16px calc(32px + env(safe-area-inset-bottom));
  }
`;

const CalculatorHero = styled.header`
  border-bottom: 1px solid rgba(244, 114, 182, 0.34);
  display: grid;
  gap: 8px;
  margin: 0 auto 16px;
  max-width: 1180px;
  padding: 10px 0 16px;
`;

const HeroBadge = styled.div`
  align-items: center;
  color: #ffd6e8;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 950;
  gap: 8px;
  letter-spacing: 0;

  svg {
    color: var(--amber);
  }
`;

const HeroTitle = styled.h1`
  font-size: clamp(2rem, 4vw, 3.1rem);
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
`;

const HeroMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;

  span {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 900;
    padding: 6px 9px;
  }
`;

const WorkspaceGrid = styled.section`
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(320px, 480px) minmax(0, 1fr);
  margin: 0 auto;
  max-width: 1180px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const CalculatorPanel = styled.section`
  background:
    linear-gradient(180deg, rgba(19, 27, 35, 0.96), rgba(8, 12, 17, 0.96)),
    linear-gradient(135deg, rgba(244, 114, 182, 0.15), rgba(66, 211, 146, 0.08));
  border: 1px solid rgba(244, 114, 182, 0.3);
  border-radius: 8px;
  box-shadow: 0 22px 58px rgba(0, 0, 0, 0.34);
  display: grid;
  gap: 12px;
  padding: clamp(12px, 2vw, 16px);
`;

const DisplayBar = styled.div`
  background: #071015;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 12px;
`;

const ExpressionInput = styled.input`
  background: transparent;
  border: 0;
  color: var(--text);
  font: inherit;
  font-size: clamp(1.8rem, 7vw, 3.2rem);
  font-weight: 950;
  letter-spacing: 0;
  min-width: 0;
  outline: none;
  text-align: right;
  width: 100%;

  &:disabled {
    color: var(--faint);
    cursor: wait;
  }
`;

const ResultStrip = styled.div`
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  gap: 6px;
  grid-template-columns: auto minmax(0, 1fr);
  padding-top: 8px;

  span {
    color: var(--faint);
    font-size: 0.76rem;
    font-weight: 950;
  }

  strong {
    color: #ffd6e8;
    font-size: 0.84rem;
    font-weight: 900;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const ActionRail = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));

  @media (max-width: 520px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SecondaryButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 950;
  gap: 6px;
  justify-content: center;
  min-height: 38px;
  min-width: 0;
  padding: 0 10px;

  &:hover {
    background: var(--surface-hover);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.55;
  }
`;

const PrimaryButton = styled(SecondaryButton)`
  background: var(--accent);
  border-color: var(--accent);
  color: #12070e;

  &:hover {
    background: var(--accent-strong);
  }
`;

const KeypadGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
`;

const KeyButton = styled.button<{ $tone?: 'soft' | 'operator' | 'equals'; $wide?: boolean }>`
  align-items: center;
  aspect-ratio: ${({ $wide }) => ($wide ? '2 / 1' : '1 / 1')};
  background: ${({ $tone }) =>
    $tone === 'equals'
      ? 'linear-gradient(135deg, #42d392, #f7c76d)'
      : $tone === 'operator'
        ? 'var(--accent-soft)'
        : $tone === 'soft'
          ? 'var(--surface-soft)'
          : 'var(--surface-raised)'};
  border: 1px solid ${({ $tone }) => ($tone === 'equals' ? '#42d392' : $tone === 'operator' ? 'rgba(244, 114, 182, 0.5)' : 'var(--border)')};
  border-radius: 8px;
  color: ${({ $tone }) => ($tone === 'equals' ? '#06110d' : $tone === 'operator' ? '#ffd6e8' : 'var(--text)')};
  cursor: pointer;
  display: inline-flex;
  font-size: clamp(1.05rem, 3vw, 1.45rem);
  font-weight: 950;
  grid-column: ${({ $wide }) => ($wide ? 'span 2' : 'span 1')};
  justify-content: center;
  min-height: 62px;

  &:hover {
    background: ${({ $tone }) => ($tone === 'equals' ? 'linear-gradient(135deg, #5ee6a9, #ffd27d)' : 'var(--surface-hover)')};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.48;
    transform: none;
  }
`;

const SavedPanel = styled.section`
  background: rgba(12, 17, 23, 0.82);
  border: 1px solid rgba(66, 211, 146, 0.24);
  border-radius: 8px;
  box-shadow: 0 22px 58px rgba(0, 0, 0, 0.28);
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: clamp(12px, 2vw, 16px);
`;

const SavedHead = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;

  div {
    display: grid;
    gap: 2px;
  }

  span {
    color: var(--faint);
    font-size: 0.72rem;
    font-weight: 950;
  }

  strong {
    color: var(--text);
    font-size: 1.08rem;
    font-weight: 950;
  }

  svg {
    color: var(--green);
  }
`;

const StorageWarning = styled.p`
  background: var(--danger-soft);
  border: 1px solid rgba(255, 143, 143, 0.32);
  border-radius: 8px;
  color: #ffc2c2;
  font-size: 0.82rem;
  font-weight: 850;
  line-height: 1.4;
  margin: 0;
  padding: 10px 11px;
`;

const SavedList = styled.div`
  display: grid;
  gap: 8px;
`;

const SavedItem = styled.article`
  align-items: center;
  background: linear-gradient(180deg, rgba(25, 35, 49, 0.88), rgba(15, 22, 30, 0.88));
  border: 1px solid var(--border);
  border-left: 4px solid var(--green);
  border-radius: 8px;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  padding: 9px;
`;

const SavedButton = styled.button`
  background: transparent;
  border: 0;
  cursor: pointer;
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 0;
  text-align: left;

  strong {
    color: var(--text);
    font-size: 1rem;
    font-weight: 950;
    overflow-wrap: anywhere;
  }

  span {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 850;
    overflow-wrap: anywhere;
  }

  time {
    color: var(--faint);
    font-size: 0.7rem;
    font-weight: 900;
  }
`;

const SavedActions = styled.div`
  display: inline-flex;
  gap: 5px;
`;

const IconAction = styled.button<{ $danger?: boolean }>`
  align-items: center;
  background: ${({ $danger }) => ($danger ? 'var(--danger-soft)' : 'var(--surface-soft)')};
  border: 1px solid ${({ $danger }) => ($danger ? 'rgba(255, 143, 143, 0.34)' : 'var(--border)')};
  border-radius: 8px;
  color: ${({ $danger }) => ($danger ? 'var(--danger)' : 'var(--text)')};
  cursor: pointer;
  display: inline-flex;
  height: 36px;
  justify-content: center;
  width: 36px;

  &:hover {
    background: var(--surface-hover);
  }
`;

const EmptyState = styled.div`
  align-items: center;
  background: rgba(255, 255, 255, 0.045);
  border: 1px dashed rgba(169, 183, 197, 0.32);
  border-radius: 8px;
  display: grid;
  gap: 4px;
  min-height: 96px;
  padding: 16px;
  text-align: center;

  strong {
    color: var(--text);
    font-size: 0.98rem;
    font-weight: 950;
  }

  span {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 800;
  }
`;

const SpinningLoader = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;
