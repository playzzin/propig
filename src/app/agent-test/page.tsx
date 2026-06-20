'use client';

import { useState } from 'react';

interface AgentResponse {
    success: boolean;
    data: unknown;
    logs: string[];
    error?: {
        code: string;
        message: string;
    };
}

export default function AgentTestPage() {
    const [result, setResult] = useState<AgentResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [userInput, setUserInput] = useState('Create a TypeScript Counter class');

    const callAgent = async (command: string, payload?: Record<string, unknown>) => {
        setLoading(true);
        try {
            const response = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'orchestrator',
                    inputs: { command, payload }
                })
            });

            const data = await response.json();
            setResult(data);
        } catch (error) {
            setResult({
                success: false,
                data: null,
                logs: [],
                error: {
                    code: 'FETCH_ERROR',
                    message: String(error)
                }
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-base)',
            color: 'var(--text-main)',
            padding: '40px 20px'
        }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <h1 style={{
                    fontSize: '2rem',
                    marginBottom: '8px',
                    color: 'var(--primary-light)'
                }}>
                    🤖 Agent System Test
                </h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                    Multi-Agent Workflow 시스템 테스트 페이지
                </p>

                {/* Command Buttons */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    marginBottom: '32px'
                }}>
                    <button
                        onClick={() => callAgent('echo', { text: 'Hello Agent!' })}
                        disabled={loading}
                        style={{
                            padding: '12px 20px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: '12px',
                            color: 'var(--text-main)',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '0.9rem',
                            fontWeight: '600'
                        }}
                    >
                        📢 Echo Test
                    </button>

                    <button
                        onClick={() => callAgent('firebase_admin_health')}
                        disabled={loading}
                        style={{
                            padding: '12px 20px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: '12px',
                            color: 'var(--text-main)',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '0.9rem',
                            fontWeight: '600'
                        }}
                    >
                        🔥 Firebase Health
                    </button>

                    <button
                        onClick={() => callAgent('extract_logs')}
                        disabled={loading}
                        style={{
                            padding: '12px 20px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: '12px',
                            color: 'var(--text-main)',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '0.9rem',
                            fontWeight: '600'
                        }}
                    >
                        📊 Extract Logs
                    </button>

                    <button
                        onClick={() => callAgent('clear_cache')}
                        disabled={loading}
                        style={{
                            padding: '12px 20px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: '12px',
                            color: 'var(--text-main)',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '0.9rem',
                            fontWeight: '600'
                        }}
                    >
                        🗑️ Clear Cache
                    </button>
                </div>

                {/* Code Generation */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '20px',
                    padding: '24px',
                    marginBottom: '24px'
                }}>
                    <h2 style={{
                        fontSize: '1.2rem',
                        marginBottom: '16px',
                        color: 'var(--text-bright)'
                    }}>
                        🎨 Code Generation (Generate Workflow)
                    </h2>

                    <textarea
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="예: Create a React Button component with TypeScript"
                        style={{
                            width: '100%',
                            minHeight: '100px',
                            padding: '12px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: '12px',
                            color: 'var(--text-main)',
                            fontSize: '0.9rem',
                            fontFamily: 'monospace',
                            marginBottom: '12px',
                            resize: 'vertical'
                        }}
                    />

                    <button
                        onClick={() => callAgent('generate', { userInput })}
                        disabled={loading || !userInput.trim()}
                        style={{
                            padding: '12px 24px',
                            background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                            border: 'none',
                            borderRadius: '12px',
                            color: 'white',
                            cursor: loading || !userInput.trim() ? 'not-allowed' : 'pointer',
                            fontSize: '1rem',
                            fontWeight: '700',
                            width: '100%',
                            boxShadow: loading ? 'none' : '0 0 20px var(--primary-glow)'
                        }}
                    >
                        {loading ? '⏳ Processing...' : '🚀 Generate Code'}
                    </button>
                </div>

                {/* Loading Indicator */}
                {loading && (
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--primary)',
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '24px',
                        textAlign: 'center',
                        color: 'var(--primary-light)'
                    }}>
                        ⏳ Agent가 작업 중입니다...
                    </div>
                )}

                {/* Result Display */}
                {result && (
                    <div style={{
                        background: 'var(--bg-card)',
                        border: `1px solid ${result.success ? 'var(--primary)' : '#f87171'}`,
                        borderRadius: '20px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '16px 24px',
                            background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                                {result.success ? '✅ Success' : '❌ Error'}
                            </h3>
                            <button
                                onClick={() => setResult(null)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '1.2rem'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Logs */}
                        {result.logs && result.logs.length > 0 && (
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                                <h4 style={{
                                    margin: '0 0 12px 0',
                                    fontSize: '0.9rem',
                                    color: 'var(--text-dim)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    📋 Logs
                                </h4>
                                <div style={{
                                    background: 'var(--bg-base)',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    fontFamily: 'monospace',
                                    fontSize: '0.85rem'
                                }}>
                                    {result.logs.map((log, idx) => (
                                        <div key={idx} style={{ marginBottom: '4px', color: 'var(--text-muted)' }}>
                                            {log}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Data */}
                        <div style={{ padding: '16px 24px' }}>
                            <h4 style={{
                                margin: '0 0 12px 0',
                                fontSize: '0.9rem',
                                color: 'var(--text-dim)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}>
                                📦 Response Data
                            </h4>
                            <pre style={{
                                background: 'var(--bg-base)',
                                color: 'var(--text-main)',
                                padding: '16px',
                                borderRadius: '8px',
                                overflow: 'auto',
                                maxHeight: '400px',
                                fontSize: '0.85rem',
                                fontFamily: 'monospace',
                                margin: 0
                            }}>
                                {JSON.stringify(result.data, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
