import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bot, Check, FolderOpen, Rocket, Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, PageHeader } from "@/components/common/PageElements";
import { useBuilderAgents, useBuilderProjects, useCreateBuilderTask } from "@/lib/platform-queries";
import { cn } from "@/lib/utils";

const AGENT_META: Record<string, { label: string; description: string }> = {
  planner: { label: "Planner", description: "Analizza il brief e prepara il piano di lavoro." },
  architect: { label: "Architect", description: "Definisce architettura, componenti e vincoli tecnici." },
  backend: { label: "Backend", description: "Implementa API, dati e logica di business." },
  frontend: { label: "Frontend", description: "Costruisce interfacce e pagine del prodotto." },
  brand: { label: "Brand", description: "Definisce identita' visiva e linee guida." },
  copy: { label: "Copy", description: "Scrive testi, landing e contenuti." },
  growth: { label: "Growth", description: "Progetta acquisizione e campagne." },
  devops: { label: "DevOps", description: "Gestisce deploy, ambienti e monitoraggio." },
  qa: { label: "QA", description: "Verifica qualita', test e rilascio." },
};

const PRIORITY_OPTIONS = [
  { value: "1", label: "Priorita' alta" },
  { value: "2", label: "Priorita' media" },
  { value: "3", label: "Priorita' standard" },
];

const STEPS = [
  { id: 1, label: "Agente" },
  { id: 2, label: "Task" },
  { id: 3, label: "Progetto" },
  { id: 4, label: "Riepilogo" },
];

function agentLabel(id: string): string {
  return AGENT_META[id]?.label ?? id;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

export default function AgentCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const agentsQuery = useBuilderAgents();
  const projectsQuery = useBuilderProjects();
  const createTask = useCreateBuilderTask();

  const [step, setStep] = useState(0);
  const [agent, setAgent] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("3");
  const [projectId, setProjectId] = useState("");

  const agents = agentsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const effectiveProjectId = projectId || projects[0]?.id || null;
  const effectiveProject = projects.find((item) => item.id === effectiveProjectId) ?? null;

  const canContinue = useMemo(() => {
    if (step === 0) return agent !== null;
    if (step === 1) return title.trim().length >= 3 && description.trim().length >= 10;
    return true;
  }, [step, agent, title, description]);

  async function finish() {
    if (!agent) return;
    try {
      const result = await createTask.mutateAsync({
        agent,
        title: title.trim(),
        description: description.trim(),
        projectId: effectiveProjectId,
        priority: Number(priority),
      });
      toast({
        kind: "success",
        title: "Task creato",
        description: `${result.task.title} e' stato assegnato a ${agentLabel(agent)}.`,
      });
      navigate("/agents", { replace: true });
    } catch (error) {
      toast({ kind: "error", title: "Creazione non riuscita", description: errorText(error) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crea Agente"
        description="Assegna un task reale a uno specialista della piattaforma: la coda e' quella del Builder."
      />

      <ol className="flex items-center gap-2" aria-label="Progresso creazione agente">
        {STEPS.map((item, index) => (
          <li key={item.id} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
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

      <Card>
        {step === 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium text-text-secondary">
              Quale specialista deve ricevere il task?
            </legend>
            {agentsQuery.isLoading ? (
              <Skeleton lines={5} />
            ) : agentsQuery.isError ? (
              <EmptyState
                icon={<Bot className="h-5 w-5" aria-hidden="true" />}
                title="Specialisti non disponibili"
                description={errorText(agentsQuery.error)}
                action={
                  <Button variant="secondary" size="sm" onClick={() => agentsQuery.refetch()}>
                    Ricarica agenti
                  </Button>
                }
              />
            ) : agents.length === 0 ? (
              <EmptyState
                icon={<Bot className="h-5 w-5" aria-hidden="true" />}
                title="Nessuno specialista disponibile"
                description="Il Builder non espone agenti eseguibili per questo tenant."
                action={
                  <Button variant="secondary" size="sm" onClick={() => agentsQuery.refetch()}>
                    Ricarca agenti
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((id) => {
                  const active = agent === id;
                  const meta = AGENT_META[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setAgent(id)}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                        active
                          ? "border-secondary/50 bg-secondary/15"
                          : "border-secondary/15 hover:bg-bg-hover",
                      )}
                    >
                      <span className="text-secondary">
                        <Bot className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-text-primary">
                          {meta?.label ?? id}
                        </span>
                        <span className="mt-0.5 block text-xs text-text-muted">
                          {meta?.description ?? `Specialista ${id}.`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <Input
              label="Titolo del task"
              placeholder="Es. Landing page prodotto Q3"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              hint="Almeno 3 caratteri."
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-brief" className="text-sm font-medium text-text-secondary">
                Brief
              </label>
              <textarea
                id="agent-brief"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Descrivi obiettivo, vincoli e risultato atteso."
                className="w-full rounded-lg border border-secondary/20 bg-primary/60 px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
              />
              <p className="text-sm text-text-muted">Almeno 10 caratteri.</p>
            </div>
            <Select
              label="Priorita'"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              hint="La priorita' influisce sull'ordine di esecuzione del Builder."
            />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            {projectsQuery.isLoading ? (
              <Skeleton lines={3} />
            ) : projectsQuery.isError ? (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <FolderOpen className="h-4 w-4 text-warning" aria-hidden="true" />
                  Progetti non raggiungibili
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {errorText(projectsQuery.error)} Alla creazione del task verra' comunque creato un
                  progetto dedicato.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => projectsQuery.refetch()}
                >
                  Ricarica progetti
                </Button>
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-secondary/15 bg-primary/40 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <FolderOpen className="h-4 w-4 text-secondary" aria-hidden="true" />
                  Nessun progetto attivo
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                  Alla creazione del task verra' creato automaticamente un progetto dedicato con il
                  titolo del task.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Select
                  label="Progetto"
                  options={projects.map((project) => ({ value: project.id, label: project.name }))}
                  value={effectiveProjectId ?? ""}
                  onChange={(event) => setProjectId(event.target.value)}
                  hint="Il task verra' accodato nel progetto selezionato."
                />
                {effectiveProject && (
                  <div className="rounded-xl border border-secondary/15 bg-primary/40 p-4">
                    <p className="text-xs text-text-muted">Progetto selezionato</p>
                    <p className="mt-1 text-sm font-medium text-text-primary">
                      {effectiveProject.name}
                    </p>
                    {effectiveProject.description && (
                      <p className="mt-1 text-sm text-text-secondary">
                        {effectiveProject.description}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-secondary/15 bg-primary/40 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Rocket className="h-4 w-4 text-secondary" aria-hidden="true" />
                Riepilogo
              </h3>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-text-muted">Specialista</dt>
                  <dd className="text-text-primary">{agent ? agentLabel(agent) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Titolo</dt>
                  <dd className="text-text-primary">{title || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Priorita'</dt>
                  <dd className="text-text-primary">
                    {PRIORITY_OPTIONS.find((item) => item.value === priority)?.label}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Progetto</dt>
                  <dd className="text-text-primary">{effectiveProject?.name ?? "Da creare"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-text-muted">Brief</dt>
                  <dd className="text-text-primary">{description || "—"}</dd>
                </div>
              </dl>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Target className="h-4 w-4" aria-hidden="true" />
              Il task viene creato nel Builder e reso visibile nella coda reale degli agenti.
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? navigate("/agents") : setStep((current) => current - 1))}
          leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        >
          Indietro
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            disabled={!canContinue}
            onClick={() => setStep((current) => current + 1)}
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Continua
          </Button>
        ) : (
          <Button
            loading={createTask.isPending}
            disabled={!canContinue || !agent}
            onClick={finish}
            leftIcon={<Bot className="h-4 w-4" aria-hidden="true" />}
          >
            Crea task
          </Button>
        )}
      </div>

      {createTask.isError && (
        <div className="flex items-center gap-2 text-sm text-error">
          <Badge variant="error">Errore</Badge>
          {errorText(createTask.error)}
        </div>
      )}
    </div>
  );
}
