// =============================================================================
// Crea Agente (brief §3.2) — rotta /agents/create. Procedura guidata in quattro
// passi con validazione per passo, riepilogo finale e ritorno a /agents.
// =============================================================================

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  FileText,
  Globe,
  Megaphone,
  Rocket,
  Send,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/common/PageElements";
import { useCreateAgent, usePlatforms } from "@/lib/queries";
import type { AgentType } from "@/lib/types";
import { cn, platformLabel } from "@/lib/utils";

const TYPES: { value: AgentType; label: string; description: string; icon: ReactNode }[] = [
  { value: "social", label: "Social", description: "Pianifica e pubblica contenuti.", icon: <Share2 className="h-5 w-5" aria-hidden="true" /> },
  { value: "content", label: "Contenuti", description: "Scrive caption, script e descrizioni.", icon: <FileText className="h-5 w-5" aria-hidden="true" /> },
  { value: "outreach", label: "Outreach", description: "Contatta prospect e gestisce follow-up.", icon: <Send className="h-5 w-5" aria-hidden="true" /> },
  { value: "analytics", label: "Analisi", description: "Monitora KPI e produce report.", icon: <BarChart3 className="h-5 w-5" aria-hidden="true" /> },
  { value: "web", label: "Sito Web", description: "Gestisce pagine e contenuti del sito.", icon: <Globe className="h-5 w-5" aria-hidden="true" /> },
  { value: "ads", label: "Annunci", description: "Ottimizza budget e creativita' ads.", icon: <Megaphone className="h-5 w-5" aria-hidden="true" /> },
];

const MODELS = [
  "OpenRouter · gpt-4o-mini",
  "OpenRouter · gpt-4o",
  "OpenRouter · claude-3-haiku",
  "OpenRouter · llama-3.1-70b",
] as const;

const SCHEDULES = [
  { value: "manual", label: "Manuale" },
  { value: "hourly", label: "Ogni ora" },
  { value: "daily", label: "Ogni giorno" },
  { value: "weekly", label: "Ogni settimana" },
] as const;

const STEPS = [
  { id: 1, label: "Tipo" },
  { id: 2, label: "Configura" },
  { id: 3, label: "Piattaforme" },
  { id: 4, label: "Scheduling" },
];

export default function AgentCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const platforms = usePlatforms();
  const createAgent = useCreateAgent();

  const [step, setStep] = useState(0);
  const [type, setType] = useState<AgentType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState<string>(MODELS[0]);
  const [temperature, setTemperature] = useState(0.7);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<string>("daily");
  const [time, setTime] = useState("09:00");

  const canContinue = useMemo(() => {
    if (step === 0) return type !== null;
    if (step === 1) return name.trim().length >= 3 && description.trim().length >= 10;
    if (step === 2) return selectedPlatforms.length > 0;
    return true;
  }, [step, type, name, description, selectedPlatforms]);

  function togglePlatform(id: string) {
    setSelectedPlatforms((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function finish() {
    if (!type) return;
    try {
      await createAgent.mutateAsync({ name: name.trim(), type });
      toast({
        kind: "success",
        title: "Agente creato",
        description: `${name.trim()} e' pronto nella tua lista agenti.`,
      });
      navigate("/agents", { replace: true });
    } catch {
      toast({ kind: "error", title: "Creazione non riuscita" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crea Agente"
        description="Configura un nuovo agente AI in quattro passi."
      />

      {/* Avanzamento */}
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
              Che tipo di agente vuoi creare?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TYPES.map((item) => {
                const active = type === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setType(item.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                      active
                        ? "border-secondary/50 bg-secondary/15"
                        : "border-secondary/15 hover:bg-bg-hover",
                    )}
                  >
                    <span className="text-secondary">{item.icon}</span>
                    <span>
                      <span className="block text-sm font-semibold text-text-primary">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-muted">
                        {item.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <Input
              label="Nome agente"
              placeholder="Es. Social Curator"
              value={name}
              onChange={(event) => setName(event.target.value)}
              hint="Almeno 3 caratteri."
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-description" className="text-sm font-medium text-text-secondary">
                Descrizione
              </label>
              <textarea
                id="agent-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Descrivi cosa deve fare l'agente e con quale tono."
                className="w-full rounded-lg border border-secondary/20 bg-primary/60 px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
              />
              <p className="text-sm text-text-muted">Almeno 10 caratteri.</p>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-text-secondary">Modello AI</legend>
              <div className="flex flex-wrap gap-2">
                {MODELS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={model === item}
                    onClick={() => setModel(item)}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm transition-colors",
                      model === item
                        ? "border-secondary/50 bg-secondary/15 text-secondary"
                        : "border-secondary/15 text-text-secondary hover:bg-bg-hover",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-temperature" className="text-sm font-medium text-text-secondary">
                Creativita': {temperature.toFixed(1)}
              </label>
              <input
                id="agent-temperature"
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
                className="w-full accent-secondary"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium text-text-secondary">
              Su quali piattaforme deve operare?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(platforms.data ?? []).map((platform) => {
                const active = selectedPlatforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePlatform(platform.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      active
                        ? "border-secondary/50 bg-secondary/15 text-text-primary"
                        : "border-secondary/15 text-text-secondary hover:bg-bg-hover",
                    )}
                  >
                    <img src={platform.icon} alt="" width={20} height={20} className="h-5 w-5" />
                    <span className="flex-1">{platform.name}</span>
                    {active && <Check className="h-4 w-4 text-success" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-text-secondary">Frequenza</legend>
              <div className="flex flex-wrap gap-2">
                {SCHEDULES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={schedule === item.value}
                    onClick={() => setSchedule(item.value)}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm transition-colors",
                      schedule === item.value
                        ? "border-secondary/50 bg-secondary/15 text-secondary"
                        : "border-secondary/15 text-text-secondary hover:bg-bg-hover",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {schedule !== "manual" && schedule !== "hourly" && (
              <Input
                label="Orario di esecuzione"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="sm:max-w-[200px]"
              />
            )}

            {/* Riepilogo */}
            <div className="rounded-xl border border-secondary/15 bg-primary/40 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Rocket className="h-4 w-4 text-secondary" aria-hidden="true" />
                Riepilogo
              </h3>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-text-muted">Tipo</dt>
                  <dd className="text-text-primary">
                    {TYPES.find((item) => item.value === type)?.label ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Nome</dt>
                  <dd className="text-text-primary">{name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Modello</dt>
                  <dd className="text-text-primary">{model}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Frequenza</dt>
                  <dd className="text-text-primary">
                    {SCHEDULES.find((item) => item.value === schedule)?.label}
                    {schedule !== "manual" && schedule !== "hourly" ? ` · ${time}` : ""}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-text-muted">Piattaforme target</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {selectedPlatforms.length === 0 ? (
                      <span className="text-text-muted">Nessuna</span>
                    ) : (
                      selectedPlatforms.map((id) => (
                        <Badge key={id} variant="default">
                          {platformLabel(id)}
                        </Badge>
                      ))
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? navigate("/agents") : setStep((s) => s - 1))}
          leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        >
          Indietro
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            disabled={!canContinue}
            onClick={() => setStep((s) => s + 1)}
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Continua
          </Button>
        ) : (
          <Button
            loading={createAgent.isPending}
            disabled={!canContinue}
            onClick={finish}
            leftIcon={<Bot className="h-4 w-4" aria-hidden="true" />}
          >
            Crea Agente
          </Button>
        )}
      </div>
    </div>
  );
}
