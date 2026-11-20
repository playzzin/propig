"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeVideoSpokenDialogue = normalizeVideoSpokenDialogue;
const DIALOGUE_QUOTE_PAIRS = [
    ["“", "”"],
    ["「", "」"],
    ["『", "』"],
    ['"', '"'],
];
function normalizeVideoSpokenDialogue(dialogue) {
    const normalized = (dialogue === null || dialogue === void 0 ? void 0 : dialogue.replace(/\s+/g, " ").trim()) || "";
    if (!normalized)
        return "";
    for (const [openQuote, closeQuote] of DIALOGUE_QUOTE_PAIRS) {
        const start = normalized.indexOf(openQuote);
        if (start < 0)
            continue;
        const end = normalized.indexOf(closeQuote, start + openQuote.length);
        if (end <= start)
            continue;
        const quoted = normalized
            .slice(start + openQuote.length, end)
            .replace(/\s+/g, " ")
            .trim();
        if (quoted)
            return quoted;
    }
    const speakerLabel = normalized.match(/^(?:대사|나레이션|내레이션|딸|아빠|엄마|아이|남자|여자|화자|인물)\s*[:：]\s*(.+)$/u);
    return ((speakerLabel === null || speakerLabel === void 0 ? void 0 : speakerLabel[1]) || normalized)
        .replace(/^["“”「」『』]+|["“”「」『』]+$/gu, "")
        .trim();
}
//# sourceMappingURL=dialogue.js.map