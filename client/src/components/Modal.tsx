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
