'use client';

import { useEffect, useRef } from 'react';
import { type VideoStudioClip } from '@/lib/video-studio';

interface VideoPlayerProps {
    clip: VideoStudioClip | null;
    autoPlay?: boolean;
}

export function VideoPlayer({ clip, autoPlay = false }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && clip?.videoUrl) {
            videoRef.current.load();
            if (autoPlay) {
                videoRef.current.play().catch(() => {
                    // Autoplay failed, user interaction needed
                });
            }
        }
    }, [clip?.videoUrl, autoPlay]);

    if (!clip) {
        return (
            <div style={{
                width: '100%',
                height: '300px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                borderRadius: '8px',
                color: '#6c757d',
            }}>
                클립을 선택하여 미리보기를 확인하세요
            </div>
        );
    }

    return (
        <div style={{ width: '100%' }}>
            <div style={{ marginBottom: '10px' }}>
                <h3 style={{ margin: '0 0 5px 0' }}>{clip.title}</h3>
                <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                    상태: {clip.status} | 프롬프트: {clip.prompt}
                </p>
            </div>

            <video
                ref={videoRef}
                controls
                style={{
                    width: '100%',
                    maxHeight: '400px',
                    borderRadius: '8px',
                    backgroundColor: '#000',
                }}
                poster={clip.posterUrl || undefined}
            >
                <source src={clip.videoUrl} type="video/mp4" />
                브라우저가 동영상을 지원하지 않습니다.
            </video>

            {clip.lastFrameUrl && (
                <div style={{ marginTop: '10px' }}>
                    <p style={{ margin: '0 0 5px 0', fontSize: '14px', fontWeight: 'bold' }}>
                        마지막 프레임 (다음 클립 시작점)
                    </p>
                    <img
                        src={clip.lastFrameUrl}
                        alt="마지막 프레임"
                        style={{
                            width: '200px',
                            height: 'auto',
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                        }}
                    />
                </div>
            )}
        </div>
    );
}