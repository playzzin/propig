import { emoticonStoredPlanSchema } from './schema';

export type EmoticonRecoveryMode =
    | 'generate'
    | 'plan'
    | 'profile'
    | 'sheet_plan'
    | 'import_frames'
    | 'rerender'
    | 'repair_frame';
export type EmoticonRecoveryStartStage = 'analysis' | 'static-render' | 'repair-generation';

/** The recovery path accepts persisted static, animated, and manual plans. */
export function parseEmoticonRecoveryPlan(value: unknown) {
    return emoticonStoredPlanSchema.safeParse(value);
}

export function canonicalEmoticonRecoveryStartStage(
    mode: EmoticonRecoveryMode,
): EmoticonRecoveryStartStage {
    if (mode === 'rerender' || mode === 'import_frames') return 'static-render';
    if (mode === 'repair_frame') return 'repair-generation';
    return 'analysis';
}
