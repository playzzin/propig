'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import styled from 'styled-components';

const stages = [
  { line: '개발도 디자인도 컨텐츠도 다하는', emphasis: '슈퍼 뚠뚠이 입니다', alt: '화려한 재킷을 입고 마이크를 든 자신만만한 캐릭터' },
  { line: '이것도 저것도 하는데...', emphasis: '손이좀모자라네요...', alt: '노트북과 붓, 마이크를 한꺼번에 들고 당황한 캐릭터' },
  { line: '망가지고 하나해서 돈이 안되서 이것저것 다하는데...', emphasis: '돈이 안되서 -_-;;', alt: '텅 빈 지갑을 들여다보며 당황한 캐릭터' },
  { line: '이도저도 아닌', emphasis: '그냥 뚠뚠이가 됫나바요', alt: '양손을 펼치고 멋쩍게 웃으며 속마음을 털어놓는 캐릭터' },
  { line: '에라 모르 겟네요... 그냥 그런 뚠뚠이 인데', emphasis: '그냥 밑에 원칙들로 일합니다', alt: '옆으로 누워 심술난 표정으로 담배를 피우는 성인 뚠뚠이 캐릭터' },
];

export default function CeoCharacterAside() {
  const stage = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [step, setStep] = useState(0);
  const current = stages[step];

  useEffect(() => {
    if (!stage.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setEntered(true);
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  return <CharacterStage ref={stage} aria-label="그냥돼지의 솔직한 한마디" data-entered={entered}>
    <div className="speech" aria-live="polite" aria-atomic="true">
      <div key={step} className="speech-copy">
        <p>{current.line}<br /><strong>{current.emphasis}</strong></p>
      </div>
    </div>
    <button type="button" className="character" onClick={() => setStep((value) => (value + 1) % stages.length)}
      aria-label={step === stages.length - 1 ? '캐릭터 이야기 처음부터 다시 보기' : '캐릭터 다음 이야기 보기'}>
      <Image key={step} src={`/images/corp/founder-story/vision-stage-${step + 1}${step === 4 ? '-reclining' : ''}.png`} width={1254} height={1254}
        alt={current.alt} unoptimized />
    </button>
    <span className="caption">{step === stages.length - 1 ? '클릭하면 처음 이야기로' : '캐릭터를 누르면 다음 이야기로'} <span aria-hidden="true">↗</span></span>
  </CharacterStage>;
}

const CharacterStage = styled.aside`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  align-self: center;
  min-width: 0;
  padding: 8px 0;

  .speech { position: relative; width: 100%; min-height: 180px; display: flex; align-items: center; padding: 20px; border-radius: 22px; background: #f8fafc; color: #172033; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16); transform-origin: 60% 100%; }
  .speech::after { content: ''; position: absolute; top: 50%; right: -8px; width: 16px; height: 16px; border-radius: 0 0 4px 0; background: #f8fafc; transform: rotate(45deg); }
  .speech p { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.7; word-break: keep-all; }
  .speech strong { color: #1d4ed8; font-weight: 850; }
  .character { position: relative; width: 100%; aspect-ratio: 1; margin: 0; padding: 0; border: 0; border-radius: 20px; background: #101c33; cursor: pointer; transform-origin: 50% 95%; }
  .character img { position: relative; display: block; width: 100%; height: 100%; object-fit: contain; border-radius: 19px; }
  button:focus-visible { outline: 2px solid #f8fafc; outline-offset: 4px; }
  .speech-copy, .character img { animation: caption-arrive 320ms ease both; }
  .caption { grid-column: 1 / -1; margin-top: 4px; color: #cbd5e1; font-size: 13px; line-height: 1.6; text-align: center; }
  .caption strong { color: #ffd778; }

  &[data-entered='true'] .character { animation: character-settle 900ms cubic-bezier(0.22, 1, 0.36, 1) both; }
  &[data-entered='true'] .speech { animation: speech-arrive 650ms 180ms cubic-bezier(0.22, 1, 0.36, 1) both; }
  &[data-entered='true'] .caption { animation: caption-arrive 500ms 420ms ease both; }
  @keyframes character-settle { 0% { opacity: 0; transform: translateY(20px) rotate(-3deg); } 65% { opacity: 1; transform: translateY(-2px) rotate(1deg); } 100% { opacity: 1; transform: none; } }
  @keyframes speech-arrive { from { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: none; } }
  @keyframes caption-arrive { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  @media (max-width: 520px) {
    .speech { padding: 14px; min-height: 180px; border-radius: 16px; }
    .speech p { font-size: 13px; line-height: 1.7; }
    .caption { font-size: 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    &[data-entered='true'] .character, &[data-entered='true'] .speech, &[data-entered='true'] .caption { animation: none; }
    .speech-copy, .character img { animation: none; }
  }
`;
