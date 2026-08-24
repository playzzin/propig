'use client';

import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import styled from 'styled-components';

const Guide = styled.details`
  width: min(1120px, calc(100% - 24px));
  margin: 12px auto 0;
  overflow: hidden;
  border: 1px solid #d8dee9;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 7px 22px rgba(16,24,40,.045);

  summary {
    display: flex;
    min-height: 48px;
    align-items: center;
    gap: 9px;
    padding: 8px 12px;
    color: #344054;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  summary:focus-visible { outline: 3px solid rgba(49,85,198,.2); outline-offset: -3px; }
  summary > span { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 9px; background: #eef2ff; color: #4338ca; }
  summary strong { font-size: 12px; }
  summary small { margin-left: auto; color: #667085; font-size: 10px; }
  &[open] summary { border-bottom: 1px solid #e4e7ec; background: #fbfcff; }

  @media (max-width: 620px) {
    summary small { overflow: hidden; max-width: 54%; text-overflow: ellipsis; white-space: nowrap; }
  }
`;

const Steps = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin: 0;
  padding: 12px;
  list-style: none;

  li { display: grid; grid-template-columns: 28px minmax(0,1fr); gap: 8px; align-items: start; padding: 11px; border: 1px solid #eaecf0; border-radius: 11px; background: #fff; }
  li[data-current='true'] { border-color: #9eaeeb; background: #f5f7ff; }
  li > span { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 9px; background: #f2f4f7; color: #475467; font-size: 10px; font-weight: 900; }
  li[data-current='true'] > span { background: #3155c6; color: #fff; }
  strong { display: block; color: #344054; font-size: 11px; }
  small { display: block; margin-top: 3px; color: #667085; font-size: 9px; line-height: 1.5; }

  @media (max-width: 680px) { grid-template-columns: 1fr; }
`;

const AdvancedHint = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0 12px 12px;
  padding: 10px 11px;
  border-radius: 10px;
  background: #f8fafc;
  color: #475467;
  font-size: 10px;
  line-height: 1.5;
  svg { flex: 0 0 auto; margin-top: 1px; color: #3155c6; }
`;

export function StudioUsageGuide({ currentStep, manual }: { currentStep: number; manual: boolean }) {
  const currentLabel = currentStep === 0 ? '원본과 캐릭터 준비' : currentStep === 1 ? '프레임 제작·편집' : '결과 검토·내보내기';
  return (
    <Guide>
      <summary><span><CircleHelp size={16} /></span><strong>이 페이지 사용법</strong><small>현재: {currentLabel} · 눌러서 전체 순서 보기</small></summary>
      <Steps>
        <li data-current={currentStep === 0}><span>1</span><div><strong>준비</strong><small>{manual ? '사진·시트를 가져오면 바로 제작으로 이동합니다.' : '캐릭터 특징을 확인하고 맞으면 승인합니다.'}</small></div></li>
        <li data-current={currentStep === 1}><span>2</span><div><strong>제작</strong><small>{manual ? '프레임 순서·시간·전환을 편집합니다.' : '장면을 말로 요청하고 동작표 확인 후 생성합니다.'}</small></div></li>
        <li data-current={currentStep === 2}><span>3</span><div><strong>검토·내보내기</strong><small>기술 규격과 플랫폼 확인을 구분해 보고 원하는 형식을 내려받습니다.</small></div></li>
      </Steps>
      <AdvancedHint><SlidersHorizontal size={14} /><span><strong>고급 설정도 이 페이지 안에 있습니다.</strong> 생성 화면의 `고급 생성 설정`에서 플랫폼·프레임·재생 시간·품질·형식을, 편집 화면의 하단 도구에서 타이밍·전환·말풍선·화질을 펼쳐 조정하세요.</span></AdvancedHint>
    </Guide>
  );
}
