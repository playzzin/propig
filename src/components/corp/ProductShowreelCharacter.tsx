import { useId, type ComponentProps, type CSSProperties } from 'react';
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
  lamp: {
    origin: '45% 33%', prepare: 'rotate(-1.2deg)', action: 'translate(.4%, 1%) rotate(2.3deg)',
    settle: 'rotate(.9deg)', echo: 'translateY(.3%)',
    x: 80, y: 36, color: '#eab05a',
  },
  headphones: {
    origin: '53% 87%', prepare: 'rotate(2.7deg)', action: 'rotate(-3.8deg)',
    settle: 'rotate(2deg)', echo: 'rotate(-2.2deg)',
    x: 65, y: 24, color: '#205e90',
  },
  camera: {
    origin: '50% 83%', prepare: 'translate(.5%, -1.4%) rotate(-1.9deg)',
    action: 'translate(-.4%, 1%) rotate(.9deg)', settle: 'translateY(-.55%) rotate(-.45deg)', echo: 'rotate(.4deg)',
    x: 73, y: 38, color: '#27668c',
  },
  clock: {
    origin: '52% 34%', prepare: 'translateY(-.6%) rotate(-1.2deg)',
    action: 'translate(.65%, 1%) rotate(2.4deg)', settle: 'rotate(.7deg)', echo: 'translateY(.4%)',
    x: 61, y: 70, color: '#894713',
  },
} as const;

type CharacterAction = keyof typeof actions;
type CharacterProps = ComponentProps<'image'> & {
  action: CharacterAction;
  duration?: number;
};

// The desk and tabletop clock are part of the image. The head moves inside a feathered mask.
const seatedHead = {
  lamp: { cx: 43, cy: 19, rx: 19, ry: 23 },
  clock: { cx: 52, cy: 21, rx: 19, ry: 24 },
} as const;

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

  [data-reduced-motion='true'] & .showreel-character-base { mask: none; }
  [data-reduced-motion='true'] & .showreel-character-head { display: none; }

  @media (prefers-reduced-motion: reduce) {
    .showreel-character-base { mask: none; }
    .showreel-character-head { display: none; }
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
    case 'lamp':
      return <path d="M-5 2-18 15M0 2l-8 17M4 3v14" opacity=".7" />;
    case 'headphones':
      return <path d="M3-5a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16" />;
    case 'camera':
      return <path d="M-7-4v-3h3m8 0h3v3m0 8v3H4m-8 0h-3V4M0-2v4m-2-2h4" />;
    case 'clock':
      return <path d="M0-7v-3m5 5 3-3m-13 3-3-3M7 0h4m-18 0h-4" />;
  }
}

export function ProductShowreelCharacter({ action, duration = 6, x, y, width, height, preserveAspectRatio, href, ...imageProps }: CharacterProps) {
  const id = useId();
  const motion = actions[action];
  const head = action === 'lamp' || action === 'clock' ? seatedHead[action] : null;
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
      {head && <defs>
        <radialGradient id={`${id}-head-edge`}>
          <stop offset=".87" stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-base`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="white" />
          <ellipse cx={head.cx} cy={head.cy} rx={head.rx - 2} ry={head.ry - 2} fill="black" />
        </mask>
        <mask id={`${id}-head`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <ellipse {...head} fill={`url(#${id}-head-edge)`} />
        </mask>
      </defs>}
      <image
        {...imageProps}
        className={head ? 'showreel-character-base' : 'showreel-character-movement'}
        data-character-action={action}
        href={href}
        width="100"
        height="100"
        mask={head ? `url(#${id}-base)` : undefined}
      />
      {head && <g className="showreel-character-head" mask={`url(#${id}-head)`}>
        <image className="showreel-character-movement" data-character-head={action} href={href} width="100" height="100" />
      </g>}
      <g className="motion-only" transform={`translate(${motion.x} ${motion.y})`}>
        <g className="showreel-character-accent" fill="none" stroke={motion.color} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
          <GestureMarks action={action} />
        </g>
      </g>
    </Character>
  );
}
