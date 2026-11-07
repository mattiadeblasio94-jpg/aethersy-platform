// =============================================================================
// Aiuto — solo dati reali dal BFF.
//
// Le FAQ arrivano dal catalogo del server (GET /api/platform/faq, categorie
// billing/subscription/usage/general). Lo stato mostrato e' quello reale:
// piano e crediti da GET /api/platform/account, attivita' e coda da GET
// /api/platform/overview. L'unico canale di supporto implementato e' la chat
// della piattaforma (POST /api/platform/chat): email, community, ticketing e
// documentazione esterna non sono esposti dal BFF e quindi non vengono
// promessi.
// =============================================================================

import { useMemo, useState } from "react";
import {
  BookOpen,
  CreditCard,
  Gauge,
  Info,
  ListChecks,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Accordion } from "@/components/common/Accordion";
import { EmptyState, PageHeader } from "@/components/common/PageElements";
import { useAccount, useFaq, useOverview, useSendMessage } from "@/lib/platform-queries";
import { cn, formatNumber } from "@/lib/utils";

type FaqCategory = "billing" | "subscription" | "usage" | "general";

const CATEGORY_LABEL: Record<FaqCategory, string> = {
  billing: "Billing e fatturazione",
  subscription: "Abbonamento",
  usage: "Consumo crediti",
  general: "Generale",
};

const CATEGORY_ICON: Record<FaqCategory, LucideIcon> = {
  billing: CreditCard,
  subscription: Wallet,
  usage: Gauge,
  general: Info,
};

/** Testo esplicito della richiesta di supporto inviata all'orchestratore. */
const SUPPORT_PROMPT =
  "Ho bisogno di assistenza: descrivo il problema qui e voglio capire come risolverlo.";

export default function Help() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FaqCategory | "all">("all");
  const [question, setQuestion] = useState("");

  const faqs = useFaq();
  const account = useAccount();
  const overview = useOverview();
  const sendMessage = useSendMessage();

  const faqRows = faqs.data?.faqs ?? [];
  const normalizedQuery = query.trim().toLowerCase();

  const categories = useMemo(() => {
    const found = new Set<FaqCategory>();
    for (const faq of faqRows) {
      found.add(faq.category);
    }
    return [...found].map((id) => ({
      id,
      label: CATEGORY_LABEL[id] ?? id,
      icon: CATEGORY_ICON[id] ?? BookOpen,
      count: faqRows.filter((faq) => faq.category === id).length,
    }));
  }, [faqRows]);

  const filteredFaqs = useMemo(
    () =>
      faqRows.filter((faq) => {
        const matchesCategory = activeCategory === "all" || faq.category === activeCategory;
        const matchesQuery =
          normalizedQuery === "" ||
          faq.question.toLowerCase().includes(normalizedQuery) ||
          faq.answer.toLowerCase().includes(normalizedQuery);
        return matchesCategory && matchesQuery;
      }),
    [faqRows, activeCategory, normalizedQuery],
  );

  const counters = overview.data?.counters;

  async function handleSendQuestion() {
    const text = question.trim();
    if (!text) return;
    try {
      const turn = await sendMessage.mutateAsync({ text });
      setQuestion("");
      toast({
        kind: "success",
        title: "Richiesta inviata",
        description:
          turn.action === "run_started"
            ? "La richiesta e' stata avviata come esecuzione."
            : turn.reply?.content,
      });
    } catch (error) {
      toast({
        kind: "error",
        title: "Invio non riuscito",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleStartHelp() {
    try {
      const turn = await sendMessage.mutateAsync({ text: SUPPORT_PROMPT });
      toast({
        kind: "success",
        title: "Richiesta inviata",
        description:
          turn.action === "run_started"
            ? "La richiesta e' stata avviata come esecuzione."
            : turn.reply?.content,
      });
    } catch (error) {
      toast({
        kind: "error",
        title: "Invio non riuscito",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Aiuto"
        description="Domande frequenti reali, stato del tuo abbonamento e accesso diretto al consulente."
      />

      <Card>
        <Input
          type="search"
          label="Cerca nelle domande frequenti"
          placeholder="Cerca una domanda, una funzione, un errore…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
        />
      </Card>

      <section aria-label="Categorie di aiuto" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {faqs.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <button
              type="button"
              aria-pressed={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
              className={cn(
                "flex h-full flex-col gap-2 rounded-xl border p-5 text-left transition-colors",
                activeCategory === "all"
                  ? "border-secondary/50 bg-bg-card shadow-glow"
                  : "border-secondary/10 bg-bg-card hover:border-secondary/40",
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/15">
                <ListChecks className="h-5 w-5 text-secondary" aria-hidden="true" />
              </span>
              <span className="text-base font-semibold text-text-primary">Tutte</span>
              <span className="text-xs text-text-muted">{faqRows.length} domande</span>
            </button>

            {categories.map((category) => {
              const Icon = category.icon;
              const selected = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveCategory(selected ? "all" : category.id)}
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-xl border p-5 text-left transition-colors",
                    selected
                      ? "border-secondary/50 bg-bg-card shadow-glow"
                      : "border-secondary/10 bg-bg-card hover:border-secondary/40",
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/15">
                    <Icon className="h-5 w-5 text-secondary" aria-hidden="true" />
                  </span>
                  <span className="text-base font-semibold text-text-primary">{category.label}</span>
                  <span className="text-xs text-text-muted">{category.count} domande</span>
                </button>
              );
            })}
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Domande frequenti</h2>
              <span className="text-xs text-text-muted">{filteredFaqs.length} risultati</span>
            </>
          }
        >
          {faqs.isLoading ? (
            <Skeleton lines={6} />
          ) : filteredFaqs.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" aria-hidden="true" />}
              title="Nessun risultato"
              description="Prova con altre parole chiave oppure cambia categoria."
            />
          ) : (
            <Accordion
              items={filteredFaqs.map((faq) => ({
                id: faq.id,
                question: faq.question,
                answer: faq.answer,
              }))}
            />
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Il tuo abbonamento</h2>
                {account.data?.plan && (
                  <Badge variant="info">{account.data.plan}</Badge>
                )}
              </>
            }
          >
            {account.isLoading ? (
              <Skeleton lines={4} />
            ) : (
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Workspace</dt>
                  <dd className="font-medium text-text-primary">
                    {account.data?.tenantName ?? "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Crediti disponibili</dt>
                  <dd className="font-medium text-text-primary">
                    {formatNumber(account.data?.available ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Crediti riservati</dt>
                  <dd className="font-medium text-text-primary">
                    {formatNumber(account.data?.reserved ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Hard-stop a crediti esauriti</dt>
                  <dd>
                    <Badge variant={account.data?.hardStopOnEmpty ? "warning" : "success"}>
                      {account.data?.hardStopOnEmpty ? "attivo" : "disattivato"}
                    </Badge>
                  </dd>
                </div>
              </dl>
            )}
          </Card>

          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Stato dell'attivita'</h2>
                <span className="text-xs text-text-muted">dati reali del workspace</span>
              </>
            }
          >
            {overview.isLoading ? (
              <Skeleton lines={4} />
            ) : (
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Task in corso</dt>
                  <dd className="font-medium text-text-primary">
                    {formatNumber(counters?.tasks.running ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Esecuzioni aperte</dt>
                  <dd className="font-medium text-text-primary">
                    {formatNumber(counters?.runs.open ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Coda attiva</dt>
                  <dd className="font-medium text-text-primary">
                    {formatNumber(counters?.schedule.active ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">In attesa di una tua decisione</dt>
                  <dd className="font-medium text-text-primary">
                    {formatNumber(counters?.assets.inReview ?? 0)}
                  </dd>
                </div>
              </dl>
            )}
          </Card>
        </div>
      </div>

      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Parla con il consulente</h2>
            <span className="text-xs text-text-muted">chat reale della piattaforma</span>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label
            htmlFor="help-question"
            className="text-sm font-medium text-text-secondary"
          >
            La tua domanda
          </label>
          <textarea
            id="help-question"
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Descrivi il problema o la domanda…"
            className="w-full rounded-lg border border-secondary/20 bg-primary/60 px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
              loading={sendMessage.isPending}
              disabled={question.trim().length === 0}
              onClick={handleSendQuestion}
            >
              Invia la domanda
            </Button>
            <Button
              variant="secondary"
              leftIcon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
              loading={sendMessage.isPending}
              onClick={() => void handleStartHelp()}
            >
              Chiedi come iniziare
            </Button>
          </div>
        </div>
      </Card>

      <Card header={<h2 className="text-base font-semibold text-text-primary">Non disponibili</h2>}>
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            Email di supporto, community, ticketing, uptime dei servizi e documentazione esterna non
            sono esposti dal BFF: non esistono dati reali su questi canali, quindi non vengono
            mostrati ne' promessi.
          </p>
          <div className="flex flex-wrap gap-2">
            {["Email di supporto", "Community", "Ticketing", "Uptime servizi", "Documentazione"].map(
              (label) => (
                <Badge key={label} variant="warning">
                  {label}: non disponibile
                </Badge>
              ),
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
