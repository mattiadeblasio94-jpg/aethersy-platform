import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/auth";

/**
 * Guardia di rotta. Stadio A: la sessione vive nello store di auth (mock).
 * Quando il backend reale sara' attivo, questo componente interroghera' la
 * sessione via React Query, senza cambiare i consumer.
 */
export function Protected({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
