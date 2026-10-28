// =============================================================================
// Aiuto (brief §4) — rotta /help. Ricerca, griglia di categorie, FAQ
// espandibili (>= 10), canali di contatto, link alla documentazione e stato dei
// servizi con StatusIndicator. Interamente su dati mock tipizzati.
// =============================================================================

import { useMemo, useState } from "react";
import {
  BookOpen,
  CreditCard,
  LifeBuoy,
  ListChecks,
  Mail,
  MessageCircle,
  Rocket,
  Search,
  Share2,
  Sparkles,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@pv/components/ui/Badge";
import { Card } from "@pv/components/ui/Card";
import { Input } from "@pv/components/ui/Input";
import { Skeleton } from "@pv/components/ui/Skeleton";
import { Accordion } from "@pv/components/common/Accordion";
import { EmptyState, PageHeader } from "@pv/components/common/PageElements";
import { PageTransition, StaggerGroup, StaggerItem } from "@pv/components/common/Motion";
import { StatusIndicator } from "@pv/components/domain/StatusIndicator";
import {
  useFaqItems,
  useHelpCategories,
  useHelpDocs,
  useServiceStatuses,
  useStatusUpdatedAt,
} from "@pv/lib/queries";
import type { HelpCategoryId, ServiceStatusKind } from "@pv/lib/types";
import { cn, formatRelative } from "@pv/lib/utils";

/** Mappa nome-icona -> componente lucide, per le categorie della knowledge base. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Rocket,
  Share2,
  Sparkles,
  ListChecks,
  CreditCard,
  Webhook,
  BookOpen,
};

/** Mappa gli stati servizio sui valori riconosciuti da StatusIndicator. */
const SERVICE_STATUS_KIND: Record<ServiceStatusKind, string> = {
  operational: "connected",
  degraded: "pending",
  outage: "error",
  maintenance: "paused",
};

const SERVICE_STATUS_LABEL: Record<ServiceStatusKind, string> = {
  operational: "Operativo",
  degraded: "Prestazioni ridotte",
  outage: "Interruzione",
  maintenance: "Manutenzione",
};

const CONTACT_CHANNELS = [
  {
    id: "chat",
    title: "Chat in-app",
    description: "Risposta media in pochi minuti, lun-ven 9:00-18:00.",
    action: "Apri la chat",
    icon: MessageCircle,
  },
  {
    id: "email",
    title: "Email",
    description: "support@aethersy.online — risposta entro 24 ore.",
    action: "Scrivi una email",
    icon: Mail,
  },
  {
    id: "community",
    title: "Community",
    description: "Confrontati con altri utenti e con il team Aethersy.",
    action: "Entra nella community",
    icon: LifeBuoy,
  },
];

export default function Help() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<HelpCategoryId | "all">("all");

  const categories = useHelpCategories();
  const faqs = useFaqItems();
  const docs = useHelpDocs();
  const statuses = useServiceStatuses();
  const updatedAt = useStatusUpdatedAt();

  const normalizedQuery = query.trim().toLowerCase();

  const filteredFaqs = useMemo(() => {
    const list = faqs.data ?? [];
    return list.filter((faq) => {
      const matchesCategory = activeCategory === "all" || faq.category === activeCategory;
      const matchesQuery =
        normalizedQuery === "" ||
        faq.question.toLowerCase().includes(normalizedQuery) ||
        faq.answer.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [faqs.data, activeCategory, normalizedQuery]);

  return (
    <PageTransition>
      <PageHeader
        title="Aiuto"
        description="Guide, domande frequenti e supporto per usare al meglio Aethersy."
      />

      {/* Ricerca */}
      <Card>
        <Input
          type="search"
          label="Cerca nella guida"
          placeholder="Cerca una domanda, una funzione, un errore…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
        />
      </Card>

      {/* Categorie */}
      <section aria-label="Categorie di aiuto">
        {categories.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(categories.data ?? []).map((category) => {
              const Icon = CATEGORY_ICONS[category.icon] ?? BookOpen;
              const selected = activeCategory === category.id;
              return (
                <StaggerItem key={category.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setActiveCategory((current) => (current === category.id ? "all" : category.id))
                    }
                    className={cn(
                      "flex h-full w-full flex-col gap-3 rounded-xl border p-5 text-left transition-all duration-200",
                      selected
                        ? "border-pv-cyan/50 bg-pv-card shadow-pv-glow"
                        : "border-pv-cyan/10 bg-pv-card hover:border-pv-cyan/40",
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pv-cyan/15">
                      <Icon className="h-5 w-5 text-pv-cyan" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-base font-semibold text-pv-ink">
                        {category.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-pv-ink-2">
                        {category.description}
                      </span>
                    </span>
                    <span className="mt-auto text-xs text-pv-ink-3">
                      {category.articleCount} articoli
                    </span>
                  </button>
                </StaggerItem>
              );
            })}
          </StaggerGroup>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        {/* FAQ */}
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-pv-ink">Domande frequenti</h2>
              <span className="text-xs text-pv-ink-3">{filteredFaqs.length} risultati</span>
            </>
          }
        >
          {faqs.isLoading ? (
            <Skeleton lines={6} />
          ) : filteredFaqs.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" aria-hidden="true" />}
              title="Nessun risultato"
              description="Prova con altre parole chiave o cambia categoria."
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
          {/* Stato servizi */}
          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-pv-ink">Stato dei servizi</h2>
                {updatedAt.data && (
                  <span className="text-xs text-pv-ink-3">
                    Aggiornato {formatRelative(updatedAt.data)}
                  </span>
                )}
              </>
            }
          >
            {statuses.isLoading ? (
              <Skeleton lines={5} />
            ) : (
              <ul className="flex flex-col gap-3">
                {(statuses.data ?? []).map((service) => (
                  <li key={service.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-pv-ink">{service.name}</p>
                      <p className="text-xs text-pv-ink-3">
                        Uptime 30gg: {service.uptime.toFixed(2).replace(".", ",")}%
                      </p>
                    </div>
                    <span className="flex items-center gap-2">
                      <StatusIndicator
                        status={SERVICE_STATUS_KIND[service.status]}
                        withLabel={false}
                      />
                      <span className="text-xs text-pv-ink-2">
                        {SERVICE_STATUS_LABEL[service.status]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Documentazione */}
          <Card header={<h2 className="text-base font-semibold text-pv-ink">Documentazione</h2>}>
            {docs.isLoading ? (
              <Skeleton lines={3} />
            ) : (
              <ul className="flex flex-col gap-3">
                {(docs.data ?? []).map((doc) => (
                  <li key={doc.id}>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-3 rounded-lg p-1 transition-colors hover:text-pv-cyan"
                    >
                      <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-pv-cyan" aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-medium text-pv-ink">{doc.title}</span>
                        <span className="block text-xs text-pv-ink-3">{doc.description}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Contatti */}
      <section aria-label="Canali di supporto">
        <h2 className="mb-3 font-display text-lg font-semibold text-pv-ink">
          Hai ancora bisogno di aiuto?
        </h2>
        <StaggerGroup className="grid gap-4 sm:grid-cols-3">
          {CONTACT_CHANNELS.map((channel) => {
            const Icon = channel.icon;
            return (
              <StaggerItem key={channel.id}>
                <Card interactive className="flex h-full flex-col gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pv-cyan/15">
                    <Icon className="h-5 w-5 text-pv-cyan" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-pv-ink">{channel.title}</p>
                    <p className="mt-0.5 text-sm text-pv-ink-2">{channel.description}</p>
                  </div>
                  <button
                    type="button"
                    className="mt-auto self-start text-sm font-medium text-pv-cyan underline-offset-2 hover:underline"
                  >
                    {channel.action}
                  </button>
                </Card>
              </StaggerItem>
            );
          })}
        </StaggerGroup>
      </section>

      <Badge variant="info" className="self-start">
        Supporto incluso nel piano Pro
      </Badge>
    </PageTransition>
  );
}
