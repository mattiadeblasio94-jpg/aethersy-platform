// =============================================================================
// Onboarding — solo azioni reali sul BFF.
//
// I quattro passi scrivono dati veri: un obiettivo (POST
// /api/platform/goals), l'attivazione dei canali social (POST
// /api/platform/platforms/:id/connect), la creazione di un'attivita' per uno
// degli agenti disponibili (POST /api/builder/tasks) e un riepilogo con i
// dati reali del workspace (piano, crediti, task in corso). Nessun workspace
// finto viene creato lato client.
// =============================================================================

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  Rocket,
  Share2,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  useAccount,
  useBuilderAgents,
  useBusinessCatalog,
  useConnectPlatform,
  useCreateBuilderTask,
  useCreateGoal,
  useGoals,
  useOverview,
  usePlatforms,
} from "@/lib/platform-queries";
import { useAuthStore } from "@/store/auth";
import { cn, formatNumber, platformLabel } from "@/lib/utils";

const BUSINESS_TYPES = [
  "Agenzia digitale",
  "E-commerce",
  "Attivita' locale",
  "Professionista",
  "Startup",
  "Associazione no-profit",
] as const;

const OBJECTIVES = [
  "Generare contatti commerciali",
  "Pubblicare con costanza",
  "Migliorare la presenza web",
  "Monitorare i risultati",
] as const;

/** Canali social attivabili dal workspace. */
const CHANNELS = ["instagram", "linkedin", "tiktok", "facebook", "x", "youtube"] as const;

const STEPS = [
  { id: 1, label: "La tua attivita'" },
  { id: 2, label: "I canali" },
  { id: 3, label: "La prima attivita'" },
  { id: 4, label: "Riepilogo" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuthStore((state) => state.user);

  const platforms = usePlatforms();
  const connectPlatform = useConnectPlatform();
  const builderAgents = useBuilderAgents();
  const createBuilderTask = useCreateBuilderTask();
  const goals = useGoals();
  const createGoal = useCreateGoal();
  const catalog = useBusinessCatalog();
  const account = useAccount();
  const overview = useOverview();

  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPES[0]);
  const [objective, setObjective] = useState<string>(OBJECTIVES[0]);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [agent, setAgent] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pendingChannel, setPendingChannel] = useState<string | null>(null);

  const goalStatuses = catalog.data?.goalStatuses ?? [];
  const goalStatus = goalStatuses[0]?.id ?? "active";
  const agentOptions = useMemo(
    () => (builderAgents.data ?? []).map((id) => ({ value: id, label: id })),
    [builderAgents.data],
  );
  const selectedAgent = agent || agentOptions[0]?.value || "";

  const connectedChannels = (platforms.data ?? [])
    .filter((platform) => platform.connected)
    .map((platform) => platform.provider);

  const createdGoal = goals.data?.find((goal) => goal.id === goalId);

  async function handleCreateGoal() {
    const title = `${companyName.trim()} — ${objective}`;
    try {
      const goal = await createGoal.mutateAsync({
        title,
        description: `Settore: ${businessType}. Obiettivo impostato durante l'onboarding.`,
        status: goalStatus,
      });
      setGoalId(goal.id);
      toast({ kind: "success", title: "Obiettivo creato" });
      setStep((current) => current + 1);
    } catch (error) {
      toast({
        kind: "error",
        title: "Obiettivo non creato",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleConnect(provider: string) {
    setPendingChannel(provider);
    try {
      await connectPlatform.mutateAsync(provider);
      toast({
        kind: "success",
        title: `${platformLabel(provider)} attivato`,
        description: "Il collegamento OAuth si completa in un secondo momento.",
      });
    } catch (error) {
      toast({
        kind: "error",
        title: "Canale non attivato",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPendingChannel(null);
    }
  }

  async function handleCreateTask() {
    if (!selectedAgent) return;
    try {
      const result = await createBuilderTask.mutateAsync({
        agent: selectedAgent,
        title: taskTitle.trim() || `Attivita' iniziale — ${companyName.trim() || "workspace"}`,
        description: `Attivita' creata in onboarding per ${companyName.trim() || "il workspace"}.`,
      });
      setTaskId(result.task.id);
      toast({ kind: "success", title: "Attivita' creata" });
      setStep((current) => current + 1);
    } catch (error) {
      toast({
        kind: "error",
        title: "Attivita' non creata",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 lg:py-12">
      <header className="mb-8 flex items-center gap-3">
        <img src="/brand/logo-192.png" alt="" width={36} height={36} className="h-9 w-9" />
        <span className="wordmark text-lg font-semibold text-text-primary">AETHERSY</span>
      </header>

      <div className="mb-8">
        <p className="text-sm text-text-muted">
          Ciao {user?.name?.split(" ")[0] ?? "benvenuto"}, completiamo la configurazione.
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">
          {STEPS[step].label}
        </h1>

        <ol className="mt-4 flex items-center gap-2" aria-label="Progresso onboarding">
          {STEPS.map((item, index) => (
            <li key={item.id} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  index < step
                    ? "bg-success/20 text-success"
                    : index === step
                      ? "gradient-accent text-accent-foreground"
                      : "bg-bg-hover text-text-muted",
                )}
              >
                {index < step ? <Check className="h-4 w-4" aria-hidden="true" /> : item.id}
              </span>
              <span
                className={cn(
                  "hidden text-xs sm:block",
                  index === step ? "text-text-primary" : "text-text-muted",
                )}
              >
                {item.label}
              </span>
              {index < STEPS.length - 1 && (
                <span className="h-px flex-1 bg-secondary/15" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1"
      >
        {step === 0 && (
          <Card className="flex flex-col gap-5">
            <Input
              label="Nome dell'attivita'"
              placeholder="Aethersy Studio"
              leftIcon={<Building2 className="h-4 w-4" aria-hidden="true" />}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              hint="Serve a costruire il primo obiettivo del workspace."
            />

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-text-secondary">Settore</legend>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={businessType === type}
                    onClick={() => setBusinessType(type)}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm transition-colors",
                      businessType === type
                        ? "border-secondary/50 bg-secondary/15 text-secondary"
                        : "border-secondary/15 text-text-secondary hover:bg-bg-hover",
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-text-secondary">
                Obiettivo principale
              </legend>
              <div className="flex flex-wrap gap-2">
                {OBJECTIVES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={objective === item}
                    onClick={() => setObjective(item)}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm transition-colors",
                      objective === item
                        ? "border-secondary/50 bg-secondary/15 text-secondary"
                        : "border-secondary/15 text-text-secondary hover:bg-bg-hover",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            <p className="text-sm text-text-muted">
              L'obiettivo viene salvato nel workspace (stato "{goalStatus}") e resta modificabile in
              qualsiasi momento dalla sezione Obiettivi.
            </p>
          </Card>
        )}

        {step === 1 && (
          <Card className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Share2 className="h-4 w-4 text-secondary" aria-hidden="true" />
              Attiva i canali che ti servono. Il collegamento OAuth si completa dopo, in un secondo
              momento.
            </p>

            {platforms.isLoading ? (
              <Skeleton lines={3} />
            ) : (
              <ul className="flex flex-col gap-2">
                {CHANNELS.map((provider) => {
                  const connected = connectedChannels.includes(provider);
                  return (
                    <li
                      key={provider}
                      className="flex items-center justify-between gap-3 rounded-lg border border-secondary/15 px-4 py-3"
                    >
                      <span className="flex items-center gap-3 text-sm text-text-primary">
                        {connected && (
                          <BadgeCheck className="h-4 w-4 text-success" aria-hidden="true" />
                        )}
                        {platformLabel(provider)}
                      </span>
                      {connected ? (
                        <Badge variant="success">Collegato</Badge>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={pendingChannel === provider}
                          onClick={() => void handleConnect(provider)}
                        >
                          Attiva
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-sm text-text-muted">
              Puoi attivare i canali anche più tardi: nessun canale è obbligatorio.
            </p>
          </Card>
        )}

        {step === 2 && (
          <Card className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Target className="h-4 w-4 text-secondary" aria-hidden="true" />
              Avvia una prima attività con uno degli agenti disponibili nel tuo workspace.
            </p>

            {builderAgents.isLoading ? (
              <Skeleton lines={3} />
            ) : agentOptions.length === 0 ? (
              <p className="text-sm text-text-muted">
                Nessun agente disponibile al momento: puoi avviare il lavoro scrivendo la richiesta
                dalla chat dello Studio.
              </p>
            ) : (
              <>
                <Select
                  label="Agente"
                  options={agentOptions}
                  value={selectedAgent}
                  onChange={(event) => setAgent(event.target.value)}
                  hint="Gli agenti disponibili sono quelli registrati nel BFF."
                />
                <Input
                  label="Titolo dell'attivita'"
                  placeholder="Es. Prima bozza del sito istituzionale"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                />
              </>
            )}
          </Card>
        )}

        {step === 3 && (
          <Card className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-text-primary">Riepilogo</h2>

            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2">
                <span className="text-text-secondary">Obiettivo</span>
                <span className="font-medium text-text-primary">
                  {createdGoal ? createdGoal.title : goalId ? "Creato" : "Non creato"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2">
                <span className="text-text-secondary">Canali attivati</span>
                <span className="font-medium text-text-primary">
                  {connectedChannels.length > 0
                    ? connectedChannels.map((provider) => platformLabel(provider)).join(", ")
                    : "Nessuno"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2">
                <span className="text-text-secondary">Attivita' creata</span>
                <span className="font-medium text-text-primary">
                  {taskId ? taskTitle || "Attivita' iniziale" : "Non creata"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2">
                <span className="text-text-secondary">Crediti disponibili</span>
                <span className="font-medium text-text-primary">
                  {formatNumber(account.data?.available ?? 0)}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2">
                <span className="text-text-secondary">Task in corso</span>
                <span className="font-medium text-text-primary">
                  {formatNumber(overview.data?.counters.tasks.running ?? 0)}
                </span>
              </li>
            </ul>

            <p className="text-sm text-text-muted">
              Tutti questi dati sono quelli registrati nel tuo workspace: puoi modificarli in
              qualsiasi momento.
            </p>
          </Card>
        )}
      </motion.div>

      <footer className="mt-8 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? navigate("/register") : setStep((current) => current - 1))}
          leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        >
          Indietro
        </Button>

        {step === 0 && (
          <Button
            disabled={companyName.trim().length < 2}
            loading={createGoal.isPending}
            onClick={() => void handleCreateGoal()}
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Crea l'obiettivo
          </Button>
        )}

        {step === 1 && (
          <Button
            onClick={() => setStep((current) => current + 1)}
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Continua
          </Button>
        )}

        {step === 2 && (
          <Button
            disabled={agentOptions.length === 0}
            loading={createBuilderTask.isPending}
            onClick={() => void handleCreateTask()}
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Crea l'attivita'
          </Button>
        )}

        {step === 3 && (
          <Button
            onClick={() => navigate("/dashboard", { replace: true })}
            leftIcon={<Rocket className="h-4 w-4" aria-hidden="true" />}
          >
            Entra nella Dashboard
          </Button>
        )}
      </footer>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Ogni scelta registrata qui resta modificabile dalle impostazioni del workspace.
      </p>
    </div>
  );
}
