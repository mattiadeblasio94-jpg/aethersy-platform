import { useEffect } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { SkeletonList } from "@/components/ui/Skeleton";

/**
 * Guardia di rotta (P2.2). Al primo mount interroga la sessione reale
 * (`GET /api/auth/session` via cookie httpOnly). Finche' non risponde mostra
 * uno skeleton; se anonimo reindirizza al login conservando la provenienza.
 */
export function Protected({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const location = useLocation();

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  // Sezione autenticata: la sessione e' valida, si renderizza il contenuto.
  if (isAuthenticated) return <>{children}</>;

  // Sessione in verifica (bootstrap non ancora concluso): si mostra lo skeleton.
  // NON si reindirizza qui: durante il bootstrap lo store passa da "idle" a
  // "loading" mentre `isAuthenticated` e' ancora false. Reindirizzare in quel
  // momento rimbalzava l'utente a /login anche con cookie valido (reload su
  // una rotta protetta). Il redirect avviene solo a risposta negativa.
  if (status === "idle" || status === "loading") {
    return (
      <div className="px-4 py-8">
        <SkeletonList count={3} />
      </div>
    );
  }

  // Sessione assente confermata dal BFF: redirect al login, conservando la
  // provenienza per tornare indietro dopo l'accesso.
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
