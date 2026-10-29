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

  if (!isAuthenticated && status === "idle") {
    return (
      <div className="px-4 py-8">
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
