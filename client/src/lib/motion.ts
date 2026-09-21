import { usePrefersReducedMotion } from "./useReducedMotion";

// Shared timing so every animated surface (modals, lists, the floor plan pulse) moves at the
// same fast, consistent pace rather than six slightly different implementations. Kept under
// ~250ms per the "fast tool, not a showcase" brief.
export const DURATION = {
  fast: 0.15,
  normal: 0.2,
} as const;

// Near-instant rather than zero: prefers-reduced-motion should drop the animated in-between,
// not skip the state transition (end state still needs to visibly apply).
const REDUCED_DURATION = 0.01;

export function useMotionDuration(duration: number = DURATION.normal): number {
  const reduced = usePrefersReducedMotion();
  return reduced ? REDUCED_DURATION : duration;
}
