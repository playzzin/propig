const MAX_EXPRESSION_LENGTH = 256;
const MAX_INPUT_LENGTH = 512;
const MAX_PARSE_DEPTH = 32;

export class ArithmeticExpressionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ArithmeticExpressionError';
    }
}

function assertFinite(value: number): number {
    if (!Number.isFinite(value)) {
        throw new ArithmeticExpressionError('Result must be a finite number');
    }
    return value;
}

export function evaluateArithmeticExpression(expression: string): number {
    if (typeof expression !== 'string') {
        throw new ArithmeticExpressionError('Expression must be a string');
    }

    if (expression.length > MAX_INPUT_LENGTH) {
        throw new ArithmeticExpressionError('Expression input is too long');
    }

    const source = expression.replace(/\s+/g, '');
    if (source.length === 0 || source.length > MAX_EXPRESSION_LENGTH) {
        throw new ArithmeticExpressionError('Expression length is invalid');
    }

    let index = 0;

    const parseNumber = (): number => {
        const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(index));
        if (!match) {
            throw new ArithmeticExpressionError(`Expected a number at position ${index}`);
        }

        index += match[0].length;
        return assertFinite(Number(match[0]));
    };

    const parseFactor = (depth: number): number => {
        if (depth > MAX_PARSE_DEPTH) {
            throw new ArithmeticExpressionError('Expression nesting is too deep');
        }

        const token = source[index];
        if (token === '+' || token === '-') {
            index += 1;
            const value = parseFactor(depth + 1);
            return token === '-' ? -value : value;
        }

        if (token === '(') {
            index += 1;
            const value = parseExpression(depth + 1);
            if (source[index] !== ')') {
                throw new ArithmeticExpressionError(`Expected a closing parenthesis at position ${index}`);
            }
            index += 1;
            return value;
        }

        return parseNumber();
    };

    const parseTerm = (depth: number): number => {
        let value = parseFactor(depth);

        while (source[index] === '*' || source[index] === '/') {
            const operator = source[index];
            index += 1;
            const right = parseFactor(depth);
            if (operator === '/' && right === 0) {
                throw new ArithmeticExpressionError('Division by zero is not allowed');
            }
            value = assertFinite(operator === '*' ? value * right : value / right);
        }

        return value;
    };

    function parseExpression(depth: number): number {
        let value = parseTerm(depth);

        while (source[index] === '+' || source[index] === '-') {
            const operator = source[index];
            index += 1;
            const right = parseTerm(depth);
            value = assertFinite(operator === '+' ? value + right : value - right);
        }

        return value;
    }

    const result = parseExpression(0);
    if (index !== source.length) {
        throw new ArithmeticExpressionError(`Unexpected token at position ${index}`);
    }

    return assertFinite(result);
}
