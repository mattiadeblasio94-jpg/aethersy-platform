import { useConnections, useProjects } from "../lib/query";

export default function Connections() {
  const { data: projects } = useProjects();
  const projectId = projects?.[0]?.id;
  const { data: connections, isLoading } = useConnections(projectId);

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Connections</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          Account collegati ai servizi esterni usati dai flow
        </p>
      </header>

      {isLoading ? (
        <div className="card p-6 text-sm text-[color:var(--color-muted)]">Caricamento…</div>
      ) : !connections?.length ? (
        <div className="card p-6">
          <p className="text-sm text-[color:var(--color-muted)]">
            Nessuna connessione presente. Le connessioni si creano dall'interfaccia Activepieces.
          </p>
          <a
            className="btn btn-ghost mt-4"
            href="https://app.aethersy.online"
            target="_blank"
            rel="noreferrer"
          >
            Apri Activepieces ↗
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connections.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="text-base font-semibold text-white">{c.displayName}</div>
              <div className="mt-1 text-sm text-[color:var(--color-muted)]">
                {c.pieceDisplayName ?? c.pieceName ?? "—"}
              </div>
              {c.status && (
                <span className="badge mt-3 text-[color:var(--color-primary)] border-[color:var(--color-primary)]/40">
                  {c.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
