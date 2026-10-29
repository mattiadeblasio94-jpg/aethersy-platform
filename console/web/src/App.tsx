import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Protected } from "./components/Protected";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Flows from "./pages/Flows";
import Runs from "./pages/Runs";
import Connections from "./pages/Connections";
import AiCenter from "./pages/AiCenter";
import Assets from "./pages/Assets";
import Pipeline from "./pages/Pipeline";
import Leads from "./pages/Leads";
import Credits from "./pages/Credits";
import Pulse from "./pages/Pulse";
import Opportunities from "./pages/Opportunities";
import Schedule from "./pages/Schedule";
import AgentRoster from "./pages/AgentRoster";
import Goals from "./pages/Goals";
import Memory from "./pages/Memory";
import Products from "./pages/Products";
import { APP_ROUTES } from "./preview/pages/routes";

// Layer "Anteprima": porting delle pagine di platform/ (dati demo, nessun
// endpoint nuovo). Montato sotto /preview dentro la sessione reale della Console.
const PreviewLayout = lazy(() =>
  import("./preview/PreviewLayout").then((m) => ({ default: m.PreviewLayout })),
);
const PreviewDashboard = lazy(() => import("./preview/pages/Dashboard"));
const PreviewOnboarding = lazy(() => import("./preview/pages/Onboarding"));

function Fallback() {
  return <div className="p-8 text-[--color-muted]">Caricamento…</div>;
}

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          {/* Business Pulse e' la landing: lo stato dell'azienda in un colpo
              d'occhio. La Dashboard tecnica resta su /dashboard. */}
          <Route path="/" element={<Pulse />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/agents" element={<AgentRoster />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/products" element={<Products />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/flows" element={<Flows />} />
          <Route path="/runs" element={<Runs />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="/ai" element={<AiCenter />} />
        </Route>

        {/* --- Anteprima (dati demo, porting di platform/) ------------------- */}
        <Route
          path="/preview"
          element={
            <Protected>
              <PreviewLayout />
            </Protected>
          }
        >
          <Route index element={<Navigate to="/preview/dashboard" replace />} />
          <Route path="dashboard" element={<PreviewDashboard />} />
          <Route path="onboarding" element={<PreviewOnboarding />} />
          {APP_ROUTES.map((spec) => {
            const Page = spec.component;
            return <Route key={spec.path} path={spec.path} element={<Page />} />;
          })}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
