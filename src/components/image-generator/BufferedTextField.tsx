'use client';

import {
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
    type InputHTMLAttributes,
    type TextareaHTMLAttributes,
} from 'react';

type BufferedTextValueOptions = {
    value: string;
    onCommit: (value: string) => void;
    delayMs?: number;
};

function useBufferedTextValue({
    value,
    onCommit,
    delayMs = 500,
}: BufferedTextValueOptions) {
    const [draftValue, setDraftValue] = useState(value);
    const [isFocused, setIsFocused] = useState(false);
    const valueRef = useRef(value);
    const draftValueRef = useRef(value);
    const onCommitRef = useRef(onCommit);
    const isDirtyRef = useRef(false);

    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    useEffect(() => {
        onCommitRef.current = onCommit;
    }, [onCommit]);

    const flush = useCallback(() => {
        if (!isDirtyRef.current) return;

        const nextValue = draftValueRef.current;
        isDirtyRef.current = false;
        if (nextValue !== valueRef.current) {
            onCommitRef.current(nextValue);
        }
    }, []);

    useEffect(() => {
        if (!isDirtyRef.current) return undefined;

        const timer = window.setTimeout(flush, delayMs);
        return () => window.clearTimeout(timer);
    }, [delayMs, draftValue, flush]);

    useEffect(() => () => flush(), [flush]);

    return {
        displayValue: isFocused ? draftValue : value,
        flush,
        handleBlur: () => {
            setIsFocused(false);
            flush();
        },
        handleChange: (nextValue: string) => {
            draftValueRef.current = nextValue;
            isDirtyRef.current = nextValue !== valueRef.current;
            setDraftValue(nextValue);
        },
        handleFocus: () => {
            draftValueRef.current = valueRef.current;
            isDirtyRef.current = false;
            setDraftValue(valueRef.current);
            setIsFocused(true);
        },
    };
}

export type BufferedTextInputProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'defaultValue' | 'onBlur' | 'onChange' | 'onFocus' | 'value'
> & BufferedTextValueOptions;

export const BufferedTextInput = memo(function BufferedTextInput({
    value,
    onCommit,
    delayMs,
    ...props
}: BufferedTextInputProps) {
    const field = useBufferedTextValue({ value, onCommit, delayMs });

    return (
        <input
            {...props}
            value={field.displayValue}
            onChange={(event) => field.handleChange(event.target.value)}
            onFocus={field.handleFocus}
            onBlur={field.handleBlur}
        />
    );
});

export type BufferedTextareaProps = Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'defaultValue' | 'onBlur' | 'onChange' | 'onFocus' | 'value'
> & BufferedTextValueOptions;

export const BufferedTextarea = memo(function BufferedTextarea({
    value,
    onCommit,
    delayMs,
    ...props
}: BufferedTextareaProps) {
    const field = useBufferedTextValue({ value, onCommit, delayMs });

    return (
        <textarea
            {...props}
            value={field.displayValue}
            onChange={(event) => field.handleChange(event.target.value)}
            onFocus={field.handleFocus}
            onBlur={field.handleBlur}
        />
    );
});
