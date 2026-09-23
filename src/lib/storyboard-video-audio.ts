export const STORYBOARD_VIDEO_AUDIO_MODES = ['silent', 'ambient', 'dialogue'] as const;
export const STORYBOARD_VIDEO_DURATION_OPTIONS = [3, 4, 5, 6, 8, 10, 12, 15] as const;

export type StoryboardVideoAudioMode = (typeof STORYBOARD_VIDEO_AUDIO_MODES)[number];

const AUDIO_DIRECTION_HEADER = 'Audio direction:';
const DIALOGUE_LEAD_SECONDS = 0.8;
const DIALOGUE_UNITS_PER_SECOND = 4.1;
const DIALOGUE_QUOTE_PAIRS = [
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
    ['"', '"'],
] as const;

export type StoryboardDialogueTiming = {
    speechUnits: number;
    capacityUnits: number;
    estimatedSeconds: number;
    recommendedDurationSeconds: number;
    fitsSupportedDuration: boolean;
    loadRatio: number;
    tone: 'empty' | 'ready' | 'tight' | 'over';
};

function countDialogueSpeechUnits(dialogue: string): number {
    const hangulAndNumbers = dialogue.match(/[\p{Script=Hangul}\p{N}]/gu)?.length || 0;
    const latinUnits = (dialogue.match(/[A-Za-z]+/g) || []).reduce(
        (sum, word) => sum + Math.max(1, Math.ceil(word.length / 4)),
        0,
    );
    return hangulAndNumbers + latinUnits;
}

/**
 * Storyboard planners sometimes return a direction plus a quoted line in the
 * legacy dialogueOrCaption field. Video providers must receive only the words
 * the visible speaker should say; action remains in narrativeBeat.
 */
export function normalizeStoryboardSpokenDialogue(
    dialogue: string | null | undefined,
): string {
    const normalized = dialogue?.replace(/\s+/g, ' ').trim() || '';
    if (!normalized) return '';

    for (const [openQuote, closeQuote] of DIALOGUE_QUOTE_PAIRS) {
        const start = normalized.indexOf(openQuote);
        if (start < 0) continue;
        const end = normalized.indexOf(closeQuote, start + openQuote.length);
        if (end <= start) continue;
        const quoted = normalized
            .slice(start + openQuote.length, end)
            .replace(/\s+/g, ' ')
            .trim();
        if (quoted) return quoted;
    }

    const speakerLabel = normalized.match(
        /^(?:대사|나레이션|내레이션|딸|아빠|엄마|아이|남자|여자|화자|인물)\s*[:：]\s*(.+)$/u,
    );
    return (speakerLabel?.[1] || normalized)
        .replace(/^["“”「」『』]+|["“”「」『』]+$/gu, '')
        .trim();
}

function removePreparedAudioDirection(prompt: string): string {
    const marker = `\n\n${AUDIO_DIRECTION_HEADER}\n`;
    const markerIndex = prompt.indexOf(marker);
    return (markerIndex >= 0 ? prompt.slice(0, markerIndex) : prompt).trim();
}

export function analyzeStoryboardDialogueTiming(
    dialogue: string | null | undefined,
    durationSeconds: number,
): StoryboardDialogueTiming {
    const normalized = normalizeStoryboardSpokenDialogue(dialogue);
    const safeDuration = Math.max(1, Math.min(15, Math.round(durationSeconds)));
    const speechUnits = countDialogueSpeechUnits(normalized);
    const capacityUnits = Math.max(
        1,
        Math.floor(Math.max(0.5, safeDuration - DIALOGUE_LEAD_SECONDS) * DIALOGUE_UNITS_PER_SECOND),
    );
    const estimatedSeconds = speechUnits
        ? Number((speechUnits / DIALOGUE_UNITS_PER_SECOND + DIALOGUE_LEAD_SECONDS).toFixed(1))
        : 0;
    const requiredDuration = Math.max(3, Math.ceil(estimatedSeconds));
    const recommendedDurationSeconds = STORYBOARD_VIDEO_DURATION_OPTIONS.find(
        (duration) => duration >= requiredDuration,
    ) || STORYBOARD_VIDEO_DURATION_OPTIONS[STORYBOARD_VIDEO_DURATION_OPTIONS.length - 1];
    const maxSupportedDuration = STORYBOARD_VIDEO_DURATION_OPTIONS[STORYBOARD_VIDEO_DURATION_OPTIONS.length - 1];
    const maxCapacityUnits = Math.floor(
        (maxSupportedDuration - DIALOGUE_LEAD_SECONDS) * DIALOGUE_UNITS_PER_SECOND,
    );
    const fitsSupportedDuration = speechUnits <= maxCapacityUnits;
    const loadRatio = speechUnits ? speechUnits / capacityUnits : 0;
    const tone = !speechUnits
        ? 'empty' as const
        : loadRatio > 1
            ? 'over' as const
            : loadRatio >= 0.82
                ? 'tight' as const
                : 'ready' as const;

    return {
        speechUnits,
        capacityUnits,
        estimatedSeconds,
        recommendedDurationSeconds,
        fitsSupportedDuration,
        loadRatio,
        tone,
    };
}

export function resolveStoryboardVideoAudioMode(params: {
    audioMode?: StoryboardVideoAudioMode | null;
    generateAudio?: boolean | null;
}): StoryboardVideoAudioMode {
    if (params.audioMode) return params.audioMode;
    return params.generateAudio ? 'ambient' : 'silent';
}

export function appendStoryboardVideoAudioDirection(
    prompt: string,
    audioMode: StoryboardVideoAudioMode,
    dialogue?: string | null,
    durationSeconds?: number | null,
    voiceLock?: string | null,
): string {
    const normalizedPrompt = removePreparedAudioDirection(prompt.trim());
    if (audioMode === 'silent') return normalizedPrompt;

    if (audioMode === 'ambient') {
        return [
            normalizedPrompt,
            AUDIO_DIRECTION_HEADER,
            'Generate synchronized production audio that matches the visible location, movement, materials, and camera distance. Keep it natural and restrained. Do not invent narration, spoken dialogue, or background music.',
        ].join('\n\n');
    }

    const exactDialogue = normalizeStoryboardSpokenDialogue(dialogue);
    const timing = analyzeStoryboardDialogueTiming(exactDialogue, durationSeconds || 6);
    return [
        normalizedPrompt,
        AUDIO_DIRECTION_HEADER,
        `Generate native synchronized dialogue audio. The visible on-screen speaker must say exactly this Korean dialogue without translating, paraphrasing, or adding words: ${JSON.stringify(exactDialogue)}.`,
        `Deliver the complete line naturally within ${durationSeconds || 6} seconds, including a short visual lead-in and a clean reaction beat after speaking. The estimated spoken length is about ${timing.estimatedSeconds.toFixed(1)} seconds.`,
        voiceLock?.trim()
            ? `Character voice continuity lock:\n${voiceLock.trim()}`
            : 'Use one stable Korean speaker voice identity for this character and keep it consistent across every storyboard scene.',
        'Keep the speaking face clearly visible in a stable front or three-quarter medium close-up whenever the storyboard allows it. The lips, jaw, and cheeks must remain unobstructed; avoid extreme profile angles, fast head turns, hand-over-mouth gestures, cuts, and camera shake while speaking.',
        'Match every visible mouth movement to the spoken phonemes with natural timing, breathing, expression, and room acoustics. Keep dialogue clean and centered over subtle room tone. Do not add narration, extra speakers, background music, subtitles, captions, or readable text.',
    ].join('\n\n');
}
