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
} from "lucide-react";
import { Button } from "@pv/components/ui/Button";
import { Input } from "@pv/components/ui/Input";
import { Card } from "@pv/components/ui/Card";
import { usePlatforms } from "@pv/lib/queries";
import { useAuthStore } from "@pv/store/auth";
import { useUiStore } from "@pv/store/ui";
import { cn } from "@pv/lib/utils";

const BUSINESS_TYPES = [
  "Agenzia digitale",
  "E-commerce",
  "Attivita' locale",
  "Professionista",
  "Startup",
  "Associazione no-profit",
] as const;

const GOALS = [
  "Crescere i follower",
  "Generare contatti commerciali",
  "Pubblicare con costanza",
  "Ridurre i costi di gestione",
  "Migliorare la presenza web",
  "Monitorare i risultati",
] as const;

const STEPS = [
  { id: 1, label: "La tua attivita'" },
  { id: 2, label: "I tuoi obiettivi" },
  { id: 3, label: "Collega gli account" },
];

/**
 * Onboarding (brief §4.4): tre passi — attivita', obiettivi, collegamento
 * account. Al termine si crea il workspace locale e si entra nella dashboard.
 * Stadio A: nessuna chiamata esterna, il collegamento e' simulato.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const addWorkspace = useUiStore((state) => state.addWorkspace);
  const user = useAuthStore((state) => state.user);
  const { data: platforms } = usePlatforms();

  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPES[0]);
  const [goals, setGoals] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  const canContinue = useMemo(() => {
    if (step === 0) return companyName.trim().length >= 2;
    if (step === 1) return goals.length > 0;
    return true;
  }, [step, companyName, goals]);

  function toggleGoal(goal: string) {
    setGoals((current) =>
      current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal],
    );
  }

  function togglePlatform(id: string) {
    setSelectedPlatforms((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function finish() {
    // Il workspace viene creato lato client nello Stadio A e diventa attivo.
    // Endpoint reale previsto: POST /api/workspaces
    const slug = companyName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    addWorkspace({
      id: `ws-${slug || "nuovo"}`,
      name: companyName.trim() || "Nuovo workspace",
      businessType,
      plan: "starter",
    });
    navigate("/preview/dashboard", { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 lg:py-12">
      <header className="mb-8 flex items-center gap-3">
        <img src="/brand/logo-192.png" alt="" width={36} height={36} className="h-9 w-9" />
        <span className="wordmark text-lg font-semibold text-pv-ink">AETHERSY</span>
      </header>

      <div className="mb-8">
        <p className="text-sm text-pv-ink-3">
          Ciao {user?.name?.split(" ")[0] ?? "benvenuto"}, completiamo la configurazione.
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-pv-ink">
          {STEPS[step].label}
        </h1>

        {/* Indicatore di avanzamento accessibile. */}
        <ol className="mt-4 flex items-center gap-2" aria-label="Progresso onboarding">
          {STEPS.map((item, index) => (
            <li key={item.id} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  index < step
                    ? "bg-pv-success/20 text-pv-success"
                    : index === step
                      ? "gradient-accent text-pv-accent-ink"
                      : "bg-pv-hover text-pv-ink-3",
                )}
              >
                {index < step ? <Check className="h-4 w-4" aria-hidden="true" /> : item.id}
              </span>
              <span
                className={cn(
                  "hidden text-xs sm:block",
                  index === step ? "text-pv-ink" : "text-pv-ink-3",
                )}
              >
                {item.label}
              </span>
              {index < STEPS.length - 1 && (
                <span className="h-px flex-1 bg-pv-cyan/15" aria-hidden="true" />
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
            />
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-pv-ink-2">
                Settore
              </legend>
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
                        ? "border-pv-cyan/50 bg-pv-cyan/15 text-pv-cyan"
                        : "border-pv-cyan/15 text-pv-ink-2 hover:bg-pv-hover",
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </fieldset>
          </Card>
        )}

        {step === 1 && (
          <Card className="flex flex-col gap-4">
            <p className="text-sm text-pv-ink-2">
              Seleziona uno o piu' obiettivi: gli agenti li useranno per prioritizzare il lavoro.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {GOALS.map((goal) => {
                const active = goals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleGoal(goal)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      active
                        ? "border-pv-cyan/50 bg-pv-cyan/15 text-pv-ink"
                        : "border-pv-cyan/15 text-pv-ink-2 hover:bg-pv-hover",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border",
                        active ? "border-pv-cyan bg-pv-cyan/20" : "border-pv-cyan/25",
                      )}
                    >
                      {active && <Check className="h-3.5 w-3.5 text-pv-cyan" aria-hidden="true" />}
                    </span>
                    {goal}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm text-pv-ink-2">
              <Share2 className="h-4 w-4 text-pv-cyan" aria-hidden="true" />
              Collega gli account social. Puoi farlo anche piu' tardi.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(platforms ?? []).map((platform) => {
                const active =
                  selectedPlatforms.includes(platform.id) || platform.status === "connected";
                return (
                  <button
                    key={platform.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePlatform(platform.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      active
                        ? "border-pv-cyan/50 bg-pv-cyan/15 text-pv-ink"
                        : "border-pv-cyan/15 text-pv-ink-2 hover:bg-pv-hover",
                    )}
                  >
                    <img src={platform.icon} alt="" width={20} height={20} className="h-5 w-5" />
                    <span className="flex-1">{platform.name}</span>
                    {active && <BadgeCheck className="h-4 w-4 text-pv-success" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </motion.div>

      <footer className="mt-8 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? navigate("/preview/dashboard") : setStep((s) => s - 1))}
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
            onClick={finish}
            leftIcon={<Rocket className="h-4 w-4" aria-hidden="true" />}
          >
            Entra nella Dashboard
          </Button>
        )}
      </footer>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-pv-ink-3">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Puoi modificare queste scelte in qualsiasi momento dalle Impostazioni.
      </p>
    </div>
  );
}
