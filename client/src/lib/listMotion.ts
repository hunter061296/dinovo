// Shared enter/exit shape for vertical list rows (Waitlist, Guestbook) — new rows fade/slide in,
// removed rows collapse their height and fade out instead of vanishing instantly. `layout` (set
// on the motion element using this, not here) handles reordering by animating position changes.
export const listRowVariants = {
  initial: { opacity: 0, height: 0, y: -4 },
  animate: { opacity: 1, height: "auto", y: 0 },
  exit: { opacity: 0, height: 0, y: -4 },
};

// Same idea for horizontally-wrapped chips (the reservation book's per-slot items), where a
// height collapse doesn't apply — scale/fade reads as the equivalent "not an instant disappear".
export const listChipVariants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};
