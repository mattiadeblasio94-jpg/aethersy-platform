// =============================================================================
// Store di autenticazione (zustand) — Stadio P2.2: sessione REALE.
//
// L'autenticazione vive in un cookie httpOnly emesso dal BFF Console
// (`aethersy_session`), condiviso fra Console e Platform quando
// `CONSOLE_COOKIE_DOMAIN=.aethersy.online`. Qui NON si salva alcun token: lo
// store e' solo una cache del profilo per la UI, ricostruita via
// `GET /api/auth/session` al boot (`bootstrap()`).
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { platformApi, type SessionUser } from "@/lib/platform-api";
import type { User } from "@/lib/types";

type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: User | null;
  /** true = l'utente e' amministratore (pannello di controllo visibile). */
  isAdmin: boolean;
  status: AuthStatus;
  /** Comodita' per la guardia di rotta: true quando c'e' un profilo valido. */
  isAuthenticated: boolean;
  /** Carica la sessione corrente dal cookie (idempotente, safe al reload). */
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /** Allinea i crediti mostrati in UI con il saldo reale del tenant. */
  setCredits: (credits: number) => void;
}

function toUser(session: SessionUser): User {
  const name = [session.firstName, session.lastName].filter(Boolean).join(" ") || session.email;
  return { id: session.id, name, email: session.email, credits: 0, plan: "starter" };
}

let inflight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      status: "idle",
      isAuthenticated: false,
      isAdmin: false,

      bootstrap: async () => {
        if (inflight) return inflight;
        inflight = (async () => {
          set({ status: "loading" });
          try {
            const session = await platformApi.getSession();
            set({
              user: toUser(session),
              status: "authenticated",
              isAuthenticated: true,
              isAdmin: Boolean(session.isAdmin),
            });
            // Il saldo crediti non fa parte della sessione: lo leggiamo a parte.
            platformApi
              .getBalance()
              .then((b) => get().setCredits(b.available))
              .catch(() => {});
          } catch (err) {
            // 401 = nessuna sessione valida: utente anonimo, non un errore fatale.
            set({ user: null, status: "anonymous", isAuthenticated: false, isAdmin: false });
          } finally {
            inflight = null;
          }
        })();
        return inflight;
      },

      login: async (email, password) => {
        const session = await platformApi.login(email, password);
        set({
          user: toUser(session),
          status: "authenticated",
          isAuthenticated: true,
          isAdmin: Boolean(session.isAdmin),
        });
        platformApi
          .getBalance()
          .then((b) => get().setCredits(b.available))
          .catch(() => {});
      },

      register: async (input) => {
        await platformApi.register(input);
        // Dopo la registrazione l'utente e' invitato ad accedere.
      },

      logout: async () => {
        try {
          await platformApi.logout();
        } finally {
          set({ user: null, status: "anonymous", isAuthenticated: false, isAdmin: false });
        }
      },

      setCredits: (credits) =>
        set((state) => (state.user ? { user: { ...state.user, credits } } : {})),
    }),
    {
      name: "aethersy-auth",
      // Cache del solo profilo (mai credenziali): al reload `bootstrap()`
      // riconferma la sessione dal cookie.
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
