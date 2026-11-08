import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  Plug,
  PlugZap,
  Search,
  ShieldAlert,
  Sparkles,
  Unplug,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, PageHeader } from "@/components/common/PageElements";
import { PageTransition } from "@/components/common/Motion";
import {
  useConnectors,
  useDeleteConnectorApp,
  useDisconnectConnector,
  useRegisterConnectorApp,
  useSaveConnectorApiKey,
  useTestConnector,
} from "@/lib/platform-queries";
import { platformApi } from "@/lib/platform-api";
import type { ConnectorEntry } from "@/lib/platform-api";

// Pagina "Connettori": l'elenco dei provider che il tenant puo' collegare con
// il proprio account. Il collegamento e' un login reale al provider (Google,
// GitHub, oppure l'app OAuth dedicata del provider); il token resta cifrato
// sul server.

const AUTH_BADGE: Record<ConnectorEntry["auth"], { label: string; variant: "info" | "accent" | "default" | "warning" }> = {
  google: { label: "Login Google", variant: "info" },
  github: { label: "Login GitHub", variant: "accent" },
  provider: { label: "Login del provider", variant: "info" },
  api_key: { label: "Credenziale", variant: "warning" },
};

export default function Connectors() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const connectors = useConnectors();
  const saveKey = useSaveConnectorApiKey();
  const testConnector = useTestConnector();
  const disconnectConnector = useDisconnectConnector();
  const registerApp = useRegisterConnectorApp();
  const deleteApp = useDeleteConnectorApp();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [keyTarget, setKeyTarget] = useState<ConnectorEntry | null>(null);
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [appTarget, setAppTarget] = useState<ConnectorEntry | null>(null);
  const [appValues, setAppValues] = useState({ clientId: "", clientSecret: "" });
  const [testingId, setTestingId] = useState<string | null>(null);

  const entries = connectors.data?.connectors ?? [];
  const groups = connectors.data?.groups ?? [];
  const summary = connectors.data?.summary;

  // Ritorno dal provider: il backend manda l'utente qui con il risultato.
  useEffect(() => {
    const connected = params.get("connected");
    const message = params.get("message");
    const error = params.get("error");
    const connect = params.get("connect");
    if (!connected && !error && !connect) return;

    if (connected) {
      toast({
        kind: "success",
        title: "Account collegato",
        description: message ?? `${connected} e' pronto all'uso.`,
      });
    } else if (error) {
      toast({
        kind: "error",
        title: "Collegamento non riuscito",
        description: message ?? "Riprova fra poco.",
      });
    }

    if (connect && error) {
      const target = entries.find((entry) => entry.id === connect);
      if (target?.auth === "api_key") {
        setKeyTarget(target);
        setKeyValues({});
      }
    }

    const next = new URLSearchParams(params);
    next.delete("connected");
    next.delete("connect");
    next.delete("error");
    next.delete("message");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, entries]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!needle) return true;
      return (
        entry.label.toLowerCase().includes(needle) ||
        entry.capabilities.some((item) => item.toLowerCase().includes(needle))
      );
    });
    // I connettori "master" (un solo accesso per piu' servizi) in testa.
    return [...filtered].sort((a, b) => Number(Boolean(b.master)) - Number(Boolean(a.master)));
  }, [entries, search, category]);

  function handleConnect(entry: ConnectorEntry) {
    if (entry.auth === "api_key") {
      setKeyTarget(entry);
      setKeyValues({});
      return;
    }
    if (!entry.configured) {
      // Provider con app OAuth dedicata: il tenant registra la sua app, poi il
      // pulsante porta alla pagina di accesso del provider.
      if (entry.auth === "provider") {
        setAppTarget(entry);
        setAppValues({ clientId: "", clientSecret: "" });
        return;
      }
      toast({
        kind: "error",
        title: `${entry.label} non e' ancora attivabile`,
        description: entry.missingReason ?? "App OAuth del provider non configurata.",
      });
      return;
    }
    // Redirect del browser: il provider fa login e consenso.
    window.location.assign(platformApi.connectorConnectUrl(entry.id));
  }

  async function handleSaveApp() {
    if (!appTarget) return;
    try {
      await registerApp.mutateAsync({
        id: appTarget.id,
        clientId: appValues.clientId.trim(),
        clientSecret: appValues.clientSecret.trim(),
        redirectUri: appTarget.redirectUri,
      });
      toast({
        kind: "success",
        title: `App ${appTarget.label} registrata`,
        description: `Ora il pulsante "${appTarget.loginLabel}" porta alla pagina di accesso di ${appTarget.label}.`,
      });
      setAppTarget(null);
      setAppValues({ clientId: "", clientSecret: "" });
    } catch (err) {
      toast({
        kind: "error",
        title: "Registrazione app non riuscita",
        description: (err as Error).message || "Riprova fra poco.",
      });
    }
  }

  async function handleDeleteApp(entry: ConnectorEntry) {
    try {
      await deleteApp.mutateAsync(entry.id);
      toast({
        kind: "success",
        title: `App ${entry.label} rimossa`,
        description: "La connessione resta attiva finche' non la scolleghi.",
      });
    } catch (err) {
      toast({
        kind: "error",
        title: "Rimozione non riuscita",
        description: (err as Error).message || "Riprova fra poco.",
      });
    }
  }

  async function handleSaveKey() {
    if (!keyTarget) return;
    try {
      await saveKey.mutateAsync({ id: keyTarget.id, fields: keyValues });
      toast({
        kind: "success",
        title: `${keyTarget.label} collegato`,
        description: "La credenziale e' salvata cifrata sul server.",
      });
      setKeyTarget(null);
      setKeyValues({});
    } catch (err) {
      toast({
        kind: "error",
        title: "Salvataggio non riuscito",
        description: (err as Error).message || "Riprova fra poco.",
      });
    }
  }

  async function handleTest(entry: ConnectorEntry) {
    setTestingId(entry.id);
    try {
      const result = await testConnector.mutateAsync(entry.id);
      toast({
        kind: result.ok ? "success" : "error",
        title: result.ok ? `${entry.label}: connessione verificata` : `${entry.label}: verifica fallita`,
        description: result.detail,
      });
    } catch (err) {
      toast({
        kind: "error",
        title: `${entry.label}: verifica non riuscita`,
        description: (err as Error).message || "Riprova fra poco.",
      });
    } finally {
      setTestingId(null);
    }
  }

  async function handleDisconnect(entry: ConnectorEntry) {
    try {
      await disconnectConnector.mutateAsync(entry.id);
      toast({
        kind: "success",
        title: `${entry.label} scollegato`,
        description: "Le credenziali non sono piu' usate dalla piattaforma.",
      });
    } catch (err) {
      toast({
        kind: "error",
        title: "Scollegamento non riuscito",
        description: (err as Error).message || "Riprova fra poco.",
      });
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Connettori"
        description="Collega i tuoi account: ogni provider si attiva con un login reale, i token restano cifrati sul server."
        actions={
          summary ? (
            <Badge variant={summary.connected > 0 ? "success" : "default"}>
              {summary.connected} collegati su {summary.total}
            </Badge>
          ) : null
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca un servizio (es. Gmail, Notion, Stripe)"
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            aria-label="Cerca un connettore"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={category === "all" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setCategory("all")}
          >
            Tutti
          </Button>
          {groups
            .filter((group) => group.count > 0)
            .map((group) => (
              <Button
                key={group.key}
                variant={category === group.key ? "primary" : "secondary"}
                size="sm"
                onClick={() => setCategory(group.key)}
              >
                {group.label}
                <span className="ml-1 opacity-70">{group.count}</span>
              </Button>
            ))}
        </div>
      </div>

      {connectors.isLoading ? (
        <Card>
          <Skeleton lines={6} />
        </Card>
      ) : connectors.isError ? (
        <Card>
          <EmptyState
            icon={<Plug className="h-5 w-5" aria-hidden="true" />}
            title="Catalogo non disponibile"
            description="Il BFF non ha risposto: riprova fra poco."
            action={
              <Button variant="secondary" size="sm" onClick={() => connectors.refetch()}>
                Ricarica
              </Button>
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Plug className="h-5 w-5" aria-hidden="true" />}
            title="Nessun connettore trovato"
            description="Cambia la ricerca o la categoria per vedere gli altri provider."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((entry) => {
            const badge = AUTH_BADGE[entry.auth];
            return (
              <Card key={entry.id} className="flex h-full flex-col" bodyClassName="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold text-text-primary">
                      {entry.label}
                    </h2>
                    <p className="text-xs text-text-muted">{entry.categoryLabel}</p>
                  </div>
                  {entry.connected ? (
                    <Badge variant="success" icon={<CheckCircle2 className="h-3 w-3" aria-hidden="true" />}>
                      Collegato
                    </Badge>
                  ) : entry.master ? (
                    <Badge variant="accent" icon={<Sparkles className="h-3 w-3" aria-hidden="true" />}>
                      Un solo accesso
                    </Badge>
                  ) : entry.configured ? (
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  ) : (
                    <Badge variant="warning" icon={<ShieldAlert className="h-3 w-3" aria-hidden="true" />}>
                      Da attivare
                    </Badge>
                  )}
                </div>

                <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                  {entry.capabilities.slice(0, 4).map((capability) => (
                    <li key={capability} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-secondary/60" aria-hidden="true" />
                      <span>{capability}</span>
                    </li>
                  ))}
                </ul>

                {entry.master && entry.masterServices.length ? (
                  <p className="text-xs text-text-muted">
                    Attiva con un solo accesso:{" "}
                    {entry.masterServices
                      .map((id) => entries.find((item) => item.id === id)?.label ?? id)
                      .join(", ")}
                  </p>
                ) : null}

                {!entry.configured && entry.missingReason ? (
                  <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    {entry.missingReason}
                  </p>
                ) : null}

                {entry.notice ? (
                  <div className="rounded-lg border border-secondary/25 bg-bg-hover px-3 py-2 text-xs text-text-secondary">
                    <p>{entry.notice}</p>
                    {entry.consoleUrl ? (
                      <a
                        className="mt-1 inline-flex items-center gap-1 text-secondary underline"
                        href={entry.consoleUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        Apri la console Google
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {entry.appRegistered ? (
                  <p className="text-xs text-text-muted">
                    App OAuth registrata da te: il login parte dalla pagina di {entry.label}.
                  </p>
                ) : null}

                {entry.connected && entry.connectedAt ? (
                  <p className="text-xs text-text-muted">
                    Collegato il {new Date(entry.connectedAt).toLocaleString("it-IT")}
                  </p>
                ) : null}

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {entry.connected ? (
                    <>
                      {entry.testable ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={testingId === entry.id}
                          leftIcon={<PlugZap className="h-4 w-4" aria-hidden="true" />}
                          onClick={() => handleTest(entry)}
                        >
                          Prova
                        </Button>
                      ) : null}
                      {entry.auth === "provider" && !entry.appRegistered ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAppTarget(entry);
                            setAppValues({ clientId: "", clientSecret: "" });
                          }}
                        >
                          Registra l'app
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={disconnectConnector.isPending && disconnectConnector.variables === entry.id}
                        leftIcon={<Unplug className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => handleDisconnect(entry)}
                      >
                        Scollega
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!entry.configured && entry.auth !== "provider"}
                        leftIcon={
                          entry.auth === "api_key" ? (
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                          ) : entry.auth === "provider" && !entry.configured ? (
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Link2 className="h-4 w-4" aria-hidden="true" />
                          )
                        }
                        onClick={() => handleConnect(entry)}
                      >
                        {entry.auth === "api_key"
                          ? "Inserisci credenziale"
                          : entry.auth === "provider" && !entry.configured
                            ? "Registra l'app"
                            : entry.loginLabel}
                      </Button>
                      {entry.appRegistered ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={deleteApp.isPending && deleteApp.variables === entry.id}
                          onClick={() => handleDeleteApp(entry)}
                        >
                          Rimuovi app
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={keyTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setKeyTarget(null);
            setKeyValues({});
          }
        }}
        title={keyTarget ? `Collega ${keyTarget.label}` : "Collega"}
        description="Questo provider non offre un login OAuth: incolla la credenziale del tuo account. Resta cifrata sul server."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setKeyTarget(null)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saveKey.isPending}
              onClick={handleSaveKey}
            >
              Salva e collega
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {keyTarget?.howTo ? (
            <p className="rounded-lg border border-secondary/20 bg-bg-hover px-3 py-2 text-sm text-text-secondary">
              {keyTarget.howTo}
            </p>
          ) : null}
          {(keyTarget?.apiKeyFields ?? []).map((field) => (
            <Input
              key={field.key}
              label={field.label}
              type={field.secret ? "password" : "text"}
              value={keyValues[field.key] ?? ""}
              onChange={(event) =>
                setKeyValues((prev) => ({ ...prev, [field.key]: event.target.value }))
              }
              autoComplete="off"
            />
          ))}
        </div>
      </Modal>
      <Modal
        open={appTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAppTarget(null);
            setAppValues({ clientId: "", clientSecret: "" });
          }
        }}
        title={appTarget ? `Collega ${appTarget.label}` : "Collega"}
        description={
          appTarget
            ? `Crea l'app di ${appTarget.label} nella console del provider, poi registra qui le credenziali: il pulsante di accesso portera' l'utente alla pagina di login di ${appTarget.label}.`
            : ""
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAppTarget(null)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={registerApp.isPending}
              disabled={!appValues.clientId.trim() || !appValues.clientSecret.trim()}
              onClick={handleSaveApp}
            >
              Salva e attiva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {appTarget?.signupUrl ? (
            <a
              className="inline-flex items-center gap-2 text-sm text-secondary underline"
              href={appTarget.signupUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Apri la console sviluppatore di {appTarget.label}
            </a>
          ) : null}

          {appTarget?.howTo ? (
            <p className="rounded-lg border border-secondary/20 bg-bg-hover px-3 py-2 text-sm text-text-secondary">
              {appTarget.howTo}
            </p>
          ) : null}

          {appTarget ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                Callback da registrare nel provider
              </span>
              <code className="rounded-lg border border-secondary/20 bg-bg-hover px-3 py-2 text-xs break-all text-text-primary">
                {appTarget.redirectUri}
              </code>
            </div>
          ) : null}

          <Input
            label="Client ID"
            value={appValues.clientId}
            onChange={(event) =>
              setAppValues((prev) => ({ ...prev, clientId: event.target.value }))
            }
            autoComplete="off"
          />
          <Input
            label="Client Secret"
            type="password"
            value={appValues.clientSecret}
            onChange={(event) =>
              setAppValues((prev) => ({ ...prev, clientSecret: event.target.value }))
            }
            autoComplete="off"
          />
          <p className="text-xs text-text-muted">
            Il secret e' cifrato sul server e non viene mai mostrato in chiaro.
          </p>
        </div>
      </Modal>
    </PageTransition>
  );
}
