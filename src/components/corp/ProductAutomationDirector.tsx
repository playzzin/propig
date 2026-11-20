'use client';

import Image from 'next/image';
import { ArrowRight, Mic, Monitor, Smartphone } from 'lucide-react';
import styled, { css, keyframes } from 'styled-components';
import ProductAutomationDeskEffects from './ProductAutomationDeskEffects';

const MODES = [
  { id: 'pc', label: 'PC 명령', icon: Monitor, title: '클릭 한 번, 맡겨두기.' },
  { id: 'phone', label: '스마트폰', icon: Smartphone, title: '손안에서, 가볍게.' },
  { id: 'voice', label: '음성 명령', icon: Mic, title: '말 한마디면 충분해.' },
] as const;
const COMMANDS = [
  ['오늘 들어온 자료 정리해 줘.', '작성된 서류를 보여 줘.', '다음 업무도 이어서 해 줘.'],
  ['이번 달 급여 자료 정리해 줘.', '급여명세서 검토본 보내 줘.', '완성된 명세서를 모아 줘.'],
  ['계약서 초안 만들어 줘.', '발주 내역 확인해 줘.', '확인할 항목만 알려 줘.'],
  ['이번 주 업무보고 정리해 줘.', '출장 신청 내역 보여 줘.', '완성된 보고서 모아 줘.'],
  ['거래 내역으로 계산서 준비해 줘.', '발행할 내용을 보여 줘.', '확인된 발행 결과 정리해 줘.'],
  ['급여이체 내역 준비해 줘.', '검토할 명단을 보여 줘.', '처리 결과를 정리해 줘.'],
  ['안내 메시지 초안 만들어 줘.', '보낼 내용 확인해 줘.', '발송 결과 모아서 알려 줘.'],
  ['주문 내역 정리해 줘.', '결제 상태를 확인해 줘.', '완료된 주문을 모아 줘.'],
  ['반복 입력할 자료 가져와 줘.', '브라우저 작업을 이어 줘.', '처리가 끝나면 알려 줘.'],
  ['오늘 할 일을 나눠서 맡아 줘.', '진행 상황을 한눈에 보여 줘.', '완료된 일부터 보고해 줘.'],
] as const;

export default function ProductAutomationDirector({ elapsedMs, variant, cycle, playing, reducedMotion }: { elapsedMs: number; variant: number; cycle: number; playing: boolean; reducedMotion: boolean }) {
  const phase = Math.min(2, Math.max(0, Math.floor(elapsedMs / 4000)));
  const mode = MODES[phase];
  const command = (COMMANDS[variant] ?? COMMANDS[0])[phase];
  return (
    <Director data-automation-director data-command-mode={mode.id} $playing={playing} $reducedMotion={reducedMotion}>
      <Heading><span>그뚠이의 업무자동화</span><small>시연</small></Heading>
      <Command key={`${variant}-${phase}`} data-command-bubble>
        <strong>{mode.title}</strong>
        <p>“{command}”</p>
        <span><i aria-hidden="true" /><span>명령을 업무 흐름으로</span><ArrowRight size={14} aria-hidden="true" /></span>
      </Command>
      <Portrait role="img" aria-label={`책상에 발을 올리고 담배를 피우며 ${mode.label}으로 업무를 지시하는 그뚠이. ${variant < 4 ? '서류가 날아와 책상 위에 쌓입니다.' : variant < 8 ? '디지털 화면들이 날아와 모니터 주변에 모입니다.' : '모니터 속 봇들이 순서대로 답장합니다.'}`}>
        {MODES.map(({ id }, index) => <Pose key={id} data-command-pose={id} $active={index === phase}>
          <Image src={`/images/corp/products/automation/geudduni-${id}.png`} alt="" fill sizes="(max-width: 760px) 150px, 300px" unoptimized draggable={false} />
        </Pose>)}
        <ProductAutomationDeskEffects key={`${variant}-${cycle}`} variant={variant} playing={playing} reducedMotion={reducedMotion} />
      </Portrait>
      <Modes role="group" aria-label="명령 방식">
        {MODES.map(({ id, label, icon: Icon }, index) => <span key={id} data-active={index === phase}><Icon size={13} aria-hidden="true" />{label}</span>)}
      </Modes>
      <Note>{variant < 4 ? '서류는 차곡차곡, 내 책상으로.' : variant < 8 ? '필요한 화면이 알아서 연결돼요.' : '모니터 속 봇들이 답장을 보내요.'}</Note>
    </Director>
  );
}

const arrive = keyframes`from { opacity: .45; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); }`;
const breathe = keyframes`0%, 100% { opacity: .45; } 50% { opacity: 1; }`;
const Director = styled.div<{ $playing: boolean; $reducedMotion: boolean }>`
  display: grid; align-content: center; min-width: 0; padding: 8px 0; color: #f3f7ff;
  *, *::before, *::after { animation-play-state: ${({ $playing }) => $playing ? 'running' : 'paused'} !important; }
  ${({ $playing }) => !$playing && css`[data-command-bubble] { animation: none !important; } [data-command-pose] { transition: none !important; }`}
  ${({ $reducedMotion }) => $reducedMotion && css`*, *::before, *::after { animation: none !important; transition: none !important; }`}
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
  @container (max-width: 640px) {
    grid-template-columns: 42% minmax(0, 1fr); grid-template-rows: 1fr auto; column-gap: 12px; padding: 0 0 6px; border-bottom: 1px solid #29445c;
  }
`;
const Heading = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; font-size: 12px; font-weight: 700; color: #a8ceeb;
  small { padding: 2px 5px; border: 1px solid #395671; border-radius: 4px; color: #c4d7e8; font-size: 9px; }
  @container (max-width: 640px) { display: none; }
`;
const Portrait = styled.div`
  position: relative; width: 100%; aspect-ratio: 4 / 3; margin: 18px 0 10px;
  @container (max-width: 640px) { grid-column: 1; grid-row: 1 / 3; align-self: center; margin: 0; }
`;
const Pose = styled.div<{ $active: boolean }>`
  position: absolute; inset: 0; opacity: ${({ $active }) => $active ? 1 : 0}; transition: opacity 500ms ease;
  img { object-fit: contain; object-position: center bottom; }
`;
const Modes = styled.div`
  display: flex; justify-content: space-between; gap: 4px; margin-bottom: 0;
  > span { display: inline-flex; align-items: center; gap: 4px; padding: 5px 6px; border-radius: 5px; font-size: 10px; line-height: 1.4; white-space: nowrap; color: #b7cbe0; background: #10243b; }
  > span[data-active='true'] { color: #071b28; background: #80dfcc; }
  @container (max-width: 640px) { grid-column: 2; grid-row: 2; margin: 6px 0 0; gap: 3px; > span { font-size: 9px; padding: 3px; gap: 2px; svg { display: none; } } }
`;
const Command = styled.div`
  position: relative; min-height: 108px; margin: 0 5px 0 12px; padding: 12px 15px; border-radius: 17px 17px 17px 5px; background: #edf7ef; box-shadow: 0 7px 20px #030d1c30; animation: ${arrive} 400ms ease both;
  &::after { content: ''; position: absolute; bottom: -11px; left: 28px; width: 23px; height: 20px; background: #edf7ef; clip-path: polygon(0 0, 100% 0, 0 100%); }
  strong { display: block; font-size: 11px; font-weight: 600; line-height: 1.4; color: #4e7461; }
  p { min-height: 45px; margin: 6px 0; color: #173e30; font-size: 16px; font-weight: 700; line-height: 1.5; word-break: keep-all; }
  > span { display: flex; align-items: center; gap: 6px; color: #426e58; font-size: 10px; line-height: 1.5; }
  i { width: 5px; height: 5px; flex-shrink: 0; border-radius: 50%; background: #428d6c; animation: ${breathe} 2s ease-in-out infinite; }
  @container (max-width: 640px) {
    grid-column: 2; grid-row: 1; min-height: 0; margin: 0; padding: 5px 9px; border-radius: 12px 12px 12px 3px;
    &::after { left: -10px; bottom: auto; top: 32px; width: 15px; height: 16px; clip-path: polygon(100% 0, 100% 100%, 0 100%); }
    strong { font-size: 9px; } p { min-height: 0; margin: 3px 0; font-size: 12px; } > span { font-size: 8px; gap: 4px; svg { width: 11px; } }
  }
`;
const Note = styled.p`
  margin: 12px 0 0; color: #a6bdd1; font-size: 11px; line-height: 1.5;
  @container (max-width: 640px) { display: none; }
`;
