import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Megaphone, Plus, Send, Sparkles } from "lucide-react";
import { Modal } from "@pv/components/ui/Modal";
import { cn } from "@pv/lib/utils";

/**
 * Floating Action Button (brief §2.1): 56x56, gradiente accent, elevazione 8px.
 * Centrato sopra la bottom navigation su mobile; l'azione apre il menu rapido.
 */
export function Fab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const actions = [
    { id: "post", label: "Nuovo Post", icon: Sparkles, to: "/preview/social-media" },
    { id: "agent", label: "Attiva Agente", icon: Sparkles, to: "/preview/agents" },
    { id: "campaign", label: "Nuova Campagna", icon: Megaphone, to: "/preview/ads" },
    { id: "outreach", label: "Avvia Outreach", icon: Send, to: "/preview/outreach" },
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
          "rounded-full text-pv-accent-ink shadow-pv-fab lg:hidden",
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
              className="flex items-center gap-3 rounded-lg border border-pv-cyan/10 bg-pv-indigo/40 px-4 py-3 text-left text-sm font-medium text-pv-ink transition-colors hover:border-pv-cyan/40 hover:bg-pv-hover"
            >
              <action.icon className="h-5 w-5 text-pv-cyan" aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
