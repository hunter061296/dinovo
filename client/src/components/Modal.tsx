import { motion } from "motion/react";
import type { FormEventHandler, MouseEventHandler, ReactNode } from "react";
import { DURATION, useMotionDuration } from "../lib/motion";

// Shared backdrop + panel motion so every modal in the app (wrap the conditional that renders one
// of these in <AnimatePresence> at the call site so the exit animation actually plays) opens and
// closes identically. See client/src/lib/useReducedMotion.ts for how reduced-motion is handled.

interface BackdropProps {
  onClick?: MouseEventHandler<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}

export function ModalBackdrop({ onClick, className, children }: BackdropProps) {
  const duration = useMotionDuration(DURATION.fast);
  return (
    <motion.div
      className={className ?? "fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"}
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

// Shared X-close button for every modal header, so closing one is always a single click in the
// same corner rather than "keep clicking Cancel/Back until it's gone" (the wizard especially).
export function ModalCloseButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className={
        className ??
        "shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      }
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
      </svg>
    </button>
  );
}

interface PanelProps {
  as?: "div" | "form";
  className: string;
  children: ReactNode;
  onSubmit?: FormEventHandler;
  onClick?: MouseEventHandler;
}

export function ModalPanel({ as = "div", className, children, onSubmit, onClick }: PanelProps) {
  const duration = useMotionDuration(DURATION.normal);
  const variants = {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
  };
  const transition = { duration, ease: "easeOut" as const };

  if (as === "form") {
    return (
      <motion.form className={className} onSubmit={onSubmit} onClick={onClick} transition={transition} {...variants}>
        {children}
      </motion.form>
    );
  }
  return (
    <motion.div className={className} onClick={onClick} transition={transition} {...variants}>
      {children}
    </motion.div>
  );
}
