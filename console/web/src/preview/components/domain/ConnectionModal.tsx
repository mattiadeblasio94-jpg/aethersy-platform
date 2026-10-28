import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { Platform, PlatformId } from "@pv/lib/types";
import { Modal } from "@pv/components/ui/Modal";
import { Button } from "@pv/components/ui/Button";

export interface ConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: Platform | null;
  /** Risolve quando il collegamento mock e' concluso. */
  onConfirm: (platformId: PlatformId) => Promise<void>;
  onSuccess?: (platformId: PlatformId) => void;
}

type Step = "intro" | "connecting" | "done";

/**
 * Flusso guidato di collegamento di una piattaforma (brief §3.1).
 * Stadio A: simulazione in tre passi (intro -> collegamento -> conferma).
 * Endpoint reale: OAuth per piattaforma; qui non viene mai richiesta una
 * password e nessun dato sensibile viene mostrato o salvato.
 */
export function ConnectionModal({
  open,
  onOpenChange,
  platform,
  onConfirm,
  onSuccess,
}: ConnectionModalProps) {
  const [step, setStep] = useState<Step>("intro");

  // Reset del flusso ogni volta che cambia la piattaforma o si riapre.
  useEffect(() => {
    if (open) setStep("intro");
  }, [open, platform?.id]);

  if (!platform) return null;

  async function handleConnect() {
    if (!platform) return;
    setStep("connecting");
    try {
      await onConfirm(platform.id);
      setStep("done");
      onSuccess?.(platform.id);
    } catch {
      setStep("intro");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Collega ${platform.name}`}
      description="Autorizza Aethersy a gestire i contenuti di questa piattaforma."
      size="sm"
      hideClose={step === "connecting"}
      footer={
        step === "done" ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={step === "connecting"}
            >
              Annulla
            </Button>
            <Button
              variant="primary"
              loading={step === "connecting"}
              onClick={handleConnect}
              disabled={step === "connecting"}
            >
              {step === "connecting" ? "Collegamento in corso" : "Autorizza"}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {step === "done" ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-pv-success" aria-hidden="true" />
            <p className="text-sm text-pv-ink-2">
              {platform.name} e' stata collegata correttamente.
            </p>
          </>
        ) : (
          <>
            <img src={platform.icon} alt="" width={40} height={40} className="h-10 w-10" />
            {step === "connecting" ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-pv-cyan" aria-hidden="true" />
                <p className="text-sm text-pv-ink-2">
                  Stiamo verificando le autorizzazioni…
                </p>
              </>
            ) : (
              <p className="text-sm text-pv-ink-2">
                Verrai reindirizzato su {platform.name} per confermare l'accesso. Aethersy
                non vede mai la tua password.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
