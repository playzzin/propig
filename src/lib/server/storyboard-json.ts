const MAX_STORYBOARD_JSON_RESPONSE_LENGTH = 2_000_000;
const MAX_STORYBOARD_JSON_NESTING_DEPTH = 128;

function removeTrailingJsonCommas(content: string): string {
    let result = '';
    let isEscaped = false;
    let isInsideString = false;

    for (let index = 0; index < content.length; index += 1) {
        const character = content[index];

        if (isInsideString) {
            result += character;
            if (isEscaped) {
                isEscaped = false;
            } else if (character === '\\') {
                isEscaped = true;
            } else if (character === '"') {
                isInsideString = false;
            }
            continue;
        }

        if (character === '"') {
            isInsideString = true;
            result += character;
            continue;
        }

        if (character === ',') {
            let nextIndex = index + 1;
            while (/\s/.test(content[nextIndex] || '')) nextIndex += 1;
            if (content[nextIndex] === '}' || content[nextIndex] === ']') continue;
        }

        result += character;
    }

    return result;
}

function extractFirstJsonObjectText(content: string): string {
    if (content.length > MAX_STORYBOARD_JSON_RESPONSE_LENGTH) {
        throw new Error('AI response is too large to parse safely.');
    }

    const cleaned = content
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    const start = cleaned.indexOf('{');

    if (start < 0) {
        throw new Error('AI response does not contain a JSON object.');
    }

    let depth = 0;
    let isEscaped = false;
    let isInsideString = false;

    for (let index = start; index < cleaned.length; index += 1) {
        const character = cleaned[index];

        if (isInsideString) {
            if (isEscaped) {
                isEscaped = false;
            } else if (character === '\\') {
                isEscaped = true;
            } else if (character === '"') {
                isInsideString = false;
            }
            continue;
        }

        if (character === '"') {
            isInsideString = true;
        } else if (character === '{') {
            depth += 1;
            if (depth > MAX_STORYBOARD_JSON_NESTING_DEPTH) {
                throw new Error('AI response JSON nesting is too deep.');
            }
        } else if (character === '}') {
            depth -= 1;
            if (depth === 0) {
                return removeTrailingJsonCommas(cleaned.slice(start, index + 1));
            }
        }
    }

    throw new Error('AI response does not contain a complete JSON object.');
}

export function parseStoryboardJsonObject(content: string): unknown {
    let parsed: unknown;
    try {
        parsed = JSON.parse(extractFirstJsonObjectText(content)) as unknown;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('AI response')) {
            throw error;
        }
        throw new Error('AI response contains invalid JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('AI response JSON must be an object.');
    }

    return parsed;
}
