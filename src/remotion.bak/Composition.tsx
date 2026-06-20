import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const MyComposition = () => {
    const frame = useCurrentFrame();
    const { fps, durationInFrames, width, height } = useVideoConfig();

    const opacity = interpolate(
        frame,
        [0, 30],
        [0, 1],
        {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
        }
    );

    return (
        <AbsoluteFill
            style={{
                backgroundColor: 'white',
                justifyContent: 'center',
                alignItems: 'center',
                fontSize: 80,
            }}
        >
            <div style={{ opacity }}>
                Hello <strong>Remotion</strong>!
            </div>
            <div style={{ fontSize: 30, marginTop: 20 }}>
                {width}x{height} @ {fps}fps
            </div>
        </AbsoluteFill>
    );
};
