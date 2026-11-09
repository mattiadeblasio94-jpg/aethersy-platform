import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../lib/query";

export function Protected({ children }: { children: ReactNode }) {
  const { data, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[color:var(--color-muted)]">
        Caricamento sessione…
      </div>
    );
  }

  if (!data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
