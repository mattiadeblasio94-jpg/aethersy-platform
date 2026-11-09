import { useState } from "react";
import { useCreateFlow, useFlows, useProjects } from "../lib/query";
import { StatusBadge } from "./Dashboard";

export default function Flows() {
  const { data: projects } = useProjects();
  const projectId = projects?.[0]?.id;
  const { data: flows, isLoading } = useFlows(projectId);
  const createFlow = useCreateFlow();
  const [name, setName] = useState("");

  return (
    <div>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="wordmark text-3xl font-semibold text-white">Flows</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            Automazioni della piattaforma (project: {projects?.[0]?.displayName ?? "—"})
          </p>
        </div>
      </header>

      <form
        className="card mb-6 flex gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!projectId || !name.trim()) return;
          createFlow.mutate(
            { projectId, displayName: name.trim() },
            { onSuccess: () => setName("") },
          );
        }}
      >
        <input
          className="input"
          placeholder="Nome del nuovo flow…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-primary shrink-0" disabled={!name.trim() || createFlow.isPending}>
          {createFlow.isPending ? "Creazione…" : "Crea flow"}
        </button>
      </form>

      {createFlow.isError && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Errore nella creazione del flow.
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">Caricamento…</div>
        ) : !flows?.length ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">Nessun flow presente.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Pubblicato</th>
                <th className="px-4 py-3">ID</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => (
                <tr key={f.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-3 text-white">{f.displayName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">
                    {f.publishedVersionId ? "sì" : "no"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--color-muted)]">{f.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
