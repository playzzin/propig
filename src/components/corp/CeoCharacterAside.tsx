'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import styled from 'styled-components';
import { ceoCharacterStages as stages } from './ceoCharacterStages';

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
      <Image key={step} src={current.src} width={1254} height={1254}
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
