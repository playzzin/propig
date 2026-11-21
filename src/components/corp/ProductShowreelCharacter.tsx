import type { ComponentProps, CSSProperties } from 'react';
import styled, { keyframes } from 'styled-components';

const actions = {
  tablet: {
    origin: '51% 94%', prepare: 'rotate(-1.3deg)', action: 'translate(1.4%, .45%) rotate(2.1deg)',
    settle: 'rotate(-.7deg)', echo: 'translate(.5%, .2%) rotate(.65deg)',
    x: 67, y: 37, color: '#177768',
  },
  point: {
    origin: '52% 94%', prepare: 'translate(-1.2%, 1%) rotate(-1.7deg)',
    action: 'translate(1.5%, -1.4%) rotate(2.6deg)', settle: 'rotate(-.6deg)', echo: 'rotate(.65deg)',
    x: 92, y: 7, color: '#236fa0',
  },
  approval: {
    origin: '49% 94%', prepare: 'translateY(1%) scaleY(.985) rotate(1.3deg)',
    action: 'translateY(-1.6%) scaleY(1.018) rotate(-2deg)', settle: 'rotate(.6deg)', echo: 'translateY(-.55%)',
    x: 29, y: 16, color: '#177768',
  },
} as const;

type CharacterAction = keyof typeof actions;
type CharacterProps = ComponentProps<'image'> & {
  action: CharacterAction;
  duration?: number;
};

const characterGesture = keyframes`
  0%, 100% { transform: none; }
  16% { transform: var(--character-prepare); animation-timing-function: cubic-bezier(.32, .02, .25, 1); }
  31%, 36% { transform: var(--character-action); }
  48% { transform: var(--character-settle); }
  62% { transform: none; }
  75% { transform: var(--character-echo); }
`;

const gestureAccent = keyframes`
  0%, 25%, 60%, 100% { opacity: 0; transform: scale(.78); }
  34%, 43% { opacity: .9; transform: scale(1); }
  54% { opacity: .1; transform: scale(1.15); }
`;

const Character = styled.svg`
  overflow: visible;

  .showreel-character-movement {
    transform-box: fill-box;
    transform-origin: var(--character-origin);
    animation: ${characterGesture} var(--character-duration) ease-in-out infinite;
  }

  .showreel-character-accent {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: ${gestureAccent} var(--character-duration) ease-out infinite;
  }
`;

function GestureMarks({ action }: { action: CharacterAction }) {
  switch (action) {
    case 'tablet':
      return <><circle r="3.5" /><circle r="6" opacity=".45" /><path d="M0-8v-2m7 3 1.5-1.5" /></>;
    case 'point':
      return <path d="M1-2 4-5M4 0l4-1M3 3l4 1" />;
    case 'approval':
      return <path d="m-5-2 3-3 3 3m-3-3v8M2-7l2-2m-1 9 3-1" />;
  }
}

export function ProductShowreelCharacter({ action, duration = 6, x, y, width, height, preserveAspectRatio, href, ...imageProps }: CharacterProps) {
  const motion = actions[action];
  const style = {
    '--character-origin': motion.origin,
    '--character-prepare': motion.prepare,
    '--character-action': motion.action,
    '--character-settle': motion.settle,
    '--character-echo': motion.echo,
    '--character-duration': `${duration}s`,
  } as CSSProperties;

  return (
    <Character x={x} y={y} width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio={preserveAspectRatio} style={style} pointerEvents="none">
      <image {...imageProps} className="showreel-character-movement" data-character-action={action} href={href} width="100" height="100" />
      <g className="motion-only" transform={`translate(${motion.x} ${motion.y})`}>
        <g className="showreel-character-accent" fill="none" stroke={motion.color} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
          <GestureMarks action={action} />
        </g>
      </g>
    </Character>
  );
}
