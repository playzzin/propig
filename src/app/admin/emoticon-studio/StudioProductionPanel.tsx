'use client';

import styled from 'styled-components';
import { ClipboardCopy, ImagePlus, RefreshCw, Sparkles, X } from 'lucide-react';

type Props = {
  method: 'manual' | 'ai'; onMethod: (value: 'manual' | 'ai') => void;
  total: number; completed: number; missing: number; frameCount: number;
  importing: boolean; generating: boolean; onImport: () => void; onCopy: () => void;
  onGenerate: () => void; onCancel: () => void; onEdit: () => void;
  mode: 'fast' | 'quality'; onMode: (value: 'fast' | 'quality') => void;
  provider: 'auto' | 'openai' | 'google' | 'xai'; onProvider: (value: Props['provider']) => void;
  model: string; modelStatus: string; modelReady: boolean; onRefresh: () => void;
  batch: number; onBatch: (value: number) => void;
  consent: boolean; onConsent: (value: boolean) => void; blockedReason: string;
  remainingBudget: number | null;
};

export default function StudioProductionPanel(props: Props) {
  const count = Math.min(props.batch, props.missing);
  return <Panel aria-label="프레임 만들기">
    <Summary aria-label="프레임 제작 현황"><strong>{props.completed}/{props.total} 프레임 완료</strong><span>{props.missing}개 남음 · 가져온 원본 {props.frameCount}장</span></Summary>
    <Methods aria-label="제작 방식">
      <button type="button" aria-pressed={props.method === 'manual'} onClick={() => props.onMethod('manual')}>직접 가져오기</button>
      <button type="button" aria-pressed={props.method === 'ai'} onClick={() => props.onMethod('ai')}>AI로 만들기</button>
    </Methods>
    {props.method === 'manual' ? <>
      <p>준비한 PNG·JPG·WebP를 선택하세요. 파일명 순서대로 빈 프레임에 연결해요.</p>
      <Actions><Primary type="button" disabled={props.importing || props.generating} onClick={props.onImport}><ImagePlus size={18} />{props.importing ? '이미지 가져오는 중…' : '이미지 여러 장 선택'}</Primary>{props.frameCount > 0 ? <Secondary type="button" onClick={props.onEdit}>프레임 편집</Secondary> : null}</Actions>
      <details><summary>ChatGPT에서 새 이미지를 만드는 방법</summary><p>기준 이미지와 제작 지시서를 ChatGPT에 넣고, 받은 이미지를 여기에 가져오세요. ProPig의 AI 생성 요금은 발생하지 않아요.</p><Actions><Secondary type="button" onClick={props.onCopy}><ClipboardCopy size={16} />프롬프트 복사</Secondary><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기 ↗</a></Actions></details>
    </> : <>
      <p>실행 모델 <strong>{props.model}</strong> · {props.mode === 'fast' ? '빠른 제작' : '고품질'} · {count}장</p>
      <ModelStatus data-model-preflight={props.modelReady ? 'available' : 'unavailable'}><span role="status">{props.modelStatus}</span><Secondary type="button" disabled={props.generating} onClick={props.onRefresh}><RefreshCw size={14} />다시 확인</Secondary></ModelStatus>
      <details><summary>모델·품질·생성 수량 설정</summary><Options>
        <label>품질<select aria-label="이미지 생성 품질" disabled={props.generating} value={props.mode} onChange={(event) => props.onMode(event.target.value as Props['mode'])}><option value="fast">빠른 제작</option><option value="quality">고품질</option></select></label>
        <label>이미지 모델<select aria-label="이미지 모델" disabled={props.generating} value={props.provider} onChange={(event) => props.onProvider(event.target.value as Props['provider'])}><option value="auto">품질에 맞는 추천 모델</option><option value="openai">OpenAI</option><option value="google">Google</option><option value="xai">xAI</option></select></label>
        <label>이번 자동 생성 수량<select aria-label="이번 자동 생성 수량" disabled={props.generating} value={props.batch} onChange={(event) => props.onBatch(Number(event.target.value))}>{[1, 2, 4, 8].map((value) => <option value={value} key={value}>{value}장</option>)}</select></label>
      </Options></details>
      <small>별도 API 과금 · 정확한 비용은 결과 확인 후 표시돼요. {props.remainingBudget === null ? '오늘 이미지 예산은 확인되지 않았어요.' : `오늘 이미지 예산 잔여 $${props.remainingBudget.toFixed(2)} (UTC 기준)`}</small>
      <Consent><input id="studio-generation-consent" type="checkbox" disabled={props.generating} checked={props.consent} onChange={(event) => props.onConsent(event.target.checked)} /><span>위 모델·품질·수량으로 기준 이미지와 제작 설명을 외부 모델에 보내고 별도 과금하는 데 동의합니다. 취소 전 전송한 작업은 과금될 수 있어요.</span></Consent>
      {props.blockedReason ? <p id="studio-generation-blocker" role="status">{props.blockedReason}</p> : null}
      <Actions>{props.generating ? <Secondary type="button" onClick={props.onCancel}><X size={16} />추가 생성 중지</Secondary> : <Primary type="button" disabled={Boolean(props.blockedReason) || props.importing} aria-describedby={props.blockedReason ? 'studio-generation-blocker' : undefined} onClick={props.onGenerate}><Sparkles size={18} />{count}장 자동 생성</Primary>}</Actions>
    </>}
  </Panel>;
}

const Panel = styled.section`display:grid;gap:14px;margin:0 0 22px;padding:20px;background:var(--studio-panel);border:1px solid var(--studio-line);border-radius:12px;p{margin:0;line-height:1.6;font-size:.88rem}small{font-size:.76rem;line-height:1.6;color:var(--studio-muted)}details{border-top:1px solid var(--studio-line);padding-top:12px}summary{cursor:pointer;font-weight:700;font-size:.86rem;min-height:36px}details p{margin:8px 0 12px}`;
const Summary = styled.div`display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;span{font-size:.8rem;color:var(--studio-muted)}`;
const Methods = styled.div`display:flex;gap:8px;button{flex:1;min-height:44px;border:1px solid var(--studio-line);border-radius:8px;background:var(--studio-panel);color:var(--studio-text);font:inherit;cursor:pointer}button[aria-pressed=true]{background:#f4efff;border-color:var(--studio-accent);color:#5322b8;font-weight:750}`;
const Actions = styled.div`display:flex;align-items:center;flex-wrap:wrap;gap:10px;a{color:#5322b8;font-size:.85rem}`;
const Primary = styled.button`display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 18px;border:1px solid var(--studio-accent);border-radius:8px;background:var(--studio-accent);color:white;font:inherit;font-weight:750;cursor:pointer;&:disabled{opacity:.5;cursor:not-allowed}`;
const Secondary = styled(Primary)`background:var(--studio-panel);border-color:var(--studio-line);color:var(--studio-text);font-weight:650`;
const Options = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;label{display:grid;gap:7px;font-size:.8rem}select{width:100%;min-height:44px;padding:8px;border:1px solid var(--studio-line);border-radius:8px;background:var(--studio-panel);color:var(--studio-text);font:inherit}`;
const Consent = styled.label`display:flex;align-items:flex-start;gap:10px;font-size:.8rem;line-height:1.6;cursor:pointer;input{flex:0 0 auto;margin-top:4px;accent-color:var(--studio-accent)}`;
const ModelStatus = styled.div`display:flex;align-items:center;flex-wrap:wrap;gap:10px;color:var(--studio-muted);font-size:.8rem`;
