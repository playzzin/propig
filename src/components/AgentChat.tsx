'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
    role: 'user' | 'agent';
    content: string;
    timestamp: Date;
    logs?: string[];
    data?: unknown;
}

interface AgentResponse {
    success: boolean;
    data: unknown;
    logs: string[];
    error?: {
        code: string;
        message: string;
    };
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export default function AgentChat() {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'agent',
            content: '안녕하세요! AI 에이전트입니다. 무엇을 도와드릴까요?\n\n예시:\n- "TypeScript Counter 클래스를 만들어줘"\n- "React Button 컴포넌트 생성해줘"\n- "시스템 상태 확인해줘"',
            timestamp: new Date(),
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMessage: Message = {
            role: 'user',
            content: input,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'orchestrator',
                    inputs: {
                        command: 'generate',
                        payload: { userInput: input }
                    }
                })
            });

            const result: AgentResponse = await response.json();

            const dataRecord = isPlainRecord(result.data) ? result.data : null;
            const finalCode = dataRecord && typeof dataRecord.finalCode === 'string' ? dataRecord.finalCode : undefined;
            const iterations = dataRecord && typeof dataRecord.iterations === 'number' ? dataRecord.iterations : undefined;

            const reviewRecord = dataRecord && isPlainRecord(dataRecord.review) ? dataRecord.review : null;
            const score = reviewRecord && typeof reviewRecord.score === 'number' ? reviewRecord.score : undefined;

            const agentMessage: Message = {
                role: 'agent',
                content: result.success
                    ? `✅ 코드 생성 완료!\n\n\`\`\`typescript\n${finalCode || '코드를 생성했습니다.'}\n\`\`\`\n\n**품질 점수**: ${(score ?? 'N/A')}/100\n**자동 수정 횟수**: ${iterations ?? 0}회`
                    : `❌ 오류 발생: ${result.error?.message || '알 수 없는 오류'}`,
                timestamp: new Date(),
                logs: result.logs,
                data: result.data
            };

            setMessages(prev => [...prev, agentMessage]);
        } catch (error) {
            const errorMessage: Message = {
                role: 'agent',
                content: `❌ 요청 실패: ${String(error)}`,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-base)',
            overflow: 'hidden'
        }}>
            {/* Chat Messages */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            gap: '8px'
                        }}
                    >
                        {/* Message Bubble */}
                        <div style={{
                            maxWidth: '75%',
                            background: msg.role === 'user'
                                ? 'linear-gradient(135deg, var(--primary), var(--primary-dark))'
                                : 'var(--bg-card)',
                            border: msg.role === 'agent' ? '1px solid var(--border-subtle)' : 'none',
                            borderRadius: '16px',
                            padding: '12px 16px',
                            boxShadow: msg.role === 'user' ? '0 0 20px var(--primary-glow)' : 'none'
                        }}>
                            <div style={{
                                fontSize: '0.7rem',
                                color: msg.role === 'user' ? 'rgba(255,255,255,0.8)' : 'var(--text-dim)',
                                marginBottom: '4px',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}>
                                {msg.role === 'user' ? '👤 You' : '🤖 Agent'}
                            </div>

                            <div style={{
                                color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                                fontSize: '0.95rem',
                                lineHeight: '1.5',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}>
                                {msg.content}
                            </div>

                            <div style={{
                                fontSize: '0.75rem',
                                color: msg.role === 'user' ? 'rgba(255,255,255,0.6)' : 'var(--text-dim)',
                                marginTop: '8px'
                            }}>
                                {msg.timestamp.toLocaleTimeString('ko-KR', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        </div>

                        {/* Logs (Agent only) */}
                        {msg.role === 'agent' && msg.logs && msg.logs.length > 0 && (
                            <details style={{
                                maxWidth: '75%',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '12px',
                                padding: '8px 12px',
                                fontSize: '0.8rem',
                                color: 'var(--text-muted)',
                                cursor: 'pointer'
                            }}>
                                <summary style={{ fontWeight: '600', marginBottom: '8px' }}>
                                    📋 실행 로그 ({msg.logs.length}개)
                                </summary>
                                <div style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                    lineHeight: '1.4',
                                    maxHeight: '200px',
                                    overflowY: 'auto'
                                }}>
                                    {msg.logs.map((log, i) => (
                                        <div key={i} style={{ marginBottom: '2px' }}>
                                            {log}
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                ))}

                {loading && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        color: 'var(--text-muted)',
                        fontSize: '0.9rem'
                    }}>
                        <div className="loading-dots">⏳</div>
                        <span>Agent가 작업 중입니다...</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                padding: '16px 24px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-end'
            }}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="메시지를 입력하세요... (Shift+Enter: 줄바꿈)"
                    disabled={loading}
                    style={{
                        flex: 1,
                        minHeight: '48px',
                        maxHeight: '120px',
                        padding: '12px 16px',
                        background: 'var(--bg-elevated)',
                        border: isInputFocused
                            ? '1px solid var(--primary)'
                            : '1px solid var(--border-medium)',
                        borderRadius: '12px',
                        color: 'var(--text-main)',
                        fontSize: '0.95rem',
                        resize: 'none',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                    }}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                />

                <button
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                    style={{
                        padding: '12px 24px',
                        background: loading || !input.trim()
                            ? 'var(--bg-elevated)'
                            : 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                        border: 'none',
                        borderRadius: '12px',
                        color: 'white',
                        cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '0.95rem',
                        fontWeight: '700',
                        transition: 'all 0.2s',
                        boxShadow: loading || !input.trim() ? 'none' : '0 0 15px var(--primary-glow)',
                        minWidth: '80px',
                        height: '48px'
                    }}
                >
                    {loading ? '⏳' : '전송'}
                </button>
            </div>
        </div>
    );
}
