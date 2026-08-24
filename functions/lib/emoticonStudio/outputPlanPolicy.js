"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmoticonPlanForOutputProfile = normalizeEmoticonPlanForOutputProfile;
/**
 * OpenRouter always returns the rich 8-24 frame planning schema. A verified
 * static output, however, must persist and render as one real frame. Keeping
 * that conversion at the output boundary prevents unnecessary frame calls and
 * makes the stored plan agree with the encoded artifact and technical audit.
 */
function normalizeEmoticonPlanForOutputProfile(plan, outputProfile) {
    var _a, _b;
    if (outputProfile.type !== 'static')
        return plan;
    const cueText = ((_a = plan.bubble.timeline.cues.find((cue) => cue.text.trim())) === null || _a === void 0 ? void 0 : _a.text.trim()) || '';
    const staticBubbleLayers = (_b = plan.bubbleLayers) === null || _b === void 0 ? void 0 : _b.map((bubble) => {
        var _a;
        const layerCueText = ((_a = bubble.timeline.cues.find((cue) => cue.text.trim())) === null || _a === void 0 ? void 0 : _a.text.trim()) || '';
        return Object.assign(Object.assign({}, bubble), { text: bubble.text.trim() || layerCueText, entrance: 'none', timeline: {
                mode: 'full',
                startFrame: 0,
                endFrame: null,
                cues: [],
            } });
    });
    return Object.assign(Object.assign(Object.assign({}, plan), { directorSummary: `${plan.action.title} · ${plan.action.emotion} 표정과 ${plan.action.action} 동작을 한 장의 정지 PNG 대표 포즈로 제작합니다. 애니메이션 프레임이나 반복 재생은 만들지 않습니다.`.slice(0, 320), action: Object.assign(Object.assign({}, plan.action), { motionType: 'bob', renderMode: 'stable', durationMs: 0, frameCount: 1, fps: 1, loopDescription: 'Single static output image.', videoPrompt: 'Static PNG output selected. Do not create an animation timeline or imply multiple frames.' }), bubble: Object.assign(Object.assign({}, plan.bubble), { text: plan.bubble.text.trim() || cueText, entrance: 'none', timeline: {
                mode: 'full',
                startFrame: 0,
                endFrame: null,
                cues: [],
            } }) }), (staticBubbleLayers ? { bubbleLayers: staticBubbleLayers } : {}));
}
//# sourceMappingURL=outputPlanPolicy.js.map