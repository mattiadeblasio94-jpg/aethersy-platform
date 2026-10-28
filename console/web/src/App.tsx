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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/flows" element={<Flows />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/ai" element={<AiCenter />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
