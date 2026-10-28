// =============================================================================
// Accordion accessibile (brief §5.6) usato dalla pagina Aiuto per le FAQ.
// Implementazione senza dipendenze esterne: ogni voce e' un pulsante con
// aria-expanded/aria-controls, animata da framer-motion e con altezza che
// rispetta prefers-reduced-motion (vedi src/lib/motion.ts).
// =============================================================================

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@pv/lib/utils";

export interface AccordionItem {
  id: string;
  question: string;
  answer: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Id dell'elemento aperto di default. */
  defaultOpenId?: string;
  className?: string;
}

/** Elenco di FAQ espandibili, una aperta alla volta. */
export function Accordion({ items, defaultOpenId, className }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const baseId = useId();

  return (
    <ul className={cn("flex flex-col divide-y divide-pv-cyan/10", className)}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <li key={item.id}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenId(isOpen ? null : item.id)}
                className="flex min-h-[44px] w-full items-center justify-between gap-4 py-4 text-left"
              >
                <span className="text-sm font-medium text-pv-ink sm:text-base">
                  {item.question}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-pv-ink-3 transition-transform",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <p className="pb-4 pr-8 text-sm text-pv-ink-2">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
