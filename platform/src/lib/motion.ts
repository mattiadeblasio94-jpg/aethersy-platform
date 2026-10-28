// =============================================================================
// Animazioni condivise (brief §5.7). Centralizza varianti e transizioni di
// framer-motion cosi' le pagine restano coerenti e leggibili.
//
// Tutte le varianti rispettano `prefers-reduced-motion`: quando l'utente ha
// ridotto le animazioni, durate e distanze si azzerano (nessun movimento, solo
// il cambio di stato).
// =============================================================================

import { useReducedMotion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";

/** Transizione base, disattivata se l'utente preferisce meno movimento. */
export function useMotionTransition(base: Transition = { duration: 0.28, ease: "easeOut" }): Transition {
  const reduce = useReducedMotion();
  return reduce ? { duration: 0 } : base;
}

/** Transizione per la pagina: ingresso dall'alto con dissolvenza. */
export function usePageTransition(): Transition {
  return useMotionTransition({ duration: 0.3, ease: "easeOut" });
}

/** Varianti della pagina (fade + leggero slide verticale). */
export function usePageVariants(): Variants {
  const reduce = useReducedMotion();
  return {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduce ? 0 : -8 },
  };
}

/** Varianti per un contenitore che rivela i figli in sequenza (stagger). */
export function useStaggerVariants(stagger = 0.06): Variants {
  const reduce = useReducedMotion();
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: reduce ? 0 : stagger },
    },
  };
}

/** Varianti di un singolo elemento in una griglia animata. */
export function useStaggerItemVariants(): Variants {
  const reduce = useReducedMotion();
  return {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    visible: { opacity: 1, y: 0 },
  };
}
