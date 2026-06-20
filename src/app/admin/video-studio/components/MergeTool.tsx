'use client';

import { useState } from 'react';
import { type VideoStudioClip } from '@/lib/video-studio';

interface MergeToolProps {
    clips: VideoStudioClip[];
    onMerge: (clipIds: string[], title: string) => Promise<unknown>;
    working: boolean;
}

export function MergeTool({ clips, onMerge, working }: MergeToolProps) {
    const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
    const [mergeTitle, setMergeTitle] = useState('');

    const handleClipToggle = (clipId: string) => {
        setSelectedClipIds(prev =>
            prev.includes(clipId)
                ? prev.filter(id => id !== clipId)
                : [...prev, clipId]
        );
    };

    const handleMerge = async () => {
        if (selectedClipIds.length < 2) return;
        if (!mergeTitle.trim()) return;

        await onMerge(selectedClipIds, mergeTitle.trim());
        setSelectedClipIds([]);
        setMergeTitle('');
    };

    const selectedClips = clips.filter(clip => selectedClipIds.includes(clip.id));

    return (
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h3>장편 동영상 합치기</h3>

            <div style={{ marginBottom: '15px' }}>
                <h4>합칠 클립 선택 ({selectedClipIds.length}개 선택됨)</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px', padding: '10px' }}>
                    {clips.map(clip => (
                        <label key={clip.id} style={{ display: 'block', marginBottom: '5px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={selectedClipIds.includes(clip.id)}
                                onChange={() => handleClipToggle(clip.id)}
                                disabled={working}
                                style={{ marginRight: '8px' }}
                            />
                            <span style={{ fontSize: '14px' }}>
                                {clip.title} ({clip.status})
                            </span>
                        </label>
                    ))}
                </div>
            </div>

            {selectedClips.length > 0 && (
                <div style={{ marginBottom: '15px' }}>
                    <h4>선택된 클립 순서</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {selectedClips.map((clip, index) => (
                            <div key={clip.id} style={{
                                padding: '8px',
                                backgroundColor: '#f8f9fa',
                                borderRadius: '4px',
                                fontSize: '14px'
                            }}>
                                {index + 1}. {clip.title}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>
                    합쳐진 동영상 제목
                </label>
                <input
                    type="text"
                    value={mergeTitle}
                    onChange={(e) => setMergeTitle(e.target.value)}
                    placeholder="장편 동영상 제목을 입력하세요"
                    disabled={working}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
            </div>

            <button
                onClick={handleMerge}
                disabled={working || selectedClipIds.length < 2 || !mergeTitle.trim()}
                style={{
                    padding: '10px 20px',
                    backgroundColor: (working || selectedClipIds.length < 2 || !mergeTitle.trim()) ? '#ccc' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (working || selectedClipIds.length < 2 || !mergeTitle.trim()) ? 'not-allowed' : 'pointer',
                    width: '100%',
                }}
            >
                {working ? '합치는 중...' : '장편 동영상 생성'}
            </button>

            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                <h4 style={{ margin: '0 0 10px 0' }}>주의사항</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                    <li>최소 2개 이상의 클립을 선택해야 합니다</li>
                    <li>클립들은 선택된 순서대로 합쳐집니다</li>
                    <li>합치기 작업은 시간이 걸릴 수 있습니다</li>
                </ul>
            </div>
        </div>
    );
}