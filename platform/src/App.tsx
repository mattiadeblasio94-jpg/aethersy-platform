// =============================================================================
// Routing dell'app (brief §4). Rotte pubbliche (marketing + auth) e area
// autenticata protetta, avvolta dal Shell (header, drawer, bottom nav, fab).
// Le pagine dell'area autenticata sono caricate in modo lazy: ogni route porta
// solo il proprio codice (Suspense + Skeleton come fallback).
// =============================================================================

import { Suspense, lazy } from "react";
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
import { Privacy, Terms } from "@/pages/Legal";
import { APP_ROUTES, componentFor } from "@/pages/routes";

// --- Area operativa (Console) -----------------------------------------------
// Le pagine della veccia console separata vivono ora dentro la piattaforma,
// sotto /console/*: stessa app, stesso dominio, stessa sessione.
const ConsoleLayout = lazy(() =>
  import("@/console/components/Layout").then((m) => ({ default: m.Layout })),
);
const ConsolePulse = lazy(() => import("@/console/pages/Pulse"));
const ConsoleGoals = lazy(() => import("@/console/pages/Goals"));
const ConsoleMemory = lazy(() => import("@/console/pages/Memory"));
const ConsoleProducts = lazy(() => import("@/console/pages/Products"));
const ConsoleOpportunities = lazy(() => import("@/console/pages/Opportunities"));
const ConsoleSchedule = lazy(() => import("@/console/pages/Schedule"));
const ConsoleAgents = lazy(() => import("@/console/pages/AgentRoster"));
const ConsolePipeline = lazy(() => import("@/console/pages/Pipeline"));
const ConsoleLeads = lazy(() => import("@/console/pages/Leads"));
const ConsoleAssets = lazy(() => import("@/console/pages/Assets"));
const ConsoleCredits = lazy(() => import("@/console/pages/Credits"));
const ConsoleDashboard = lazy(() => import("@/console/pages/Dashboard"));
const ConsoleFlows = lazy(() => import("@/console/pages/Flows"));
const ConsoleRuns = lazy(() => import("@/console/pages/Runs"));
const ConsoleConnections = lazy(() => import("@/console/pages/Connections"));
const ConsoleAi = lazy(() => import("@/console/pages/AiCenter"));

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
      {/* Pagine legali pubbliche: richieste dalla verifica dell'app Google. */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />

      {/* --- Area autenticata --------------------------------------------- */}
      <Route
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      >
        <Route path="/overview" element={<Dashboard />} />

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

      {/* --- Area operativa (Console dentro la piattaforma) ---------------- */}
      <Route
        element={
          <Protected>
            <Suspense fallback={<RouteFallback />}>
              <ConsoleLayout />
            </Suspense>
          </Protected>
        }
      >
        <Route path="/console" element={<Navigate to="/console/pulse" replace />} />
        <Route path="/console/pulse" element={<ConsolePulse />} />
        <Route path="/console/goals" element={<ConsoleGoals />} />
        <Route path="/console/memory" element={<ConsoleMemory />} />
        <Route path="/console/products" element={<ConsoleProducts />} />
        <Route path="/console/opportunities" element={<ConsoleOpportunities />} />
        <Route path="/console/schedule" element={<ConsoleSchedule />} />
        <Route path="/console/agents" element={<ConsoleAgents />} />
        <Route path="/console/pipeline" element={<ConsolePipeline />} />
        <Route path="/console/leads" element={<ConsoleLeads />} />
        <Route path="/console/assets" element={<ConsoleAssets />} />
        <Route path="/console/credits" element={<ConsoleCredits />} />
        <Route path="/console/dashboard" element={<ConsoleDashboard />} />
        <Route path="/console/flows" element={<ConsoleFlows />} />
        <Route path="/console/runs" element={<ConsoleRuns />} />
        <Route path="/console/connections" element={<ConsoleConnections />} />
        <Route path="/console/ai" element={<ConsoleAi />} />
      </Route>

      {/* --- Reindirizzamenti --------------------------------------------- */}
      <Route path="/" element={<Navigate to="/studio" replace />} />
      <Route path="*" element={<Navigate to="/studio" replace />} />
    </Routes>
  );
}
