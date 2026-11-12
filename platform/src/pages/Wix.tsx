// =============================================================================
// Wix — collegamento reale al server MCP di Wix.
//
// Il tenant collega il proprio account Wix con OAuth (DCR + PKCE): la
// piattaforma registra il client MCP, l'utente autorizza su wix.com e i token
// restano cifrati nel database. Da qui si vedono i tool reali esposti dal
// server (e-commerce, blog, analytics, pagine, domini) e si possono eseguire
// con argomenti reali.
//
// Niente mock: se Wix non e' collegato, la pagina lo dice e non inventa dati.
// =============================================================================

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Link2,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { platformApi } from "@/lib/platform-api";
import type { WixTool } from "@/lib/platform-api";

function statusVariant(status: number): "success" | "warning" | "error" | "default" {
  if (status >= 200 && status < 300) return "success";
  if (status === 0 || status >= 500) return "error";
  if (status === 401 || status === 403) return "warning";
  return "default";
}

export default function Wix() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<WixTool | null>(null);
  const [argsText, setArgsText] = useState("{}");
  const [result, setResult] = useState<unknown>(null);

  const status = useQuery({
    queryKey: ["real", "wix", "status"],
    queryFn: () => platformApi.getWixStatus(),
  });

  const tools = useQuery({
    queryKey: ["real", "wix", "tools"],
    queryFn: () => platformApi.listWixTools(),
    enabled: Boolean(status.data?.connected),
  });

  const insights = useQuery({
    queryKey: ["real", "wix", "insights"],
    queryFn: () => platformApi.getWixInsights(),
    enabled: Boolean(status.data?.connected),
  });

  const disconnect = useMutation({
    mutationFn: () => platformApi.disconnectWix(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["real", "wix"] });
      toast({ kind: "info", title: "Account Wix scollegato" });
    },
    onError: (error) => {
      toast({
        kind: "error",
        title: "Scollegamento non riuscito",
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const runTool = useMutation({
    mutationFn: (input: { name: string; args: Record<string, unknown> }) =>
      platformApi.callWixTool(input.name, input.args),
    onSuccess: (data) => {
      setResult(data.content);
      toast({
        kind: data.isError ? "warning" : "success",
        title: data.isError ? "Il tool ha restituito un errore" : "Tool eseguito",
      });
    },
    onError: (error) => {
      toast({
        kind: "error",
        title: "Esecuzione non riuscita",
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const toolRows = useMemo(() => {
    const list = tools.data?.tools ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (tool) =>
        tool.name.toLowerCase().includes(needle) ||
        (tool.description ?? "").toLowerCase().includes(needle) ||
        (tool.title ?? "").toLowerCase().includes(needle),
    );
  }, [tools.data, filter]);

  function openTool(tool: WixTool) {
    setSelected(tool);
    setResult(null);
    const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
    const keys = Object.keys(schema?.properties ?? {});
    setArgsText(keys.length ? JSON.stringify(Object.fromEntries(keys.map((key) => [key, ""])), null, 2) : "{}");
  }

  function execute() {
    if (!selected) return;
    let args: Record<string, unknown>;
    try {
      const parsed = JSON.parse(argsText || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      } else {
        toast({ kind: "error", title: "Gli argomenti devono essere un oggetto JSON" });
        return;
      }
    } catch {
      toast({ kind: "error", title: "JSON non valido negli argomenti" });
      return;
    }
    runTool.mutate({ name: selected.name, args });
  }

  const connected = Boolean(status.data?.connected);
  const restChecks = status.data?.rest.checks ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Wix"
        description="Collega il tuo account Wix: la piattaforma usa il server MCP ufficiale per e-commerce, blog, analytics, pagine e domini."
        actions={
          connected ? (
            <Button
              variant="secondary"
              leftIcon={<Unplug className="h-4 w-4" aria-hidden="true" />}
              loading={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Scollega
            </Button>
          ) : (
            <Button
              variant="primary"
              leftIcon={<Link2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => {
                window.location.href = "/api/platform/wix/connect";
              }}
            >
              Collega Wix
            </Button>
          )
        }
      />

      <section aria-label="Stato Wix" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Collegamento"
          value={connected ? "Attivo" : "Non attivo"}
          icon={
            connected ? (
              <ShieldCheck className="h-5 w-5 text-secondary" aria-hidden="true" />
            ) : (
              <Plug className="h-5 w-5 text-warning" aria-hidden="true" />
            )
          }
          hint={status.data?.mcp.scope ?? "offline_access"}
        />
        <KpiCard
          label="Tool disponibili"
          value={String(status.data?.mcp.toolCount ?? 0)}
          icon={<Wrench className="h-5 w-5 text-secondary" aria-hidden="true" />}
          hint="dal server MCP di Wix"
        />
        <KpiCard
          label="Famiglie di tool"
          value={String(status.data?.mcp.summary.groups.length ?? 0)}
          hint="gruppi per prefisso"
        />
        <KpiCard
          label="API REST"
          value={status.data?.rest.configured ? "Attive" : "Non configurate"}
          hint={status.data?.rest.siteId ?? "nessun site id"}
        />
      </section>

      {!connected && (
        <Card>
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-text-primary">Collega Wix in un clic</h2>
            <p className="text-sm text-text-secondary">
              {status.data?.hint ??
                "La piattaforma registra il client MCP di Wix, ti manda su wix.com per autorizzare l'accesso e conserva i token cifrati nel tuo tenant: nessuna credenziale nel browser."}
            </p>
            <div>
              <Button
                variant="primary"
                leftIcon={<Link2 className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  window.location.href = "/api/platform/wix/connect";
                }}
              >
                Collega Wix
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Tool Wix</h2>
              <span className="text-xs text-text-muted">{toolRows.length} strumenti</span>
            </>
          }
          bodyClassName="p-0"
        >
          <div className="border-b border-secondary/10 px-5 py-4">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Cerca un tool (prodotti, ordini, blog, analytics...)"
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              aria-label="Cerca un tool Wix"
            />
          </div>

          {tools.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : toolRows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Wrench className="h-5 w-5" aria-hidden="true" />}
                title={connected ? "Nessun tool corrisponde alla ricerca" : "Account Wix non collegato"}
                description={
                  connected
                    ? "Prova un altro termine: i tool sono quelli esposti dal server MCP di Wix per l'account collegato."
                    : "Collega il tuo account per vedere i tool reali disponibili."
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-secondary/10">
              {toolRows.map((tool) => (
                <li key={tool.name} className="flex flex-col gap-2 px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-sm font-medium text-text-primary">
                      {tool.name}
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => openTool(tool)}>
                      Esegui
                    </Button>
                  </div>
                  {tool.description && (
                    <span className="text-xs text-text-muted">{tool.description}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Esecuzione</h2>
                <span className="text-xs text-text-muted">
                  {selected ? selected.name : "nessun tool selezionato"}
                </span>
              </>
            }
          >
            {selected ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-text-secondary">
                  {selected.description ?? "Tool senza descrizione."}
                </p>
                <label className="flex flex-col gap-1 text-xs text-text-muted" htmlFor="wix-args">
                  Argomenti (JSON)
                  <textarea
                    id="wix-args"
                    value={argsText}
                    onChange={(event) => setArgsText(event.target.value)}
                    rows={8}
                    spellCheck={false}
                    className="w-full rounded-lg border border-secondary/20 bg-background px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-secondary/60"
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    leftIcon={<Wrench className="h-4 w-4" aria-hidden="true" />}
                    loading={runTool.isPending}
                    onClick={execute}
                  >
                    Esegui tool
                  </Button>
                  <Button variant="ghost" onClick={() => setSelected(null)}>
                    Chiudi
                  </Button>
                </div>
                {result !== null && (
                  <pre className="max-h-64 overflow-auto rounded-lg bg-secondary/5 p-3 text-xs text-text-secondary">
                    {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                Scegli un tool dall'elenco per eseguirlo con argomenti reali: la chiamata va
                direttamente al server MCP di Wix.
              </p>
            )}
          </Card>

          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Insights commerciali</h2>
                <span className="text-xs text-text-muted">
                  {(insights.data?.groups ?? []).length} famiglie
                </span>
              </>
            }
            bodyClassName="p-0"
          >
            {insights.isLoading ? (
              <div className="p-5">
                <Skeleton lines={3} />
              </div>
            ) : (insights.data?.groups ?? []).length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
                  title="Nessun dato commerciale disponibile"
                  description="Gli snapshot (ricavi, ordini, catalogo, clienti, traffico) vengono letti dai tool di sola lettura del server MCP: compariranno qui dopo il collegamento."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {(insights.data?.groups ?? []).map((group) => (
                  <li key={group.key} className="flex flex-col gap-2 px-5 py-3">
                    <span className="text-sm font-medium text-text-primary">{group.label}</span>
                    {group.tools.map((row) => (
                      <details key={row.name} className="rounded-lg border border-secondary/10 px-3 py-2">
                        <summary className="cursor-pointer font-mono text-xs text-text-secondary">
                          {row.name}
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto text-xs text-text-muted">
                          {row.error ??
                            (typeof row.content === "string"
                              ? row.content
                              : JSON.stringify(row.content, null, 2))}
                        </pre>
                      </details>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">API REST</h2>
                <span className="text-xs text-text-muted">token di istanza</span>
              </>
            }
            bodyClassName="p-0"
          >
            {restChecks.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Plug className="h-5 w-5" aria-hidden="true" />}
                  title="Token REST non configurato"
                  description="Il collegamento MCP e' sufficiente per usare Wix; il token REST e' facoltativo e abilita le chiamate dirette alle API del sito."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {restChecks.map((check) => (
                  <li key={check.path} className="flex flex-col gap-1 px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-text-primary">{check.name}</span>
                      <Badge variant={statusVariant(check.status)}>{check.status || "errore"}</Badge>
                    </div>
                    <span className="truncate text-xs text-text-muted">{check.path}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Collegamento</h2>
                <span className="text-xs text-text-muted">OAuth 2.1 + PKCE</span>
              </>
            }
          >
            <div className="flex flex-col gap-2 text-sm text-text-secondary">
              <p>
                Callback: <span className="font-mono text-xs">{status.data?.mcp.redirectUri ?? "—"}</span>
              </p>
              <p>
                Server MCP:{" "}
                <a
                  href={status.data?.mcp.server ?? "https://mcp.wix.com/mcp"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-secondary underline"
                >
                  {status.data?.mcp.server ?? "https://mcp.wix.com/mcp"}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </p>
              {status.data?.mcp.error && (
                <p className="text-error">{status.data.mcp.error}</p>
              )}
              <Button
                variant="ghost"
                leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["real", "wix"] });
                }}
              >
                Aggiorna stato
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
