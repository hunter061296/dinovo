import { usePrefersReducedMotion } from "../lib/useReducedMotion";

interface Props {
  className?: string;
  style?: React.CSSProperties;
}

// A single pulsing gray block, sized via className/style by the caller. Pages compose these into
// shapes that echo their real content (table outlines, list rows) instead of plain "Loading..."
// text, so the page feels like it's already rendering rather than blank-then-pop.
export function Skeleton({ className = "", style }: Props) {
  const reduced = usePrefersReducedMotion();
  return <div className={`${reduced ? "" : "animate-pulse"} rounded-md bg-gray-200 dark:bg-gray-700 ${className}`} style={style} />;
}
