import { useRuns, useRunCounts, useProjects } from "../lib/query";
import { StatusBadge } from "./Dashboard";

export default function Runs() {
  const { data: projects } = useProjects();
  const projectId = projects?.[0]?.id;
  const { data: runs, isLoading } = useRuns(projectId);
  const { data: counts } = useRunCounts(projectId);

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Runs</h1>
        <p className="mt-1 text-sm text-[--color-muted]">Cronologia delle esecuzioni</p>
      </header>

      {!!counts?.length && (
        <div className="mb-6 flex flex-wrap gap-3">
          {counts.map((c) => (
            <div key={c.status} className="card flex items-center gap-3 px-4 py-3">
              <StatusBadge status={c.status} />
              <span className="text-lg font-semibold text-white">{c.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-[--color-muted]">Caricamento…</div>
        ) : !runs?.length ? (
          <div className="p-6 text-sm text-[--color-muted]">Nessun run registrato.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[--color-muted]">
              <tr>
                <th className="px-4 py-3">Flow</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Ambiente</th>
                <th className="px-4 py-3">Avvio</th>
                <th className="px-4 py-3">Fine</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-[--color-border]">
                  <td className="px-4 py-3 text-white">{r.flowDisplayName ?? r.flowId}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-[--color-muted]">{r.environment ?? "—"}</td>
                  <td className="px-4 py-3 text-[--color-muted]">
                    {r.startTime ? new Date(r.startTime).toLocaleString("it-IT") : "—"}
                  </td>
                  <td className="px-4 py-3 text-[--color-muted]">
                    {r.finishTime ? new Date(r.finishTime).toLocaleString("it-IT") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
