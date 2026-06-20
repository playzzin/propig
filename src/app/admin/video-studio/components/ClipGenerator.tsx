'use client';

import { useState } from 'react';
import { type VideoStudioClip } from '@/lib/video-studio';

interface ClipGeneratorProps {
    onGenerate: (params: {
        prompt: string;
        referenceClipId?: string;
        title?: string;
    }) => Promise<unknown>;
    clips: VideoStudioClip[];
    working: boolean;
}

export function ClipGenerator({ onGenerate, clips, working }: ClipGeneratorProps) {
    const [prompt, setPrompt] = useState('');
    const [title, setTitle] = useState('');
    const [referenceClipId, setReferenceClipId] = useState<string>('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        await onGenerate({
            prompt: prompt.trim(),
            referenceClipId: referenceClipId || undefined,
            title: title.trim() || undefined,
        });

        setPrompt('');
        setTitle('');
        setReferenceClipId('');
    };

    return (
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h3>새 클립 생성</h3>
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>
                        클립 제목 (선택사항)
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="클립 제목을 입력하세요"
                        disabled={working}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                </div>

                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>
                        프롬프트 *
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="동영상 생성 프롬프트를 입력하세요 (예: 숲 속을 걷는 여우)"
                        rows={4}
                        disabled={working}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
                        required
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>
                        이전 클립 이어하기 (선택사항)
                    </label>
                    <select
                        value={referenceClipId}
                        onChange={(e) => setReferenceClipId(e.target.value)}
                        disabled={working}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    >
                        <option value="">새로운 클립 시작</option>
                        {clips.map(clip => (
                            <option key={clip.id} value={clip.id}>
                                {clip.title} (마지막 프레임 사용)
                            </option>
                        ))}
                    </select>
                    {referenceClipId && (
                        <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            선택된 클립의 마지막 프레임을 시작점으로 사용하여 자연스럽게 이어집니다.
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={working || !prompt.trim()}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: working ? '#ccc' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: working ? 'not-allowed' : 'pointer',
                        width: '100%',
                    }}
                >
                    {working ? '생성 중...' : '동영상 생성'}
                </button>
            </form>

            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                <h4 style={{ margin: '0 0 10px 0' }}>팁</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                    <li>생성되는 동영상은 최대 8초 길이입니다</li>
                    <li>이전 클립을 선택하면 시각적 연속성이 유지됩니다</li>
                    <li>자세한 묘사로 더 좋은 결과를 얻을 수 있습니다</li>
                </ul>
            </div>
        </div>
    );
}