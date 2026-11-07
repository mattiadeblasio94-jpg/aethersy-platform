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

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Coins,
  FolderOpen,
  Layers,
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
  Radar,
  Send,
  Target,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { PageHeader, EmptyState } from "@/components/common/PageElements";
import { PageTransition } from "@/components/common/Motion";
import { CyberBar, CyberPanel, CyberStat, CyberStatus } from "@/components/common/Cyber";
import type { CyberTone } from "@/components/common/Cyber";
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
import { HttpError } from "@/lib/http";
import { cn, formatDateTime, formatNumber, formatRelative } from "@/lib/utils";

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
  const [searchParams, setSearchParams] = useSearchParams();

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

  const convParam = searchParams.get("conv");
  const conversationList = useMemo(() => conversations.data ?? [], [conversations.data]);

  // Allinea i crediti in UI con il saldo reale, quando disponibile.
  useEffect(() => {
    if (balance.data) setCredits(balance.data.available);
  }, [balance.data, setCredits]);

  // Deep-link: ?conv=<id> seleziona la conversazione richiesta. La validita' e'
  // demandata alla rotta reale della conversazione, cosi' un id appena creato
  // (non ancora presente nella lista) resta selezionabile.
  useEffect(() => {
    if (convParam) {
      setActiveConversationId((current) => (current === convParam ? current : convParam));
      return;
    }
    if (!activeConversationId && conversationList.length > 0) {
      setActiveConversationId(conversationList[0].id);
    }
  }, [convParam, activeConversationId, conversationList]);

  // Fallback silenzioso: la conversazione richiesta non esiste (404) -> si
  // riparte dalla lista reale e la query string viene ripulita.
  const conversationMissing = Boolean(
    convParam &&
      conversation.isError &&
      conversation.error instanceof HttpError &&
      conversation.error.status === 404,
  );
  useEffect(() => {
    if (!conversationMissing) return;
    if (conversationList.length > 0) setActiveConversationId(conversationList[0].id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("conv");
        return next;
      },
      { replace: true },
    );
  }, [conversationMissing, conversationList, setSearchParams]);

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

  const activeConversation = useMemo(
    () => conversationList.find((row) => row.id === activeConversationId) ?? null,
    [conversationList, activeConversationId],
  );

  const activeRun = useMemo(
    () => (runs.data ?? []).find((run) => run.id === activeRunId) ?? null,
    [runs.data, activeRunId],
  );

  const rosterBusy = (roster.data ?? []).filter((droid) => droid.running > 0).length;
  const availableCredits = balance.data?.available;
  const creditsTone: CyberTone =
    availableCredits === undefined ? "idle" : availableCredits > 0 ? "active" : "attention";
  const decidingAssetId = decideAsset.isPending ? decideAsset.variables?.assetId : undefined;

  function selectConversation(id: string) {
    setActiveConversationId(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("conv", id);
        return next;
      },
      { replace: true },
    );
  }

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
      if (!activeConversationId) selectConversation(turn.conversationId);
      if (turn.action === "run_started" && turn.runId) {
        setActiveRunId(turn.runId);
        const stageLabel = turn.stage ? (STAGE_LABELS[turn.stage] ?? turn.stage) : "pipeline";
        toast({
          kind: "success",
          title: "Agenti al lavoro",
          description: `Stadio ${stageLabel}: gli specialisti stanno producendo i deliverable.`,
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
      selectConversation(created.id);
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

  const messageCount = conversation.data?.messages.length;
  const conversationTitle =
    conversation.data?.conversation.title ?? activeConversation?.title ?? "Conversazione";
  const messagesLabel = messageCount === undefined ? "messaggi n/d" : `${messageCount} messaggi`;
  const creditsLabel =
    availableCredits === undefined ? "crediti n/d" : `${formatNumber(availableCredits)} crediti`;

  return (
    <PageTransition>
      <div className="relative flex flex-col gap-4 lg:gap-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgb(var(--aethersy-secondary) / 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--aethersy-secondary) / 0.35) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage: "radial-gradient(ellipse at top, black 0%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(ellipse at top, black 0%, transparent 78%)",
            }}
          />
          <div
            className="absolute inset-x-0 top-0 h-80"
            style={{
              background:
                "radial-gradient(70% 90% at 50% 0%, rgb(var(--aethersy-secondary) / 0.14), transparent 72%)",
            }}
          />
        </div>

        <PageHeader
          title="Studio"
          description="Scrivi una richiesta: gli specialisti la trasformano in lavoro reale, sotto i tuoi occhi."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleNewConversation}
                loading={createConversation.isPending}
                leftIcon={<MessageSquarePlus className="h-4 w-4" aria-hidden="true" />}
              >
                Nuova conversazione
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CyberStat
            label="Opportunita' aperte"
            value={stats ? formatNumber(stats.runs.open) : "—"}
            hint={stats ? `${stats.runs.total} totali` : undefined}
            tone={stats && stats.runs.open > 0 ? "active" : "idle"}
            icon={<Target className="h-4 w-4" aria-hidden="true" />}
          />
          <CyberStat
            label="Task in corso"
            value={stats ? formatNumber(stats.tasks.running) : "—"}
            hint={stats ? `${stats.tasks.pending} in coda` : undefined}
            tone={stats && stats.tasks.running > 0 ? "active" : "idle"}
            icon={<Layers className="h-4 w-4" aria-hidden="true" />}
          />
          <CyberStat
            label="In revisione"
            value={stats ? formatNumber(stats.assets.inReview) : "—"}
            hint={stats ? `${stats.assets.total} deliverable prodotti` : undefined}
            tone={stats && stats.assets.inReview > 0 ? "attention" : "idle"}
            icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
          />
          <CyberStat
            label="Deliverable pronti"
            value={stats ? formatNumber(stats.assets.approved) : "—"}
            hint={stats ? `${stats.assets.delivered} consegnati` : undefined}
            tone={stats && stats.assets.approved > 0 ? "active" : "idle"}
            icon={<Zap className="h-4 w-4" aria-hidden="true" />}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[19rem_minmax(0,1fr)_22rem]">
          <CyberPanel
            label="Conversazioni"
            tone={activeConversationId ? "active" : "idle"}
            padded={false}
            header={
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                {conversationList.length > 0 ? `${conversationList.length} thread` : "nessun thread"}
              </span>
            }
          >
            <div className="max-h-[24rem] overflow-y-auto p-3 xl:max-h-[32rem]">
              {conversations.isLoading ? (
                <SkeletonList count={4} />
              ) : conversationList.length === 0 ? (
                <EmptyState
                  icon={<MessagesSquare className="h-5 w-5" aria-hidden="true" />}
                  title="Nessuna conversazione"
                  description="Crea una conversazione per parlare con l'orchestratore."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {conversationList.map((row) => {
                    const isActive = row.id === activeConversationId;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => selectConversation(row.id)}
                          aria-current={isActive ? "true" : undefined}
                          className={cn(
                            "group w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
                            isActive
                              ? "border-secondary/40 bg-secondary/10 shadow-glow"
                              : "border-secondary/10 hover:border-secondary/30 hover:bg-bg-hover/60",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                                isActive
                                  ? "animate-pulse-fast bg-secondary"
                                  : "bg-text-muted/50 group-hover:bg-secondary/70",
                              )}
                            />
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-sm font-medium",
                                isActive ? "text-text-primary" : "text-text-secondary",
                              )}
                            >
                              {row.title}
                            </span>
                          </span>
                          <span className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                            <span>{row.kind === "run" ? "run" : "chat"}</span>
                            <span>{formatRelative(row.updated_at)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CyberPanel>

          <CyberPanel
            label="Regia agenti"
            tone="active"
            scan
            padded={false}
            header={
              <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
                <span className="min-w-0 truncate font-display text-sm font-semibold text-text-primary">
                  {conversationTitle}
                </span>
                <CyberStatus
                  label={messagesLabel}
                  tone={messageCount === undefined ? "idle" : "neutral"}
                />
                <CyberStatus
                  label={creditsLabel}
                  tone={creditsTone}
                  pulse={availableCredits !== undefined && availableCredits > 0}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleNewConversation}
                  loading={createConversation.isPending}
                  leftIcon={<MessageSquarePlus className="h-4 w-4" aria-hidden="true" />}
                >
                  Nuova
                </Button>
              </div>
            }
          >
            <div className="flex h-[30rem] flex-col lg:h-[34rem]">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {conversation.isLoading ? (
                  <SkeletonList count={3} />
                ) : conversation.isError ? (
                  <EmptyState
                    icon={<Radar className="h-5 w-5" aria-hidden="true" />}
                    title="Conversazione non disponibile"
                    description="Non e' stato possibile caricare i messaggi di questa conversazione."
                  />
                ) : (messageCount ?? 0) === 0 ? (
                  <EmptyState
                    icon={<Bot className="h-5 w-5" aria-hidden="true" />}
                    title="Nessun messaggio"
                    description="Scrivi la tua richiesta: l'orchestratore apre il run e gli specialisti lavorano davvero."
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
                className="border-t border-secondary/10 bg-bg-primary/40 p-3"
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
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  <span>Invio: Enter · Maiusc+Invio: a capo</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Coins className="h-3 w-3" aria-hidden="true" />
                    {availableCredits === undefined
                      ? "crediti residui n/d"
                      : `${formatNumber(availableCredits)} crediti residui`}
                  </span>
                </div>
              </form>
            </div>
          </CyberPanel>

          <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
            <CyberPanel
              label="Esecuzione"
              tone={activeRun ? runTone(activeRun.status) : "idle"}
              padded={false}
              header={
                <div className="flex items-center gap-2">
                  <CyberStatus
                    label={activeRun ? runStatusLabel(activeRun.status) : "Nessun run"}
                    tone={activeRun ? runTone(activeRun.status) : "idle"}
                    pulse={activeRun?.status === "in_progress"}
                  />
                  {inReview.length > 0 && (
                    <CyberStatus label={`${inReview.length} da decidere`} tone="attention" />
                  )}
                </div>
              }
            >
              <div className="max-h-[13rem] overflow-y-auto border-b border-secondary/10 p-3">
                {runs.isLoading ? (
                  <Skeleton className="h-4 w-40" />
                ) : (runs.data ?? []).length === 0 ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                    Nessuna opportunita' registrata
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {(runs.data ?? []).map((run) => {
                      const isActive = run.id === activeRunId;
                      return (
                        <li key={run.id}>
                          <button
                            type="button"
                            onClick={() => setActiveRunId(run.id)}
                            aria-current={isActive ? "true" : undefined}
                            className={cn(
                              "w-full rounded-lg border px-3 py-2 text-left transition-all duration-200",
                              isActive
                                ? "border-secondary/40 bg-secondary/10"
                                : "border-secondary/10 hover:border-secondary/30 hover:bg-bg-hover/60",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-[9px] uppercase",
                                  isActive
                                    ? "border-secondary/40 bg-secondary/15 text-secondary"
                                    : "border-secondary/15 bg-bg-primary/60 text-text-muted",
                                )}
                              >
                                {(STAGE_LABELS[run.stage] ?? run.stage).slice(0, 2)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                                {run.title}
                              </span>
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                              <span>{STAGE_LABELS[run.stage] ?? run.stage}</span>
                              <span>{formatRelative(run.updated_at)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="max-h-[22rem] overflow-y-auto p-3">
                {!activeRunId ? (
                  <EmptyState
                    icon={<Radar className="h-5 w-5" aria-hidden="true" />}
                    title="Nessuna esecuzione selezionata"
                  />
                ) : runDetail.isLoading ? (
                  <SkeletonList count={3} />
                ) : runDetail.isError ? (
                  <EmptyState
                    icon={<Radar className="h-5 w-5" aria-hidden="true" />}
                    title="Esecuzione non disponibile"
                    description="Non e' stato possibile caricare i dettagli del run."
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                        Task degli specialisti
                      </p>
                      {(runDetail.data?.tasks.length ?? 0) === 0 ? (
                        <p className="text-sm text-text-muted">Ancora nessun task registrato.</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {runDetail.data?.tasks.map((task) => (
                            <li
                              key={task.id}
                              className="flex items-center gap-2 rounded-lg border border-secondary/10 bg-bg-primary/40 px-3 py-2"
                            >
                              <TaskStatusIcon status={task.status} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-text-primary">
                                  {task.title}
                                </span>
                                <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                                  {task.droid}
                                </span>
                              </span>
                              <Badge variant={taskStatusVariant(task.status)}>
                                {taskStatusLabel(task.status)}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                        Deliverable
                      </p>
                      {(runDetail.data?.assets.length ?? 0) === 0 ? (
                        <p className="text-sm text-text-muted">Ancora nessun deliverable.</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {runDetail.data?.assets.map((asset) => (
                            <li
                              key={asset.id}
                              className="rounded-lg border border-secondary/10 bg-bg-primary/40 p-3"
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
                                    loading={
                                      decidingAssetId === asset.id &&
                                      decideAsset.variables?.decision === "approved"
                                    }
                                    disabled={decideAsset.isPending}
                                    leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                                  >
                                    Approva
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleDecide(asset.id, "rejected")}
                                    loading={
                                      decidingAssetId === asset.id &&
                                      decideAsset.variables?.decision === "rejected"
                                    }
                                    disabled={decideAsset.isPending}
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
                      <CyberStatus
                        label={`${inReview.length} deliverable in attesa del tuo giudizio`}
                        tone="attention"
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/tasks")}
                      rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    >
                      Vedi task
                    </Button>
                  </div>
                )}
              </div>
            </CyberPanel>

            <CyberPanel
              label="Specialisti"
              tone={rosterBusy > 0 ? "active" : "idle"}
              padded={false}
              header={
                <CyberStatus
                  label={rosterBusy > 0 ? `${rosterBusy} al lavoro` : "in attesa"}
                  tone={rosterBusy > 0 ? "active" : "idle"}
                  pulse={rosterBusy > 0}
                />
              }
            >
              <div className="max-h-[18rem] overflow-y-auto p-3">
                {roster.isLoading ? (
                  <SkeletonList count={4} />
                ) : (roster.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={<Users className="h-5 w-5" aria-hidden="true" />}
                    title="Nessuno specialista"
                    description="Il roster degli specialisti apparira' qui."
                  />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {(roster.data ?? []).map((droid) => (
                      <DroidRow key={droid.id} droid={droid} />
                    ))}
                  </ul>
                )}
              </div>
            </CyberPanel>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

// --- Sotto-componenti --------------------------------------------------------

function MessageBubble({ message }: { message: MessageRow }) {
  if (message.role === "system") {
    return (
      <li className="mx-auto max-w-[90%] text-center">
        <span className="inline-block rounded-full border border-secondary/15 bg-bg-primary/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
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
          "max-w-[85%] rounded-xl border px-3.5 py-2.5",
          isUser
            ? "border-secondary/30 bg-gradient-to-br from-secondary/35 via-secondary/20 to-secondary/5 text-text-primary"
            : "border-secondary/20 bg-bg-primary/70 text-text-primary",
        )}
      >
        {!isUser && message.droid && (
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-secondary">
            {message.droid}
          </p>
        )}
        <p className="whitespace-pre-line text-sm">{message.content}</p>
        <p
          className={cn(
            "mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em]",
            isUser ? "text-secondary/80" : "text-text-muted",
          )}
        >
          <span>{formatDateTime(message.created_at)}</span>
          {message.credits > 0 && <span>{message.credits.toFixed(2)} crediti</span>}
        </p>
      </div>
    </li>
  );
}

function DroidRow({ droid }: { droid: RosterEntry }) {
  const busy = droid.running > 0;
  const failed = droid.failed > 0;
  return (
    <li className="rounded-lg border border-secondary/10 bg-bg-primary/40 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            busy
              ? "border-secondary/30 bg-secondary/15 text-secondary"
              : "border-secondary/10 bg-bg-hover/60 text-text-secondary",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Bot className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">{droid.name}</span>
          <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {droid.role}
          </span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <CyberStatus
          label={`${droid.running} in corso`}
          tone={busy ? "active" : "idle"}
          pulse={busy}
        />
        <CyberStatus label={`${droid.done} fatti`} tone="neutral" />
        {failed && <CyberStatus label={`${droid.failed} falliti`} tone="attention" />}
      </div>
      {droid.tasks > 0 && (
        <CyberBar
          className="mt-2"
          value={droid.done}
          max={droid.tasks}
          tone={busy ? "active" : failed ? "attention" : "neutral"}
          label="Avanzamento"
        />
      )}
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
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 rounded-full border border-secondary/30"
    />
  );
}

// --- Mappe di stato ----------------------------------------------------------

const RUN_STATUS_LABELS: Record<string, string> = {
  draft: "Aperta",
  in_progress: "In corso",
  in_review: "In revisione",
  approved: "Pronta",
  delivered: "Consegnata",
  failed: "Errore",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  queued: "In coda",
  running: "In corso",
  done: "Fatto",
  failed: "Fallito",
  skipped: "Saltato",
};

const TASK_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending: "default",
  queued: "default",
  running: "info",
  done: "success",
  failed: "error",
  skipped: "warning",
};

const ASSET_STATUS_LABELS: Record<string, string> = {
  draft: "Bozza",
  in_review: "In revisione",
  approved: "Approvato",
  rejected: "Rifiutato",
  delivered: "Consegnato",
};

const ASSET_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: "default",
  in_review: "warning",
  approved: "success",
  rejected: "error",
  delivered: "success",
};

function runStatusLabel(status: string): string {
  return RUN_STATUS_LABELS[status] ?? status;
}

function runTone(status: string): CyberTone {
  if (status === "in_progress") return "active";
  if (status === "in_review" || status === "failed") return "attention";
  if (status === "approved" || status === "delivered") return "active";
  return "idle";
}

function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

function taskStatusVariant(status: string): BadgeVariant {
  return TASK_STATUS_VARIANTS[status] ?? "default";
}

function assetStatusLabel(status: string): string {
  return ASSET_STATUS_LABELS[status] ?? status;
}

function assetStatusVariant(status: string): BadgeVariant {
  return ASSET_STATUS_VARIANTS[status] ?? "default";
}
