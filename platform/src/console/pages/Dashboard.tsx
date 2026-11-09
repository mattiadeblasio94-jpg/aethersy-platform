import { useProjects, useRuns, useFlows } from "../lib/query";

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">{label}</div>
      <div
        className={`mt-2 text-3xl font-semibold ${accent ? "text-[color:var(--color-primary)]" : "text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: projects } = useProjects();
  const projectId = projects?.[0]?.id;
  const { data: flows } = useFlows(projectId);
  const { data: runs } = useRuns(projectId);

  const failed = runs?.filter((r) => r.status === "FAILED").length ?? 0;
  const succeeded = runs?.filter((r) => r.status === "SUCCEEDED").length ?? 0;

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          Panoramica della piattaforma AI Aethersy
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Progetti" value={projects?.length ?? "—"} />
        <Stat label="Flows" value={flows?.length ?? "—"} accent />
        <Stat label="Run riusciti" value={succeeded} />
        <Stat label="Run falliti" value={failed} />
      </div>

      <section className="card mt-8 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Ultimi run</h2>
        {!runs?.length ? (
          <p className="text-sm text-[color:var(--color-muted)]">Nessun run registrato.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
              <tr>
                <th className="pb-2">Flow</th>
                <th className="pb-2">Stato</th>
                <th className="pb-2">Avvio</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 6).map((r) => (
                <tr key={r.id} className="border-t border-[color:var(--color-border)]">
                  <td className="py-2 text-white">{r.flowDisplayName ?? r.flowId}</td>
                  <td className="py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2 text-[color:var(--color-muted)]">
                    {r.startTime ? new Date(r.startTime).toLocaleString("it-IT") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "SUCCEEDED"
      ? "text-emerald-300 border-emerald-500/40"
      : status === "FAILED"
        ? "text-red-300 border-red-500/40"
        : status === "RUNNING"
          ? "text-[color:var(--color-primary)] border-[color:var(--color-primary)]/40"
          : "text-[color:var(--color-muted)] border-[color:var(--color-border)]";
  return <span className={`badge ${color}`}>{status}</span>;
}
