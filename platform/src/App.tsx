// =============================================================================
// Routing dell'app (brief §4). Rotte pubbliche (marketing + auth) e area
// autenticata protetta, avvolta dal Shell (header, drawer, bottom nav, fab).
// Le pagine dell'area autenticata sono caricate in modo lazy: ogni route porta
// solo il proprio codice (Suspense + Skeleton come fallback).
// =============================================================================

import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "@/components/layout/Shell";
import { Protected } from "@/components/Protected";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useAppliedTheme } from "@/lib/theme";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import { APP_ROUTES, componentFor } from "@/pages/routes";

/** Fallback mostrato mentre il chunk di una pagina viene scaricato. */
function RouteFallback() {
  return (
    <div className="py-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Caricamento della pagina…</span>
      <SkeletonList count={3} />
    </div>
  );
}

export default function App() {
  // Applica il tema (scuro/chiaro/sistema) all'elemento <html> una sola volta.
  useAppliedTheme();

  return (
    <Routes>
      {/* --- Pubbliche ---------------------------------------------------- */}
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/onboarding" element={<Onboarding />} />

      {/* --- Area autenticata --------------------------------------------- */}
      <Route
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />

        {APP_ROUTES.map((spec) => {
          const Page = componentFor(spec);
          return (
            <Route
              key={spec.path}
              path={`/${spec.path}`}
              element={
                <Suspense fallback={<RouteFallback />}>
                  <Page />
                </Suspense>
              }
            />
          );
        })}
      </Route>

      {/* --- Reindirizzamenti --------------------------------------------- */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
