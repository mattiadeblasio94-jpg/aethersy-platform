// =============================================================================
// Wrapper animati condivisi (brief §5.7). Incapsulano framer-motion con le
// varianti di src/lib/motion.ts, cosi' le pagine ottengono transizioni e
// micro-interazioni coerenti senza duplicare configurazione.
// =============================================================================

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  usePageTransition,
  usePageVariants,
  useStaggerItemVariants,
  useStaggerVariants,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Contenitore di pagina: anima l'ingresso/uscita di una route. Va usato come
 * radice del contenuto di ogni pagina per far funzionare AnimatePresence.
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const variants = usePageVariants();
  const transition = usePageTransition();

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={transition}
      className={cn("flex flex-col gap-6", className)}
    >
      {children}
    </motion.div>
  );
}

/** Contenitore con reveal in sequenza dei figli (griglie di card). */
export function StaggerGroup({
  children,
  className,
  stagger,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const variants = useStaggerVariants(stagger);

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Singolo elemento di una StaggerGroup. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const variants = useStaggerItemVariants();
  return (
    <motion.div variants={variants} className={className}>
      {children}
    </motion.div>
  );
}
