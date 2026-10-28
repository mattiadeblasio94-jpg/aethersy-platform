// =============================================================================
// Store di autenticazione (zustand).
//
// Stadio A: auth MOCK. Nessun token, nessuna password persistita: solo il
// profilo utente derivato dai mock. Quando il backend reale sara' disponibile,
// login/logout chiameranno l'endpoint e la sessione vivra' in un cookie httpOnly
// (come in console/web), senza storage di token in localStorage.
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { currentUser } from "@/mocks";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string) => void;
  register: (name: string, email: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      // Endpoint reale previsto: POST /api/auth/login
      login: (email) =>
        set({
          user: { ...currentUser, email },
          isAuthenticated: true,
        }),
      // Endpoint reale previsto: POST /api/auth/register
      register: (name, email) =>
        set({
          user: { ...currentUser, name, email },
          isAuthenticated: true,
        }),
      // Endpoint reale previsto: POST /api/auth/logout
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: "aethersy-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
