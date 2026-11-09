import { useState } from "react";
import {
  useIntegrations,
  useLeads,
  useRevokeIntegration,
  useSaveIntegration,
  useUpdateLead,
} from "../lib/query";
import type { Lead, LeadStatus } from "../lib/types";

const STATUSES: { key: LeadStatus; label: string }[] = [
  { key: "new", label: "Nuovo" },
  { key: "contacted", label: "Contattato" },
  { key: "qualified", label: "Qualificato" },
  { key: "won", label: "Acquisito" },
  { key: "lost", label: "Perso" },
  { key: "spam", label: "Spam" },
];

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Tutti" },
  ...STATUSES.map((s) => ({ key: s.key, label: s.label })),
];

// Transizioni ammesse lato server (macchina a stati di `pipeline/catalog.ts`).
const NEXT: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "qualified", "won", "lost", "spam"],
  contacted: ["qualified", "won", "lost", "spam"],
  qualified: ["won", "lost", "spam"],
  won: [],
  lost: [],
  spam: [],
};

function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const color =
    status === "won"
      ? "text-emerald-300 border-emerald-500/40"
      : status === "lost"
        ? "text-red-300 border-red-500/40"
        : status === "spam"
          ? "text-[color:var(--color-muted)] border-[color:var(--color-border)]"
          : status === "qualified"
            ? "text-[color:var(--color-accent)] border-[color:var(--color-accent)]/40"
            : status === "contacted"
              ? "text-[color:var(--color-primary)] border-[color:var(--color-primary)]/40"
              : "text-white border-[color:var(--color-border)]";
  const label = STATUSES.find((s) => s.key === status)?.label ?? status;
  return <span className={`badge ${color}`}>{label}</span>;
}

export default function Leads() {
  const [filter, setFilter] = useState<string>("");
  const leads = useLeads({ status: filter || undefined });
  const update = useUpdateLead();
  const [error, setError] = useState<string | null>(null);

  const counts = new Map((leads.data?.counts ?? []).map((c) => [c.status, c.count]));
  const total = (leads.data?.counts ?? []).reduce((acc, c) => acc + c.count, 0);

  function advance(lead: Lead, to: LeadStatus) {
    setError(null);
    update.mutate({ leadId: lead.id, status: to }, { onError: (e) => setError((e as Error).message) });
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Lead</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          Lead raccolti dal sito o dai flow, inoltrati al canale Slack del tenant. Avanza lo stato
          nel funnel; le transizioni non valide sono rifiutate dal server.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const c = f.key ? counts.get(f.key) ?? 0 : total;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`btn ${filter === f.key ? "btn-primary" : "btn-ghost"}`}
            >
              {f.label} <span className="ml-1 opacity-60">{c}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        {leads.isLoading ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">Caricamento…</div>
        ) : !leads.data?.leads.length ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">
            Nessun lead. Il webhook è <code className="text-[color:var(--color-primary)]">POST /api/pipeline/leads</code>{" "}
            (Bearer key del tenant).
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Contatto</th>
                <th className="px-4 py-3">Origine</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Notificato</th>
                <th className="px-4 py-3">Ricevuto</th>
                <th className="px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {leads.data.leads.map((l) => (
                <tr key={l.id} className="border-t border-[color:var(--color-border)] align-top">
                  <td className="px-4 py-3">
                    <div className="text-white">{l.name || l.email || l.phone || "anonimo"}</div>
                    {l.message && (
                      <div className="mt-1 max-w-md text-xs text-[color:var(--color-muted)]">{l.message}</div>
                    )}
                    {l.run_id && (
                      <div className="mt-1 text-[11px] text-[color:var(--color-muted)]">
                        run {l.run_id.slice(0, 8)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{l.source}</td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">
                    {l.notified_at ? new Date(l.notified_at).toLocaleString("it-IT") : "—"}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">
                    {new Date(l.created_at).toLocaleString("it-IT")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {NEXT[l.status].map((to) => (
                        <button
                          key={to}
                          className="btn btn-ghost"
                          disabled={update.isPending}
                          onClick={() => advance(l, to)}
                        >
                          {STATUSES.find((s) => s.key === to)?.label ?? to}
                        </button>
                      ))}
                      {!NEXT[l.status].length && (
                        <span className="text-xs text-[color:var(--color-muted)]">stato finale</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <IntegrationsPanel />
    </div>
  );
}

function IntegrationsPanel() {
  const integrations = useIntegrations();
  const save = useSaveIntegration();
  const revoke = useRevokeIntegration();
  const [provider, setProvider] = useState("slack");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="card mt-8 p-6">
      <h2 className="mb-1 text-lg font-semibold text-white">Canale outbound</h2>
      <p className="mb-4 text-sm text-[color:var(--color-muted)]">
        Webhook Slack dedicato al tenant per l'inoltro dei lead. Senza credenziale si usa il
        fallback di stack (<code className="text-[color:var(--color-primary)]">SLACK_WEBHOOK_URL</code>).
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[color:var(--color-muted)]">
          Provider
          <input
            className="input mt-1 w-40"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col text-xs text-[color:var(--color-muted)]">
          Webhook URL
          <input
            className="input mt-1 w-full"
            type="password"
            placeholder="https://hooks.slack.com/services/…"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        <button
          className="btn btn-primary"
          disabled={save.isPending || !provider || !secret}
          onClick={() => {
            setError(null);
            save.mutate(
              { provider, kind: "webhook", label: "", secret },
              {
                onSuccess: () => setSecret(""),
                onError: (e) => setError((e as Error).message),
              },
            );
          }}
        >
          Salva
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {integrations.isLoading ? (
        <p className="text-sm text-[color:var(--color-muted)]">Caricamento…</p>
      ) : !integrations.data?.length ? (
        <p className="text-sm text-[color:var(--color-muted)]">Nessuna credenziale salvata.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {integrations.data.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-white">
                {c.provider}
                <span className="ml-2 text-[11px] text-[color:var(--color-muted)]">
                  {c.kind} · {c.status}
                </span>
              </span>
              {c.status === "active" && (
                <button
                  className="btn btn-ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(c.id)}
                >
                  Revoca
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
