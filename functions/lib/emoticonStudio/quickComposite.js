"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EFFICIENT_LOCAL_COMPOSITE_VERSION = void 0;
exports.buildEfficientCompositePlan = buildEfficientCompositePlan;
const schema_1 = require("./schema");
const outputPlanPolicy_1 = require("./outputPlanPolicy");
exports.EFFICIENT_LOCAL_COMPOSITE_VERSION = 'efficient-local-composite-v1';
function cleanInstruction(instruction) {
    var _a;
    const withoutProfile = ((_a = instruction.split('[확정 캐릭터 DNA]')[0]) === null || _a === void 0 ? void 0 : _a.trim()) || instruction.trim();
    return withoutProfile.replace(/\s+/g, ' ').slice(0, 320);
}
function inferMotionType(instruction) {
    if (/(점프|뛰어오|폴짝|도약|jump|bounce)/i.test(instruction))
        return 'jump';
    if (/(손.*흔들|인사|안녕|반가|wave|greet)/i.test(instruction))
        return 'wave';
    if (/(달리|뛰어|걷|춤|회전|날아|run|walk|dance|spin|fly)/i.test(instruction))
        return 'dynamic';
    if (/(말하|외치|소리|입.*벌|대사|말풍선|talk|shout|say)/i.test(instruction))
        return 'talk';
    if (/(흔들|부들|화나|분노|아니|고개.*젓|shake|angry)/i.test(instruction))
        return 'shake';
    return 'bob';
}
function defaultBubble() {
    return Object.assign(Object.assign({ text: '', style: 'none', position: 'top', entrance: 'none', font: 'clean' }, schema_1.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS), { timeline: {
            mode: 'full',
            startFrame: 0,
            endFrame: null,
            cues: [],
        } });
}
function normalizeAnimatedBubble(bubble, frameCount) {
    const lastFrame = Math.max(0, frameCount - 1);
    let previousEnd = -1;
    const cues = [...bubble.timeline.cues]
        .sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame)
        .flatMap((cue) => {
        const startFrame = Math.max(previousEnd + 1, Math.min(lastFrame, cue.startFrame));
        const endFrame = Math.max(startFrame, Math.min(lastFrame, cue.endFrame));
        if (startFrame > lastFrame)
            return [];
        previousEnd = endFrame;
        return [Object.assign(Object.assign({}, cue), { startFrame, endFrame })];
    });
    const mode = bubble.timeline.mode === 'cues' && cues.length === 0
        ? 'full'
        : bubble.timeline.mode;
    return Object.assign(Object.assign({}, bubble), { timeline: Object.assign(Object.assign({}, bubble.timeline), { mode, startFrame: Math.min(lastFrame, bubble.timeline.startFrame), endFrame: bubble.timeline.endFrame === null
                ? null
                : Math.min(lastFrame, bubble.timeline.endFrame), cues }) });
}
/**
 * Builds a deterministic plan for the zero-provider fast path. It deliberately
 * describes only pixel-preserving transforms; it must never claim that a new
 * pose, expression, identity, or platform approval was AI-verified.
 */
function buildEfficientCompositePlan(params) {
    var _a;
    const instruction = cleanInstruction(params.request.instruction);
    const isStatic = params.outputProfile.type === 'static';
    const motion = params.request.motionOverride || {
        fps: 8,
        frameCount: 8,
        durationMs: 1000,
    };
    const motionType = inferMotionType(instruction);
    const bubble = normalizeAnimatedBubble(params.request.bubbleOverride || defaultBubble(), motion.frameCount);
    const base = schema_1.emoticonPlanSchema.parse({
        directorSummary: `원본 캐릭터 픽셀을 보존하고 ${motion.frameCount}프레임 로컬 모션과 말풍선을 합성합니다. AI 이미지 생성이나 의미 품질 판정은 수행하지 않습니다.`,
        characterProfile: {
            summary: '사용자가 첨부하고 승인한 캐릭터 원본을 그대로 사용하는 빠른 합성입니다.',
            immutableTraits: ['얼굴, 머리, 의상, 색상과 비율은 입력 이미지의 실제 픽셀을 보존합니다.'],
            palette: [],
            styleRules: ['새 캐릭터 특징을 합성하지 않고 원본 실루엣만 이동, 회전, 확대합니다.'],
            negativeRules: ['AI가 새 포즈나 표정을 만들었다고 주장하지 않습니다.'],
        },
        action: {
            title: (instruction || '빠른 이모티콘 만들기').slice(0, 80),
            emotion: bubble.text || ((_a = bubble.timeline.cues[0]) === null || _a === void 0 ? void 0 : _a.text) ? '대사 표현' : '원본 표정 유지',
            action: (instruction || '원본 캐릭터에 간단한 모션 적용').slice(0, 160),
            intensity: motionType === 'dynamic' || motionType === 'jump' ? 'exaggerated' : 'normal',
            motionType,
            renderMode: isStatic ? 'stable' : 'keyframes',
            durationMs: motion.durationMs,
            frameCount: motion.frameCount,
            fps: motion.fps,
            loopDescription: isStatic
                ? '정지 이미지 한 장으로 출력합니다.'
                : '첫 프레임과 마지막 프레임이 자연스럽게 이어지는 반복 모션입니다.',
            imagePrompt: `사용자 원본 캐릭터를 다시 그리지 않고 투명 캔버스에 배치합니다. 요청: ${instruction}`,
            videoPrompt: `원본 캐릭터 전체를 ${motionType} 모션 프리셋으로 움직이고 지정한 말풍선 타임라인을 합성합니다.`,
            negativePrompt: '새 얼굴, 새 의상, 팔다리 재생성, 배경 장면, 추가 캐릭터, 승인 주장 금지',
            authorizedProps: [],
            motionAccents: [],
        },
        bubble,
        suggestedPresets: [],
    });
    const normalized = (0, outputPlanPolicy_1.normalizeEmoticonPlanForOutputProfile)(base, params.outputProfile);
    return schema_1.emoticonManualStoredPlanSchema.parse(normalized);
}
//# sourceMappingURL=quickComposite.js.map