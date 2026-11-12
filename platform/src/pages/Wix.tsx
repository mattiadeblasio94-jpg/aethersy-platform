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
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Unplug,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { platformApi } from "@/lib/platform-api";
import type { WixTool } from "@/lib/platform-api";

export default function Wix() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<WixTool | null>(null);
  const [argsText, setArgsText] = useState("{}");
  const [result, setResult] = useState<unknown>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productDescription, setProductDescription] = useState("");

  const status = useQuery({
    queryKey: ["real", "wix", "status"],
    queryFn: () => platformApi.getWixStatus(),
  });

  const tools = useQuery({
    queryKey: ["real", "wix", "tools"],
    queryFn: () => platformApi.listWixTools(),
    enabled: Boolean(status.data?.connected),
  });

  const business = useQuery({
    queryKey: ["real", "wix", "business"],
    queryFn: () => platformApi.getWixBusiness(),
    enabled: Boolean(status.data?.connected),
  });

  const createProduct = useMutation({
    mutationFn: (input: { name: string; price: number; description?: string }) =>
      platformApi.createWixProduct(input),
    onSuccess: (data) => {
      setProductName("");
      setProductPrice("");
      setProductDescription("");
      queryClient.invalidateQueries({ queryKey: ["real", "wix"] });
      // Wix indicizza il nuovo prodotto con qualche secondo di ritardo: si
      // ricarica il business poco dopo per mostrarlo nel catalogo.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["real", "wix"] });
      }, 9000);
      toast({
        kind: "success",
        title: "Prodotto creato in catalogo",
        description: data.product.name ?? undefined,
      });
    },
    onError: (error) => {
      toast({
        kind: "error",
        title: "Creazione del prodotto non riuscita",
        description: error instanceof Error ? error.message : undefined,
      });
    },
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

  function submitProduct() {
    const name = productName.trim();
    const price = Number.parseFloat(productPrice.replace(",", "."));
    if (!name || name.length < 2) {
      toast({ kind: "error", title: "Indica il nome del prodotto" });
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast({ kind: "error", title: "Indica un prezzo maggiore di zero" });
      return;
    }
    createProduct.mutate({
      name,
      price,
      description: productDescription.trim() || undefined,
    });
  }

  const connected = Boolean(status.data?.connected);

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
          label="Siti nell'account"
          value={String(status.data?.site.sites.length ?? 0)}
          icon={<ShieldCheck className="h-5 w-5 text-secondary" aria-hidden="true" />}
          hint={status.data?.site.source === "discovered" ? "rilevati via MCP" : "configurati"}
        />
        <KpiCard
          label="Sito Wix"
          value={status.data?.site.name ?? (status.data?.site.id ? "Collegato" : "Nessuno")}
          icon={<ShoppingBag className="h-5 w-5 text-secondary" aria-hidden="true" />}
          hint={
            status.data?.site.source === "discovered"
              ? "rilevato dall'account collegato"
              : (status.data?.site.id ?? "nessun site id")
          }
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

      {connected && (
        <section aria-label="Business Wix" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text-primary">
              Business del sito {status.data?.site.name ? `"${status.data.site.name}"` : ""}
            </h2>
            <Button
              variant="ghost"
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["real", "wix"] });
              }}
            >
              Aggiorna
            </Button>
          </div>

          {business.isLoading ? (
            <Card>
              <Skeleton lines={3} />
            </Card>
          ) : business.isError ? (
            <Card>
              <EmptyState
                icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
                title="Dati commerciali non disponibili"
                description={
                  business.error instanceof Error ? business.error.message : "Riprova l'aggiornamento."
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label="Ricavi"
                value={`${business.data?.snapshot.revenue.toFixed(2) ?? "0.00"} ${
                  business.data?.snapshot.currency ?? "EUR"
                }`}
                icon={<TrendingUp className="h-5 w-5 text-secondary" aria-hidden="true" />}
                hint="ordini non annullati"
              />
              <KpiCard
                label="Ordini"
                value={String(business.data?.snapshot.ordersCount ?? 0)}
                icon={<ShoppingBag className="h-5 w-5 text-secondary" aria-hidden="true" />}
                hint="totali dal sito"
              />
              <KpiCard
                label="Scontrino medio"
                value={`${business.data?.snapshot.averageOrderValue.toFixed(2) ?? "0.00"} ${
                  business.data?.snapshot.currency ?? "EUR"
                }`}
                icon={<Wallet className="h-5 w-5 text-secondary" aria-hidden="true" />}
                hint="per ordine"
              />
              <KpiCard
                label="Prodotti in catalogo"
                value={String(business.data?.snapshot.productsCount ?? 0)}
                hint="e-commerce attivo"
              />
              <KpiCard
                label="Contatti"
                value={String(business.data?.snapshot.contactsCount ?? 0)}
                icon={<Users className="h-5 w-5 text-secondary" aria-hidden="true" />}
                hint="anagrafica CRM"
              />
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Catalogo prodotti</h2>
                <span className="text-xs text-text-muted">
                  {business.data?.snapshot.productsCount ?? 0} prodotti
                </span>
              </>
            }
            bodyClassName="p-0"
          >
            {(business.data?.snapshot.products ?? []).length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ShoppingBag className="h-5 w-5" aria-hidden="true" />}
                  title="Catalogo non disponibile"
                  description="Collega il tuo account Wix per leggere i prodotti reali del sito e gestirli da qui."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {(business.data?.snapshot.products ?? []).map((product, index) => (
                  <li
                    key={product.id ?? `${product.name}-${index}`}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/10">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {product.name ?? "Prodotto senza nome"}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {product.productType ?? "-"}
                          {product.availability ? ` · ${product.availability}` : ""}
                          {product.visible === false ? " · nascosto" : ""}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-text-primary">
                      {product.price ?? "-"} {product.currency ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Ordini recenti</h2>
                <span className="text-xs text-text-muted">
                  {business.data?.snapshot.ordersCount ?? 0} ordini
                </span>
              </>
            }
            bodyClassName="p-0"
          >
            {(business.data?.snapshot.orders ?? []).length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ShoppingBag className="h-5 w-5" aria-hidden="true" />}
                  title="Nessun ordine registrato"
                  description="Gli ordini del sito Wix compariranno qui non appena ci saranno acquisti: e' il dato reale, non una stima."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {(business.data?.snapshot.orders ?? []).map((order, index) => (
                  <li
                    key={order.id ?? `${order.number}-${index}`}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text-primary">
                        {order.number ?? order.id ?? "Ordine"}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {order.customer ?? "cliente non indicato"}
                        {order.status ? ` · ${order.status}` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-text-primary">
                      {order.total ?? "-"} {order.currency ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Crea un prodotto</h2>
                <span className="text-xs text-text-muted">scrittura reale su Wix</span>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-text-muted" htmlFor="wix-product-name">
                  Nome del prodotto
                  <Input
                    id="wix-product-name"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="Corso di formazione base"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted" htmlFor="wix-product-price">
                  Prezzo (EUR)
                  <Input
                    id="wix-product-price"
                    value={productPrice}
                    onChange={(event) => setProductPrice(event.target.value)}
                    placeholder="299.00"
                    inputMode="decimal"
                  />
                </label>
              </div>
              <label
                className="flex flex-col gap-1 text-xs text-text-muted"
                htmlFor="wix-product-description"
              >
                Descrizione
                <textarea
                  id="wix-product-description"
                  value={productDescription}
                  onChange={(event) => setProductDescription(event.target.value)}
                  rows={3}
                  placeholder="Cosa include e a chi e' rivolto"
                  className="w-full rounded-lg border border-secondary/20 bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-secondary/60"
                />
              </label>
              <div>
                <Button
                  variant="primary"
                  leftIcon={<PlusCircle className="h-4 w-4" aria-hidden="true" />}
                  loading={createProduct.isPending}
                  onClick={submitProduct}
                >
                  Crea nel catalogo Wix
                </Button>
              </div>
            </div>
          </Card>

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
        </div>

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
