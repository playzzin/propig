/** CSS-only SVG effects share the showcase's pause and reduced-motion controls. */
type SignalPathProps = {
  d: string;
  color?: string;
  delay?: number;
  duration?: number;
  reverse?: boolean;
};

export function SignalPath({ d, color = '#93c5fd', delay = 0, duration = 2.8, reverse = false }: SignalPathProps) {
  const timing = { animationDelay: `${delay}s`, animationDuration: `${duration}s`, animationDirection: reverse ? 'reverse' as const : 'normal' as const };
  return (
    <g className="motion-only" data-motion-effect="signal" fill="none" stroke={color} strokeLinecap="round">
      <path className="signal-packet signal-glow" d={d} pathLength="100" strokeWidth="9" style={timing} />
      <path className="signal-packet" d={d} pathLength="100" strokeWidth="3" style={timing} />
    </g>
  );
}

type SignalPingProps = {
  x: number;
  y: number;
  color?: string;
  delay?: number;
  duration?: number;
  radius?: number;
};

export function SignalPing({ x, y, color = '#5eead4', delay = 0, duration = 3.2, radius = 10 }: SignalPingProps) {
  return (
    <g className="motion-only" data-motion-effect="ping" transform={`translate(${x} ${y})`} fill="none" stroke={color}>
      <circle className="signal-ring" r={radius} strokeWidth="1.5" style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }} />
      <circle className="signal-ring" r={radius} strokeWidth=".8" style={{ animationDelay: `${delay + .4}s`, animationDuration: `${duration}s` }} />
    </g>
  );
}

export function ReactionBurst({ x, y, color = '#93c5fd', delay = 0, duration = 4 }: Omit<SignalPingProps, 'radius'>) {
  return (
    <g className="motion-only" data-motion-effect="reaction" transform={`translate(${x} ${y})`}>
      <g className="reaction-burst" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}>
        <path d="M0-16v-7M0 16v7M-16 0h-7M16 0h7M-12-12l-5-5M12 12l5 5M12-12l5-5M-12 12l-5 5" />
      </g>
    </g>
  );
}
