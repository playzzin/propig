import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

/** Only the visible number animates; assistive technology always gets the real value. */
export default function OfficeMetric({
  label,
  value,
  unit,
  detail,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  unit: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
  onClick: () => void;
}) {
  const number = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  useEffect(() => {
    const node = number.current;
    if (!node) return;
    const from = previous.current;
    previous.current = value;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      node.textContent = String(value);
    };
    const begin = () => {
      if (motion.matches || from === value) {
        finish();
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / 440);
        node.textContent = String(
          Math.round(from + (value - from) * (1 - (1 - progress) ** 3)),
        );
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        begin();
        observer.disconnect();
      }
    });
    observer.observe(node);
    motion.addEventListener("change", finish);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", finish);
    };
  }, [value]);
  return (
    <button
      className={`office-metric metric-${tone}`}
      onClick={onClick}
      aria-label={`${label} ${value}${unit}, ${detail}`}
    >
      <span className="metric-label">
        <Icon size={17} />
        {label}
      </span>
      <strong aria-hidden="true">
        <span ref={number}>{value}</span>
        <small>{unit}</small>
      </strong>
      <span className="metric-detail">
        {detail}
        <span aria-hidden="true">↗</span>
      </span>
    </button>
  );
}
