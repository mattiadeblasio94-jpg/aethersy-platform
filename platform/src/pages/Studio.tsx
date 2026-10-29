// =============================================================================
// Studio (P2.2) — la regia della piattaforma. Qui l'utente VEDE gli agenti
// lavorare davvero:
//   - scrive in linguaggio naturale alla chat centrale (motore agenti);
//   - il motore apre uno stadio di pipeline e gli specialisti lo eseguono
//     (metrato, con l'executor AI reale);
//   - il roster mostra il carico reale per specialista;
//   - le opportunita' (run) e i deliverable in revisione compaiono in tempo reale.
// Tutti i dati vengono dal BFF Console: nessun mock.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Coins,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { PageHeader, EmptyState } from "@/components/common/PageElements";
import { useAuthStore } from "@/store/auth";
import {
  useBalance,
  useConversation,
  useConversations,
  useCreateConversation,
  useDecideAsset,
  useOverview,
  useRoster,
  useRun,
  useRuns,
  useSendMessage,
} from "@/lib/platform-queries";
import type { MessageRow, RosterEntry } from "@/lib/platform-api";
import { cn, formatNumber, formatRelative } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  brand: "Brand",
  website: "Sito Web",
  content: "Contenuti",
  social: "Social",
};

export default function Studio() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const setCredits = useAuthStore((s) => s.setCredits);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const overview = useOverview();
  const balance = useBalance();
  const roster = useRoster();
  const conversations = useConversations();
  const conversation = useConversation(activeConversationId);
  const runs = useRuns();
  const runDetail = useRun(activeRunId);

  const sendMessage = useSendMessage();
  const createConversation = useCreateConversation();
  const decideAsset = useDecideAsset();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Allinea i crediti in UI con il saldo reale, quando disponibile.
  useEffect(() => {
    if (balance.data) setCredits(balance.data.available);
  }, [balance.data, setCredits]);

  // Selezione iniziale: la conversazione piu' recente, se esiste.
  useEffect(() => {
    if (!activeConversationId && conversations.data && conversations.data.length > 0) {
      setActiveConversationId(conversations.data[0].id);
    }
  }, [activeConversationId, conversations.data]);

  // Autoscroll della chat ad ogni nuovo messaggio.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.data?.messages.length]);

  // Apre automaticamente il run piu' recente dopo un avvio.
  useEffect(() => {
    if (!activeRunId && runs.data && runs.data.length > 0) {
      setActiveRunId(runs.data[0].id);
    }
  }, [activeRunId, runs.data]);

  const stats = overview.data?.counters;
  const inReview = runDetail.data?.assets.filter((a) => a.status === "in_review") ?? [];

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sendMessage.isPending) return;
    setDraft("");
    try {
      const turn = await sendMessage.mutateAsync({
        text,
        conversationId: activeConversationId,
      });
      if (!activeConversationId) setActiveConversationId(turn.conversationId);
      if (turn.action === "run_started" && turn.runId) {
        setActiveRunId(turn.runId);
        toast({
          kind: "success",
          title: "Agenti al lavoro",
          description: `Stadio ${STAGE_LABELS[turn.stage ?? ""] ?? turn.stage}: gli specialisti stanno producendo i deliverable.`,
        });
      }
    } catch (err) {
      toast({
        kind: "error",
        title: "Invio non riuscito",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function handleNewConversation() {
    try {
      const created = await createConversation.mutateAsync(undefined);
      setActiveConversationId(created.id);
    } catch {
      toast({ kind: "error", title: "Impossibile creare la conversazione" });
    }
  }

  async function handleDecide(assetId: string, decision: "approved" | "rejected") {
    try {
      await decideAsset.mutateAsync({ assetId, decision, runId: activeRunId ?? undefined });
      toast({
        kind: decision === "approved" ? "success" : "info",
        title: decision === "approved" ? "Deliverable approvato" : "Deliverable rifiutato",
      });
    } catch {
      toast({ kind: "error", title: "Decisione non registrata" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Studio"
        description="Scrivi una richiesta: gli specialisti la trasformano in lavoro reale, sotto i tuoi occhi."
        actions={
          <Badge variant="accent" icon={<Coins className="h-3.5 w-3.5" />}>
            {balance.data ? `${formatNumber(balance.data.available)} crediti` : "—"}
          </Badge>
        }
      />

      {/* KPI: lo stato dell'azienda in un colpo d'occhio. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Opportunita' aperte" value={stats ? stats.runs.open : null} />
        <MiniStat label="Task in corso" value={stats ? stats.tasks.running : null} />
        <MiniStat label="In revisione" value={stats ? stats.assets.inReview : null} />
        <MiniStat label="Deliverable pronti" value={stats ? stats.assets.approved : null} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ---------------- Chat centrale ---------------- */}
        <Card
          bodyClassName="p-0"
          header={
            <div className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Sparkles className="h-4 w-4 text-secondary" aria-hidden="true" />
                Regia agenti
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewConversation}
                loading={createConversation.isPending}
                leftIcon={<MessageSquarePlus className="h-4 w-4" aria-hidden="true" />}
              >
                Nuova
              </Button>
            </div>
          }
        >
          <div className="flex h-[26rem] flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {conversation.isLoading ? (
                <SkeletonList count={3} />
              ) : (conversation.data?.messages.length ?? 0) === 0 ? (
                <EmptyState
                  icon={<Bot className="h-5 w-5" aria-hidden="true" />}
                  title="Nessun messaggio"
                  description="Prova: “Costruisci il brand di Aethersy” o “Preparami un calendario social per due settimane”."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {conversation.data?.messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </ul>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="border-t border-secondary/10 p-3"
              aria-label="Invia una richiesta"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={2}
                  placeholder="Descrivi cosa vuoi ottenere…"
                  className="min-h-11 flex-1 resize-none rounded-lg border border-secondary/20 bg-primary/60 px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
                  aria-label="Messaggio per gli agenti"
                />
                <Button
                  type="submit"
                  loading={sendMessage.isPending}
                  disabled={!draft.trim()}
                  leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                >
                  Invia
                </Button>
              </div>
            </form>
          </div>
        </Card>

        {/* ---------------- Roster ---------------- */}
        <Card
          bodyClassName="p-0"
          header={
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Bot className="h-4 w-4 text-secondary" aria-hidden="true" />
              Specialisti
            </span>
          }
        >
          <div className="max-h-[26rem] overflow-y-auto p-3">
            {roster.isLoading ? (
              <SkeletonList count={4} />
            ) : (
              <ul className="flex flex-col gap-2">
                {(roster.data ?? []).map((droid) => (
                  <DroidRow key={droid.id} droid={droid} />
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* ---------------- Opportunita' + deliverable ---------------- */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card
          bodyClassName="p-0"
          header={
            <span className="text-sm font-semibold text-text-primary">Opportunita'</span>
          }
        >
          <div className="max-h-[22rem] overflow-y-auto p-3">
            {runs.isLoading ? (
              <SkeletonList count={3} />
            ) : (runs.data ?? []).length === 0 ? (
              <EmptyState
                title="Nessuna opportunita'"
                description="Chiedi un lavoro nella regia: comparira' qui."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {(runs.data ?? []).map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => setActiveRunId(run.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        activeRunId === run.id
                          ? "border-secondary/40 bg-secondary/10"
                          : "border-secondary/10 hover:bg-bg-hover",
                      )}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/15 text-xs font-semibold text-secondary">
                        {STAGE_LABELS[run.stage]?.slice(0, 2) ?? run.stage.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {run.title}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {STAGE_LABELS[run.stage] ?? run.stage} · {formatRelative(run.updated_at)}
                        </span>
                      </span>
                      <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card
          bodyClassName="p-0"
          header={
            <span className="text-sm font-semibold text-text-primary">
              Esecuzione{runDetail.data ? ` · ${runDetail.data.run.title}` : ""}
            </span>
          }
        >
          <div className="max-h-[22rem] overflow-y-auto p-3">
            {!activeRunId ? (
              <EmptyState title="Nessuna esecuzione selezionata" />
            ) : runDetail.isLoading ? (
              <SkeletonList count={3} />
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Task degli specialisti
                  </p>
                  <ul className="flex flex-col gap-2">
                    {(runDetail.data?.tasks ?? []).map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center gap-3 rounded-lg border border-secondary/10 px-3 py-2"
                      >
                        <TaskStatusIcon status={task.status} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-text-primary">{task.title}</span>
                          <span className="block text-xs text-text-muted">{task.droid}</span>
                        </span>
                        <Badge variant={taskStatusVariant(task.status)}>
                          {taskStatusLabel(task.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Deliverable
                  </p>
                  {(runDetail.data?.assets.length ?? 0) === 0 ? (
                    <p className="text-sm text-text-muted">Ancora nessun deliverable.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {runDetail.data?.assets.map((asset) => (
                        <li
                          key={asset.id}
                          className="rounded-lg border border-secondary/10 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                              {asset.name}
                            </span>
                            <Badge variant={assetStatusVariant(asset.status)}>
                              {assetStatusLabel(asset.status)}
                            </Badge>
                          </div>
                          {typeof asset.meta?.content === "string" && (
                            <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs text-text-secondary">
                              {String(asset.meta.content).slice(0, 400)}
                            </p>
                          )}
                          {asset.status === "in_review" && (
                            <div className="mt-2 flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleDecide(asset.id, "approved")}
                                leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                              >
                                Approva
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDecide(asset.id, "rejected")}
                                leftIcon={<XCircle className="h-4 w-4" aria-hidden="true" />}
                              >
                                Rifiuta
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {inReview.length > 0 && (
                  <p className="text-xs text-text-muted">
                    {inReview.length} deliverable in attesa del tuo giudizio.
                  </p>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/tasks`)}
                  rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                >
                  Vedi tutti i task
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// --- Sotto-componenti --------------------------------------------------------

function MiniStat({ label, value }: { label: string; value: number | null }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="font-display text-2xl font-semibold text-text-primary">
        {value === null ? <Skeleton className="h-7 w-10" /> : formatNumber(value)}
      </span>
      <span className="text-sm text-text-secondary">{label}</span>
    </Card>
  );
}

function MessageBubble({ message }: { message: MessageRow }) {
  if (message.role === "system") {
    return (
      <li className="mx-auto max-w-[90%] text-center">
        <span className="inline-block rounded-full bg-bg-hover px-3 py-1 text-xs text-text-muted">
          {message.content}
          {message.credits > 0 && ` · ${message.credits.toFixed(2)} crediti`}
        </span>
      </li>
    );
  }
  const isUser = message.role === "user";
  return (
    <li className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
          isUser
            ? "gradient-accent text-accent-foreground"
            : "border border-secondary/10 bg-bg-hover text-text-primary",
        )}
      >
        <p className="whitespace-pre-line">{message.content}</p>
        {message.credits > 0 && (
          <p className={cn("mt-1 text-[11px]", isUser ? "text-accent-foreground/70" : "text-text-muted")}>
            {message.credits.toFixed(2)} crediti
          </p>
        )}
      </div>
    </li>
  );
}

function DroidRow({ droid }: { droid: RosterEntry }) {
  const busy = droid.running > 0;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-secondary/10 px-3 py-2.5">
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          busy ? "bg-secondary/20" : "bg-bg-hover",
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-secondary" aria-hidden="true" />
        ) : (
          <Bot className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">
          {droid.name}
        </span>
        <span className="block truncate text-xs text-text-muted">{droid.role}</span>
      </span>
      <span className="text-right">
        <span className="block text-xs text-text-secondary">
          {droid.done} fatti{droid.running > 0 ? ` · ${droid.running} in corso` : ""}
        </span>
      </span>
    </li>
  );
}

function TaskStatusIcon({ status }: { status: string }) {
  if (status === "running")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-secondary" aria-hidden="true" />;
  if (status === "done")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />;
  if (status === "failed")
    return <XCircle className="h-4 w-4 shrink-0 text-error" aria-hidden="true" />;
  return <span className="h-4 w-4 shrink-0 rounded-full border border-secondary/30" />;
}

// --- Mappe di stato ----------------------------------------------------------

function runStatusLabel(status: string): string {
  return (
    { draft: "Aperta", in_progress: "In corso", in_review: "In revisione", approved: "Pronta", delivered: "Consegnata", failed: "Errore" }[
      status
    ] ?? status
  );
}

function runStatusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
  return (
    ({ draft: "default", in_progress: "info", in_review: "warning", approved: "success", delivered: "success", failed: "error" } as const)[
      status
    ] ?? "default"
  );
}

function taskStatusLabel(status: string): string {
  return (
    { pending: "In attesa", running: "In corso", done: "Fatto", failed: "Fallito", skipped: "Saltato" }[
      status
    ] ?? status
  );
}

function taskStatusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
  return (
    ({ pending: "default", running: "info", done: "success", failed: "error", skipped: "warning" } as const)[
      status
    ] ?? "default"
  );
}

function assetStatusLabel(status: string): string {
  return (
    { draft: "Bozza", in_review: "In revisione", approved: "Approvato", rejected: "Rifiutato", delivered: "Consegnato" }[
      status
    ] ?? status
  );
}

function assetStatusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
  return (
    ({ draft: "default", in_review: "warning", approved: "success", rejected: "error", delivered: "success" } as const)[
      status
    ] ?? "default"
  );
}
