// =============================================================================
// Ricerca — strumento REALE di ricerca web.
//
// Non e' un campo di testo che "simula" una ricerca: chiama il BFF, che
// interroga i motori reali (Perplexity Sonar via OpenRouter, DuckDuckGo,
// Wikipedia) e restituisce i link effettivamente visitati. Il report e'
// citato: ogni dato porta la sua fonte.
// =============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { PageHeader, EmptyState } from "@/components/common/PageElements";
import { CyberPanel } from "@/components/common/Cyber";
import { platformApi } from "@/lib/platform-api";
import type { ResearchReport, ResearchSource } from "@/lib/platform-api";
import { HttpError } from "@/lib/http";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Prezzi medi di un'agenzia marketing italiana nel 2026",
  "Regole GDPR per landing page con form di contatto",
  "Migliori piattaforme email marketing per PMI italiane",
  "Come si scrive una proposta commerciale per consulenza",
];

export default function Research() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"report" | "search">("report");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 3) {
      setError("Scrivi almeno 3 caratteri.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "search") {
        const result = await platformApi.researchSearch(text, 8);
        setSources(result.sources ?? []);
        setReport(null);
      } else {
        const result = await platformApi.researchReport(text);
        setReport(result);
        setSources(result.sources ?? []);
      }
    } catch (err) {
      const message =
        err instanceof HttpError ? err.message : "Ricerca non disponibile al momento.";
      setError(message);
      toast({ title: "Ricerca non disponibile", description: message, kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ricerca"
        description="Interroga il web reale e porta fonti verificabili dentro il lavoro degli agenti."
      />

      <CyberPanel label="Nuova ricerca" tone="active">
        <form onSubmit={run} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["report", "search"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  mode === value
                    ? "bg-accent text-accent-foreground"
                    : "border border-border-default text-text-secondary hover:border-accent/50 hover:text-text-primary",
                )}
              >
                {value === "report" ? "Report con fonti" : "Risultati SERP"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Es. prezzi medi di un'agenzia marketing italiana nel 2026"
              className="flex-1 rounded-xl border border-border-default bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent"
            />
            <Button type="submit" disabled={busy} className="shrink-0">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {busy ? "Ricerca in corso" : "Cerca"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="rounded-full border border-border-default px-3 py-1 text-xs text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
              >
                {example}
              </button>
            ))}
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
        </form>
      </CyberPanel>

      {report && (
        <CyberPanel label="Report" tone="neutral">
          {report.degraded && report.note && (
            <p className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {report.note}
            </p>
          )}
          <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
            {report.markdown.split(/\n{2,}/).map((block, index) => {
              if (block.startsWith("## ")) {
                return (
                  <h3 key={index} className="pt-2 text-sm font-semibold text-text-primary">
                    {block.replace(/^##\s+/, "")}
                  </h3>
                );
              }
              if (block.startsWith("# ")) {
                return (
                  <h2 key={index} className="text-base font-semibold text-text-primary">
                    {block.replace(/^#\s+/, "")}
                  </h2>
                );
              }
              if (/^\d+\.\s/.test(block)) {
                return (
                  <ul key={index} className="list-decimal space-y-1 pl-5">
                    {block.split("\n").map((line, i) => (
                      <li key={i}>{line.replace(/^\d+\.\s*/, "")}</li>
                    ))}
                  </ul>
                );
              }
              return <p key={index}>{block}</p>;
            })}
          </div>
        </CyberPanel>
      )}

      {sources.length > 0 && (
        <CyberPanel label={`Fonti reali (${sources.length})`} tone="neutral">
          <ul className="space-y-3">
            {sources.map((source) => (
              <li key={source.url} className="rounded-xl border border-border-default p-3">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-start gap-2 text-sm font-medium text-text-primary hover:text-accent"
                >
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {source.title || source.url}
                </a>
                <p className="mt-1 break-all text-xs text-text-tertiary">{source.url}</p>
                {source.snippet && (
                  <p className="mt-1 text-xs text-text-secondary">{source.snippet}</p>
                )}
                <span className="mt-2 inline-block rounded-full bg-surface-raised px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
                  {source.provider}
                </span>
              </li>
            ))}
          </ul>
        </CyberPanel>
      )}

      {!busy && !report && sources.length === 0 && !error && (
        <EmptyState
          title="Nessuna ricerca eseguita"
          description="Scegli un esempio o scrivi un tema: il report arriva con le fonti cliccabili."
        />
      )}
    </div>
  );
}
