"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEmoticonRecoveryPlan = parseEmoticonRecoveryPlan;
exports.canonicalEmoticonRecoveryStartStage = canonicalEmoticonRecoveryStartStage;
const schema_1 = require("./schema");
/** The recovery path accepts persisted static, animated, and manual plans. */
function parseEmoticonRecoveryPlan(value) {
    return schema_1.emoticonStoredPlanSchema.safeParse(value);
}
function canonicalEmoticonRecoveryStartStage(mode) {
    if (mode === 'rerender' || mode === 'import_frames')
        return 'static-render';
    if (mode === 'repair_frame')
        return 'repair-generation';
    return 'analysis';
}
//# sourceMappingURL=recoveryPolicy.js.map