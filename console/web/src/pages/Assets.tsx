import { useState } from "react";
import {
  useAssetFamilies,
  useAssetVersions,
  useDecideAsset,
  useSubmitAsset,
} from "../lib/query";
import type { AssetFamily, AssetKind, AssetStatus } from "../lib/types";

const KINDS: { key: AssetKind | ""; label: string; icon: string }[] = [
  { key: "", label: "Tutti", icon: "◈" },
  { key: "document", label: "Documenti", icon: "▤" },
  { key: "image", label: "Immagini", icon: "◨" },
  { key: "video", label: "Video", icon: "▶" },
  { key: "audio", label: "Audio", icon: "♪" },
  { key: "code", label: "Codice", icon: "⌘" },
  { key: "dataset", label: "Dataset", icon: "▦" },
  { key: "archive", label: "Archivi", icon: "⧈" },
  { key: "link", label: "Link", icon: "⚯" },
];

function StatusBadge({ status }: { status: AssetStatus }) {
  const color =
    status === "approved"
      ? "text-emerald-300 border-emerald-500/40"
      : status === "delivered"
        ? "text-[--color-primary] border-[--color-primary]/40"
        : status === "rejected"
          ? "text-red-300 border-red-500/40"
          : status === "in_review"
            ? "text-[--color-accent] border-[--color-accent]/40"
            : "text-[--color-muted] border-[--color-border]";
  return <span className={`badge ${color}`}>{status}</span>;
}

function iconFor(kind: AssetKind): string {
  return KINDS.find((k) => k.key === kind)?.icon ?? "◇";
}

export default function Assets() {
  const [kind, setKind] = useState<AssetKind | "">("");
  const [selected, setSelected] = useState<AssetFamily | null>(null);

  const families = useAssetFamilies({ kind: kind || undefined });

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Libreria asset</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          Deliverable della pipeline: revisioni versionate, approvazione umana prima della consegna.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={`btn ${kind === k.key ? "btn-primary" : "btn-ghost"}`}
          >
            <span>{k.icon}</span>
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-hidden">
          {families.isLoading ? (
            <div className="p-6 text-sm text-[--color-muted]">Caricamento…</div>
          ) : !families.data?.length ? (
            <div className="p-6 text-sm text-[--color-muted]">
              Nessun deliverable ancora. Gli asset compaiono quando un run di pipeline produce
              output.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[--color-muted]">
                <tr>
                  <th className="px-4 py-3">Deliverable</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Rev.</th>
                  <th className="px-4 py-3">Stato</th>
                  <th className="px-4 py-3">Aggiornato</th>
                </tr>
              </thead>
              <tbody>
                {families.data.map((f) => (
                  <tr
                    key={f.key}
                    className={`cursor-pointer border-t border-[--color-border] hover:bg-[rgba(0,164,255,0.06)] ${
                      selected?.key === f.key ? "bg-[rgba(0,212,255,0.08)]" : ""
                    }`}
                    onClick={() => setSelected(f)}
                  >
                    <td className="px-4 py-3 text-white">
                      <span className="mr-2 text-[--color-primary]">{iconFor(f.kind)}</span>
                      {f.name}
                    </td>
                    <td className="px-4 py-3 text-[--color-muted]">{f.kind}</td>
                    <td className="px-4 py-3 text-[--color-muted]">
                      v{f.latestVersion}
                      {f.versions > 1 && (
                        <span className="ml-1 text-[11px]">({f.versions} rev.)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={f.latestStatus} />
                      {f.approvedVersion !== null &&
                        f.approvedVersion !== f.latestVersion && (
                          <span className="ml-2 text-[11px] text-[--color-muted]">
                            approvata v{f.approvedVersion}
                          </span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-[--color-muted]">
                      {new Date(f.updatedAt).toLocaleString("it-IT")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <VersionPanel family={selected} />
      </div>
    </div>
  );
}

function VersionPanel({ family }: { family: AssetFamily | null }) {
  if (!family) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white">Revisioni</h2>
        <p className="mt-2 text-sm text-[--color-muted]">
          Seleziona un deliverable per vedere lo storico delle revisioni e approvare o rifiutare.
        </p>
      </div>
    );
  }

  return <FamilyVersions key={family.key} family={family} />;
}

function FamilyVersions({ family }: { family: AssetFamily }) {
  // La revisione piu' recente identifica la famiglia sul server; da li' si
  // ricava lo storico completo delle versioni.
  const latest = useAssetVersions(family.latestAssetId);
  const submit = useSubmitAsset();
  const decide = useDecideAsset();
  const [error, setError] = useState<string | null>(null);

  const rows = latest.data?.versions ?? [];

  return (
    <div className="card p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">
          <span className="mr-2 text-[--color-primary]">{iconFor(family.kind)}</span>
          {family.name}
        </h2>
        <p className="mt-1 text-xs text-[--color-muted]">
          {family.kind} · {family.versions} revisioni · run {family.runId ?? "globale"}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {latest.isLoading ? (
        <p className="text-sm text-[--color-muted]">Caricamento…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between rounded-lg border border-[--color-border] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">v{v.version}</span>
                  <StatusBadge status={v.status} />
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[--color-muted]">
                  {v.mime ?? "—"} · {v.storage_key}
                </div>
              </div>
              <div className="ml-3 flex shrink-0 gap-2">
                {(v.status === "draft" || v.status === "rejected") && (
                  <button
                    className="btn btn-ghost"
                    disabled={submit.isPending}
                    onClick={() => {
                      setError(null);
                      submit.mutate(v.id, {
                        onError: (e) => setError((e as Error).message),
                      });
                    }}
                  >
                    Invia in revisione
                  </button>
                )}
                {v.status === "in_review" && (
                  <>
                    <button
                      className="btn btn-primary"
                      disabled={decide.isPending}
                      onClick={() => {
                        setError(null);
                        decide.mutate(
                          { assetId: v.id, decision: "approved" },
                          { onError: (e) => setError((e as Error).message) },
                        );
                      }}
                    >
                      Approva
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={decide.isPending}
                      onClick={() => {
                        setError(null);
                        decide.mutate(
                          { assetId: v.id, decision: "rejected" },
                          { onError: (e) => setError((e as Error).message) },
                        );
                      }}
                    >
                      Rifiuta
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
