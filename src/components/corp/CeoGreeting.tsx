'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import styled from 'styled-components';
import { ceoCharacterStages } from './ceoCharacterStages';

export default function CeoGreeting() {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [step, setStep] = useState(0);
  const [speechOpen, setSpeechOpen] = useState(false);
  const photoButton = useRef<HTMLButtonElement>(null);
  const current = ceoCharacterStages[step];

  const showSpeech = () => {
    if (speechOpen) setStep((value) => (value + 1) % ceoCharacterStages.length);
    setPhotoFailed(false);
    setSpeechOpen(true);
  };

  const closeSpeech = () => {
    setSpeechOpen(false);
    photoButton.current?.focus({ preventScroll: true });
  };

  return (
    <GreetingSection aria-label="대표인사말" data-speech-open={speechOpen}
      onKeyDown={(event) => { if (event.key === 'Escape' && speechOpen) { event.preventDefault(); closeSpeech(); } }}>
      <figure className="greeting-portrait">
        <button ref={photoButton} type="button" className="portrait-frame" onClick={showSpeech}
          aria-expanded={speechOpen} aria-controls="ceo-greeting-speech" data-greeting-stage={step + 1}
          aria-label={!speechOpen ? '그뚠이 인사말 말풍선 열기' : step === ceoCharacterStages.length - 1 ? '그뚠이 이야기 처음부터 다시 보기' : '그뚠이 다음 이야기 보기'}>
          {photoFailed ? (
            <p className="photo-fallback" role="status">대표 사진을 불러오지 못했습니다.</p>
          ) : (
            <Image key={step} src={current.src} alt={current.alt} width={720} height={720}
              sizes="(max-width: 760px) 360px, 400px" loading="eager" className="portrait-image"
              onError={() => setPhotoFailed(true)} />
          )}
        </button>
        <figcaption><span>그냥돼지 대표</span><strong>그뚠이</strong></figcaption>
        <p className="portrait-hint">{speechOpen ? '사진을 누르면 다음 이야기로' : '사진을 눌러 그뚠이의 이야기를 들어보세요.'}</p>
      </figure>

      <aside id="ceo-greeting-speech" className="greeting-speech" hidden={!speechOpen} aria-labelledby="ceo-greeting-title">
        <div aria-live="polite" aria-atomic="true">
          {speechOpen ? <p key={step} className="speech-copy">{current.line}<br /><strong>{current.emphasis}</strong></p> : null}
        </div>
        <span className="speech-step" aria-hidden="true">0{step + 1} / 0{ceoCharacterStages.length}</span>
        <button type="button" className="speech-close" aria-label="인사말 말풍선 닫기" onClick={closeSpeech}><span aria-hidden="true">×</span></button>
        <div className="greeting-letter">
          <span className="greeting-eyebrow">MESSAGE FROM THE CEO</span>
          <h2 id="ceo-greeting-title">현장에서 배운 마음으로,<br />끝까지 만들어갑니다.</h2>
          <p className="greeting-salutation">안녕하세요. 그냥돼지의 그뚠이입니다.</p>

          <div className="greeting-body">
            <p>저의 시작은 거창하지 않았습니다. 화장실이 있는 방, 내 오토바이, 한 대의 컴퓨터처럼 생활을 바꾸는 작은 목표에서 출발했습니다. 현장에서 일하고 새로운 일을 배우며, 누군가의 하루를 조금 더 편하게 만드는 일의 소중함을 알게 되었습니다.</p>
            <p>그냥돼지는 그 경험에서 시작했습니다. 현장의 불편을 먼저 듣고, 직접 만들고, 써보며 고치는 과정을 이어갑니다. 기술은 사람들이 자신의 일에 집중할 수 있도록 돕는 도구여야 한다고 생각합니다.</p>
            <p>잘 모르는 것은 배우고, 한 번에 되지 않으면 다른 방법을 찾겠습니다. 결과를 만든 뒤에도 끝까지 책임지고, 함께 일하는 분들의 신뢰를 차곡차곡 쌓아가겠습니다.</p>
            <p className="greeting-closing">작은 약속을 지키는 일부터, 그냥돼지답게 해나가겠습니다.<br />함께해 주셔서 감사합니다.</p>
          </div>

          <footer className="greeting-signoff">
            <span>그냥돼지 대표</span>
            <span className="signature-frame">
              <Image src="/images/corp/founder-story/geuttun-signature.png" alt="그뚠이 손글씨 사인"
                width={1774} height={887} className="signature-image" sizes="360px" />
            </span>
          </footer>
        </div>
      </aside>
    </GreetingSection>
  );
}

const GreetingSection = styled.section`
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(0, 1.35fr);
  align-items: start;
  gap: 24px 44px;
  padding: 24px 4px;
  color: #172033;

  .greeting-portrait { grid-column: 1; grid-row: 1; min-width: 0; margin: 0; }
  &[data-speech-open='false'] .greeting-portrait { grid-column: 1 / -1; width: min(100%, 360px); justify-self: center; }
  .portrait-frame { display: block; width: 100%; aspect-ratio: 1; margin: 0; padding: 0; overflow: hidden; border: 0; border-radius: 14px; background: #101c33; cursor: pointer; touch-action: manipulation; }
  .portrait-image { display: block; width: 100%; height: 100%; object-fit: contain; transition: transform 200ms ease; }
  .portrait-frame:focus-visible, .speech-close:focus-visible { outline: 3px solid #2563eb; outline-offset: 4px; }
  .portrait-frame:active .portrait-image { transform: scale(0.97); }
  .portrait-hint { margin: 12px 0 0; color: #64748b; font-size: 12px; line-height: 1.7; word-break: keep-all; }
  .photo-fallback { display: grid; place-items: center; height: 100%; margin: 0; padding: 24px; color: #cbd5e1; font-size: 14px; text-align: center; }
  figcaption { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 18px 2px; border-bottom: 1px solid #dfe6ef; }
  figcaption span { color: #64748b; font-size: 13px; }
  figcaption strong { font-size: 19px; font-weight: 800; }

  .greeting-letter { min-width: 0; margin-top: 24px; padding-top: 24px; border-top: 1px solid #dfe6ef; }
  .greeting-speech { position: relative; grid-column: 2; grid-row: 1; min-width: 0; padding: 28px; border: 1px solid #cbdcfb; border-radius: 18px; background: #ffffff; box-shadow: 0 10px 28px rgba(37, 99, 235, 0.06); }
  .greeting-speech[hidden] { display: none; }
  .greeting-speech::before { content: ''; position: absolute; left: -9px; top: 36px; width: 16px; height: 16px; border-left: 1px solid #cbdcfb; border-bottom: 1px solid #cbdcfb; background: #ffffff; transform: rotate(45deg); }
  .speech-copy { margin: 0; padding-right: 20px; font-size: 17px; font-weight: 650; line-height: 1.8; word-break: keep-all; overflow-wrap: anywhere; animation: greeting-speech-arrive 240ms ease both; }
  .speech-copy strong { color: #1d4ed8; font-weight: 850; }
  .speech-step { display: block; margin-top: 14px; color: #64748b; font-size: 11px; font-variant-numeric: tabular-nums; }
  .speech-close { position: absolute; right: 8px; top: 8px; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 8px; background: transparent; color: #64748b; font-size: 24px; cursor: pointer; }
  .speech-close:hover { background: #edf3ff; color: #1d4ed8; }
  .greeting-eyebrow { color: #2563eb; font-size: 12px; font-weight: 750; }
  h2 { margin: 16px 0 26px; font-size: 29px; font-weight: 850; line-height: 1.55; word-break: keep-all; overflow-wrap: anywhere; }
  .greeting-salutation { margin: 0 0 24px; font-size: 16px; font-weight: 750; line-height: 1.8; word-break: keep-all; }
  .greeting-body { color: #475569; font-size: 15px; line-height: 1.95; word-break: keep-all; overflow-wrap: anywhere; }
  .greeting-body p { margin: 0 0 22px; }
  .greeting-body .greeting-closing { margin-bottom: 0; color: #172033; font-weight: 650; }
  .greeting-signoff { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0 12px; margin-top: 28px; padding-top: 16px; border-top: 1px solid #dfe6ef; }
  .greeting-signoff > span:first-child { font-size: 13px; color: #64748b; }
  .signature-frame { position: relative; display: block; width: min(240px, 100%); aspect-ratio: 30 / 13; overflow: hidden; flex-shrink: 0; }
  .signature-image { position: absolute; width: 150%; max-width: none; height: auto; left: -30%; top: -42.3077%; }

  @keyframes greeting-speech-arrive {
    from { opacity: 0; transform: translateX(-6px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @media (hover: hover) and (pointer: fine) {
    .portrait-frame:hover .portrait-image { transform: scale(1.025); }
    .portrait-frame:active .portrait-image { transform: scale(0.97); }
  }
  @media (prefers-reduced-motion: reduce) {
    .speech-copy { animation: none; }
    .portrait-frame .portrait-image { transform: none !important; transition: none; }
  }

  @media (max-width: 1050px) {
    grid-template-columns: minmax(200px, 0.75fr) minmax(0, 1.25fr);
    gap: 28px;
    h2 { font-size: 25px; }
  }
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    padding: 10px 0;
    .greeting-portrait { grid-column: 1; grid-row: 1; width: min(100%, 240px); justify-self: start; }
    figcaption { padding: 12px 0; }
    .greeting-speech { grid-column: 1; grid-row: 2; padding: 44px 20px 20px; }
    .greeting-speech::before { left: 36px; top: -9px; transform: rotate(135deg); }
    .speech-copy { padding-right: 0; font-size: 15px; line-height: 1.8; }
    h2 { font-size: 24px; }
    .greeting-signoff { gap: 0; }
  }
`;
