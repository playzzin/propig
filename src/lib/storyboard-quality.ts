import type { ImageStoryboard, ImageStoryboardScene } from '@/schemas/imageStoryboard';

export type StoryboardQualityIssueCode =
    | 'scene-order'
    | 'duplicate-scene-id'
    | 'duplicate-scene-title'
    | 'duplicate-image-prompt'
    | 'missing-image-prompt'
    | 'missing-visual-prompt'
    | 'missing-negative-prompt'
    | 'missing-transition'
    | 'missing-motion-prompt'
    | 'dialogue-audio-mismatch'
    | 'continuity-bible-incomplete'
    | 'final-manifest-missing'
    | 'unsafe-markup';

export type StoryboardQualityIssue = {
    code: StoryboardQualityIssueCode;
    severity: 'warning' | 'error';
    sceneId?: string;
    label: string;
    description: string;
};

export type StoryboardQualityReport = {
    issues: StoryboardQualityIssue[];
    errorCount: number;
    warningCount: number;
    score: number;
};

const UNSAFE_MARKUP_PATTERN = /<\/?(?:script|style|iframe|object|embed)\b|(?:javascript|data):/i;

function normalizedText(value: string): string {
    return value.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function issue(
    code: StoryboardQualityIssueCode,
    severity: StoryboardQualityIssue['severity'],
    label: string,
    description: string,
    scene?: ImageStoryboardScene,
): StoryboardQualityIssue {
    return {
        code,
        severity,
        label,
        description,
        ...(scene ? { sceneId: scene.id } : {}),
    };
}

function sceneTextValues(scene: ImageStoryboardScene): string[] {
    return [
        scene.title,
        scene.narrativeBeat,
        scene.dialogueOrCaption,
        scene.visualPrompt,
        scene.imagePrompt,
        scene.continuityAnchor,
        scene.transition,
        scene.negativePrompt,
        scene.video.motionPrompt,
    ];
}

export function inspectStoryboardQuality(
    storyboard: ImageStoryboard,
): StoryboardQualityReport {
    const issues: StoryboardQualityIssue[] = [];
    const sceneIds = new Set<string>();
    const titles = new Map<string, ImageStoryboardScene>();
    const prompts = new Map<string, ImageStoryboardScene>();

    storyboard.scenes.forEach((scene, index) => {
        const sceneLabel = `${index + 1}번 장면`;
        if (scene.order !== index + 1) {
            issues.push(issue(
                'scene-order',
                'error',
                `${sceneLabel} 순서`,
                '장면 순서가 목록 순서와 달라 최종 영상 조립 순서가 달라질 수 있습니다.',
                scene,
            ));
        }
        if (sceneIds.has(scene.id)) {
            issues.push(issue(
                'duplicate-scene-id',
                'error',
                `${sceneLabel} 식별자`,
                '같은 장면 식별자가 중복되었습니다. 편집·생성 결과가 다른 장면에 적용될 수 있습니다.',
                scene,
            ));
        }
        sceneIds.add(scene.id);

        const title = normalizedText(scene.title);
        if (title && titles.has(title)) {
            issues.push(issue(
                'duplicate-scene-title',
                'warning',
                `${sceneLabel} 제목`,
                '다른 장면과 제목이 같아 제작 단계에서 장면을 구분하기 어렵습니다.',
                scene,
            ));
        }
        titles.set(title, scene);

        const prompt = normalizedText(scene.imagePrompt);
        if (!scene.imagePrompt.trim()) {
            issues.push(issue(
                'missing-image-prompt',
                'error',
                `${sceneLabel} 이미지 프롬프트`,
                '이미지 생성에 필요한 프롬프트가 비어 있습니다.',
                scene,
            ));
        } else if (prompts.has(prompt)) {
            issues.push(issue(
                'duplicate-image-prompt',
                'warning',
                `${sceneLabel} 이미지 프롬프트`,
                '다른 장면과 이미지 프롬프트가 거의 같아 반복 장면이 만들어질 수 있습니다.',
                scene,
            ));
        }
        prompts.set(prompt, scene);

        if (!scene.visualPrompt.trim()) {
            issues.push(issue(
                'missing-visual-prompt',
                'warning',
                `${sceneLabel} 장면 설명`,
                '장면 설명이 비어 있어 검토와 재설계 기준이 부족합니다.',
                scene,
            ));
        }
        if (!scene.negativePrompt.trim()) {
            issues.push(issue(
                'missing-negative-prompt',
                'warning',
                `${sceneLabel} 네거티브 프롬프트`,
                '원하지 않는 인물·문자·워터마크를 막을 기준이 없습니다.',
                scene,
            ));
        }
        if (index > 0 && !scene.transition.trim()) {
            issues.push(issue(
                'missing-transition',
                'warning',
                `${sceneLabel} 전환`,
                '앞 장면과 자연스럽게 이어질 전환 지시가 없습니다.',
                scene,
            ));
        }
        if (scene.video.status !== 'brief' && !scene.video.motionPrompt.trim()) {
            issues.push(issue(
                'missing-motion-prompt',
                'warning',
                `${sceneLabel} 영상 움직임`,
                '영상 제작 상태지만 움직임 프롬프트가 비어 있습니다.',
                scene,
            ));
        }
        if (scene.dialogueOrCaption.trim() && scene.video.audioMode === 'silent') {
            issues.push(issue(
                'dialogue-audio-mismatch',
                'warning',
                `${sceneLabel} 대사·오디오`,
                '대사가 있지만 오디오가 꺼져 있습니다. 립싱크 또는 내레이션 설정을 확인하세요.',
                scene,
            ));
        }
        if (sceneTextValues(scene).some((value) => UNSAFE_MARKUP_PATTERN.test(value))) {
            issues.push(issue(
                'unsafe-markup',
                'error',
                `${sceneLabel} 입력 내용`,
                '실행될 수 있는 마크업 또는 URL 형식이 포함되어 있어 저장·생성을 막아야 합니다.',
                scene,
            ));
        }
    });

    const continuityFields = [
        storyboard.artDirection,
        storyboard.characterContinuity,
        storyboard.settingContinuity,
        storyboard.colorAndLighting,
    ];
    if (continuityFields.filter((value) => value.trim()).length < 4) {
        issues.push(issue(
            'continuity-bible-incomplete',
            'warning',
            '연속성 가이드',
            '아트·인물·공간·조명 기준을 모두 입력하면 이미지와 영상의 일관성이 높아집니다.',
        ));
    }

    if (
        storyboard.videoProduction.finalStatus === 'completed' &&
        !storyboard.videoProduction.finalAssemblyManifest
    ) {
        issues.push(issue(
            'final-manifest-missing',
            'error',
            '최종 영상 조립 기록',
            '완성본은 있지만 조립 순서 기록이 없습니다. 다시 병합하기 전에 장면 순서를 확인하세요.',
        ));
    }

    const errorCount = issues.filter((item) => item.severity === 'error').length;
    const warningCount = issues.length - errorCount;
    return {
        issues,
        errorCount,
        warningCount,
        score: Math.max(0, 100 - errorCount * 22 - warningCount * 6),
    };
}
