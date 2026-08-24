'use client';

import { Images, Layers3, Play, ShieldCheck } from 'lucide-react';
import styled from 'styled-components';
import type { EmoticonProject } from '@/schemas/emoticonProject';
import { getEmoticonPlatformProfile } from '@/lib/emoticonPlatformProfiles';
import {
  ManualFrameImportPanel,
  type ManualFrameImportSubmit,
} from '../ManualFrameImportPanel';
import type { ManualStartInput } from './StudioStartHub';

const Root = styled.section`
  display: grid;
  gap: 16px;
  padding: clamp(14px, 2.5vw, 24px);
  border: 1px solid #d8dee9;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 18px 50px rgba(16,24,40,.08);
`;
const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 4px 2px 2px;
  h2 { display: flex; align-items: center; gap: 9px; margin: 0; color: #101828; font-size: 20px; letter-spacing: -.025em; }
  p { margin: 6px 0 0; color: #667085; font-size: 13px; line-height: 1.55; }
  > span { flex: 0 0 auto; padding: 7px 10px; border: 1px solid #abe2c5; border-radius: 999px; background: #ecfdf3; color: #067647; font-size: 11px; font-weight: 850; }
  @media (max-width: 640px) { flex-direction: column; gap: 10px; }
`;
const Steps = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  li { display: flex; min-height: 54px; align-items: center; gap: 9px; padding: 10px 12px; border: 1px solid #e4e7ec; border-radius: 12px; background: #f9fafb; color: #475467; font-size: 11px; font-weight: 750; }
  li > span { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border-radius: 9px; background: #eef2ff; color: #4338ca; }
  @media (max-width: 620px) {
    gap: 5px;
    li { min-height: 68px; flex-direction: column; align-items: flex-start; gap: 5px; padding: 8px; font-size: 10px; }
    li > span { width: 24px; height: 24px; }
  }
`;

export function ManualAnimationWorkspace({
  project,
  seed,
  pending,
  onSubmit,
  onSeedConsumed,
}: {
  project: EmoticonProject;
  seed: ManualStartInput | null;
  pending: boolean;
  onSubmit: (input: ManualFrameImportSubmit) => Promise<boolean>;
  onSeedConsumed: () => void;
}) {
  const profile = getEmoticonPlatformProfile(project.platform, 'animated');
  const submit = async (input: ManualFrameImportSubmit) => {
    const result = await onSubmit(input);
    if (result) onSeedConsumed();
    return result;
  };

  return (
    <Root data-testid="manual-animation-workspace">
      <Header>
        <div><h2>{seed?.spriteSheet ? <Layers3 size={21} /> : <Images size={21} />} 제작 작업공간</h2><p>원본은 그대로 보존됩니다. 프레임을 구성하고 실제 재생을 확인한 뒤 검토·내보내기로 이동합니다.</p></div>
        <span><ShieldCheck size={13} /> AI 생성 비용 없음</span>
      </Header>
      <Steps aria-label="제작 작업 안내">
        <li><span><Images size={15} /></span>가져오기·분할</li>
        <li><span><Play size={15} /></span>순서·시간</li>
        <li><span><ShieldCheck size={15} /></span>검사·내보내기</li>
      </Steps>
      <ManualFrameImportPanel
        projectType="animated"
        allowedFormats={profile.allowedFormats}
        defaultFormats={[profile.preferredFormat]}
        disabled={pending}
        isSubmitting={pending}
        hasBubble={false}
        hasImageEdit={false}
        showReusableFrames={false}
        draftKey={`v2-manual-start:${project.id}:${project.items[0]?.id || 'item'}`}
        initialFiles={seed?.files || []}
        initialSpriteSheet={seed?.spriteSheet || null}
        onSubmit={submit}
      />
    </Root>
  );
}
