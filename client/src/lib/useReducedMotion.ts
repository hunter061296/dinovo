import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// Backs every animation in the app (modals, list transitions, the floor plan's remote-update
// pulse) so "respect prefers-reduced-motion" is enforced in one place rather than checked ad hoc.
// When set, callers should collapse durations near-instant rather than skip the transition
// entirely — end state should still apply immediately, just without the animated in-between.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false));

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  return reduced;
}
