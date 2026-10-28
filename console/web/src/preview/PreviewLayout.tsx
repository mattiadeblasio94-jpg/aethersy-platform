// =============================================================================
// Entry point del layer "Anteprima" dentro la Console.
//
// Le pagine in `src/preview/` provengono da `platform/` (React 18 + Tailwind v3)
// e girano su dati demo (`src/preview/mocks`). Vengono montate sotto `/preview/*`
// dentro la sessione reale della Console: nessun endpoint nuovo, nessun dato
// reale inventato, e un banner permanente che ricorda che si tratta di demo.
// =============================================================================

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Shell } from "@pv/components/layout/Shell";
import { useAuthStore } from "@pv/store/auth";
import { useSession } from "@/lib/query";

/** Allinea il profilo demo al nome/email dell'utente loggato nella Console. */
function useSyncedPreviewUser() {
  const { data: session } = useSession();
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    if (!session) return;
    const name = [session.firstName, session.lastName].filter(Boolean).join(" ");
    const current = useAuthStore.getState().user;
    setUser({
      id: session.id,
      email: session.email,
      name: name || current?.name || session.email,
      avatar: current?.avatar,
      credits: current?.credits ?? 1250,
      plan: current?.plan ?? "pro",
    });
  }, [session, setUser]);
}

/** Banner fisso: identifica il layer demo e riporta alla Console reale. */
function PreviewBanner() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+var(--safe-bottom)+12px)] z-50 flex justify-center lg:bottom-4 lg:left-[calc(var(--drawer-width)+16px)] lg:inset-x-auto">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-pv-orange/40 bg-pv-indigo/95 px-3 py-1.5 text-xs font-medium text-pv-ink shadow-pv-card backdrop-blur">
        <FlaskConical className="h-3.5 w-3.5 text-pv-orange" aria-hidden="true" />
        <span>Anteprima — dati demo</span>
        <Link
          to="/"
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-pv-cyan/15 px-2 py-0.5 text-pv-cyan transition-colors hover:bg-pv-cyan/25"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Console
        </Link>
      </div>
    </div>
  );
}

export function PreviewLayout() {
  useSyncedPreviewUser();

  return (
    <div className="pv-layer min-h-dvh">
      <PreviewBanner />
      <Shell />
    </div>
  );
}
