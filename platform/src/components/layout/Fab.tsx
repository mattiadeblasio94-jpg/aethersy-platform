import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Megaphone, Plus, Send, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

/**
 * Floating Action Button (brief §2.1): 56x56, gradiente accent, elevazione 8px.
 * Centrato sopra la bottom navigation su mobile; l'azione apre il menu rapido.
 */
export function Fab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const actions = [
    { id: "post", label: "Nuovo Post", icon: Sparkles, to: "/social-media" },
    { id: "agent", label: "Attiva Agente", icon: Sparkles, to: "/agents" },
    { id: "campaign", label: "Nuova Campagna", icon: Megaphone, to: "/ads" },
    { id: "outreach", label: "Avvia Outreach", icon: Send, to: "/outreach" },
  ];

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.94 }}
        aria-label="Azioni rapide"
        className={cn(
          "gradient-accent fixed left-1/2 z-50 flex h-14 w-14 -translate-x-1/2 items-center justify-center",
          "rounded-full text-accent-foreground shadow-fab lg:hidden",
        )}
        style={{ bottom: "calc(var(--bottom-nav-height) + var(--safe-bottom) + 8px)" }}
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </motion.button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Azioni rapide"
        description="Cosa vuoi fare adesso?"
        size="sm"
      >
        <div className="flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(action.to);
              }}
              className="flex items-center gap-3 rounded-lg border border-secondary/10 bg-primary/40 px-4 py-3 text-left text-sm font-medium text-text-primary transition-colors hover:border-secondary/40 hover:bg-bg-hover"
            >
              <action.icon className="h-5 w-5 text-secondary" aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
