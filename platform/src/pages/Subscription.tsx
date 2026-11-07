// =============================================================================
// Abbonamento / FAQ — Account summary + accordion FAQ per categorie.
// Real backend via /api/platform/account + /api/platform/faq.
// =============================================================================

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CreditCard, DollarSign, AlertTriangle, HelpCircle, Users, ArrowRight, Settings, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Accordion } from "@/components/common/Accordion";
import { PageHeader, EmptyState } from "@/components/common/PageElements";
import { PageTransition } from "@/components/common/Motion";
import { useAccount, useFaq, useBalance } from "@/lib/platform-queries";

const FAQ_CATEGORIES = [
  { value: "all", label: "Tutte", icon: HelpCircle },
  { value: "billing", label: "Fatturazione", icon: CreditCard },
  { value: "subscription", label: "Abbonamento", icon: DollarSign },
  { value: "usage", label: "Utilizzo", icon: AlertTriangle },
  { value: "general", label: "Generale", icon: Users },
] as const;

export default function Subscription() {
  const navigate = useNavigate();
  const [activeFaqCategory, setActiveFaqCategory] = useState("all");

  const account = useAccount();
  const balance = useBalance();
  const faq = useFaq(activeFaqCategory !== "all" ? activeFaqCategory : undefined);

  if (account.isLoading || balance.isLoading) {
    return (
      <PageTransition>
        <div className="p-4 lg:p-6">
          <PageHeader title="Abbonamento" description="Gestisci il tuo piano e i crediti" />
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="flex flex-col gap-3 p-5 animate-pulse">
                <div className="h-10 w-10 bg-secondary/10 rounded-xl" />
                <div className="h-6 w-1/2 bg-secondary/5 rounded" />
                <div className="h-4 w-3/4 bg-secondary/5 rounded" />
              </Card>
            ))}
          </div>
          <Card className="mt-6 animate-pulse">
            <div className="h-64 bg-secondary/5 rounded-lg" />
          </Card>
        </div>
      </PageTransition>
    );
  }

  const accountData = account.data;
  const balanceData = balance.data;
  const faqData = faq.data?.faqs ?? [];

  // Group FAQs by category
  const faqsByCategory = FAQ_CATEGORIES.filter((c) => c.value !== "all").map((cat) => ({
    category: cat,
    items: faqData.filter((f) => f.category === cat.value),
  }));

  return (
    <PageTransition>
      <div className="p-4 lg:p-6">
        <PageHeader
          title="Abbonamento"
          description="Piano, crediti, fatturazione e domande frequenti"
          actions={
            <Button variant="ghost">
              <Link to="/settings/billing" className="flex items-center gap-2">
                <Settings className="h-4 w-4" aria-hidden="true" />
                Impostazioni fatturazione
              </Link>
            </Button>
          }
        />

        {/* Account summary cards */}
        <section aria-label="Riepilogo account">
          <div className="grid gap-4 lg:grid-cols-3 mb-6">
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-secondary/10 text-secondary">
                  <CreditCard className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Piano</p>
                  <p className="font-display text-xl font-semibold text-text-primary">{accountData?.plan ?? "Pro"}</p>
                </div>
              </div>
              <div className="border-t border-secondary/10 pt-3">
                <p className="text-xs text-text-muted">Include tutti gli specialisti e funzionalità</p>
              </div>
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-success/10 text-success">
                  <DollarSign className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Crediti disponibili</p>
                  <p className="font-display text-xl font-semibold text-text-primary font-mono">
                    {balanceData?.available.toLocaleString() ?? accountData?.available.toLocaleString() ?? 0}
                  </p>
                </div>
              </div>
              <div className="border-t border-secondary/10 pt-3">
                <p className="text-xs text-text-muted">
                  Su {balanceData?.balance.toLocaleString() ?? accountData?.balance.toLocaleString() ?? 0} totali ·{' '}
                  {balanceData?.reserved.toLocaleString() ?? accountData?.reserved.toLocaleString() ?? 0} riservati
                </p>
              </div>
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-warning/10 text-warning">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Quota mensile</p>
                  <p className="font-display text-xl font-semibold text-text-primary font-mono">
                    {(accountData?.quota as { monthly?: number } | undefined)?.monthly?.toLocaleString() ?? "Illimitata"}
                  </p>
                </div>
              </div>
              <div className="border-t border-secondary/10 pt-3">
                <p className="text-xs text-text-muted">
                  Markup: {(accountData?.markupBps ?? 0) / 100}% · Unità credito: {(accountData?.creditUnit ?? 0).toLocaleString()}
                </p>
              </div>
            </Card>
          </div>
        </section>

        {/* Quick actions */}
        <section aria-label="Azioni rapide" className="mb-6">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-medium text-text-primary">Hai bisogno di più crediti?</h3>
                <p className="text-sm text-text-secondary">Acquista pacchetti aggiuntivi o aggiorna il piano.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary">
                  <Link to="/settings/billing" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                    Acquista crediti
                  </Link>
                </Button>
                <Button variant="ghost">
                  <Link to="/settings/billing" className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    Gestisci piano
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* FAQ Category tabs */}
        <section aria-label="Domande frequenti">
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Categorie FAQ">
            {FAQ_CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                variant={activeFaqCategory === cat.value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveFaqCategory(cat.value)}
                role="tab"
                aria-selected={activeFaqCategory === cat.value}
                className="flex items-center gap-1.5"
              >
                <cat.icon className="h-4 w-4" aria-hidden="true" />
                {cat.label}
              </Button>
            ))}
          </div>

          {activeFaqCategory === "all" ? (
            // Show all categories grouped
            <div className="space-y-6">
              {faqsByCategory
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <Card key={group.category.value} className="overflow-hidden">
                    <div className="px-4 py-3 bg-secondary/5 border-b border-secondary/10 flex items-center gap-2">
                      <group.category.icon className="h-5 w-5 text-secondary" aria-hidden="true" />
                      <h3 className="font-medium text-text-primary">{group.category.label}</h3>
                      <Badge variant="default" className="text-xs">{group.items.length}</Badge>
                    </div>
                    <Accordion
                      items={group.items.map((item) => ({
                        id: item.id,
                        question: item.question,
                        answer: item.answer,
                      }))}
                    />
                  </Card>
                ))}
              {faqsByCategory.every((g) => g.items.length === 0) && (
                <Card>
                  <EmptyState
                    icon={<HelpCircle className="h-12 w-12 text-text-muted" aria-hidden="true" />}
                    title="Nessuna FAQ disponibile"
                    description="Il catalogo delle domande frequenti è vuoto."
                  />
                </Card>
              )}
            </div>
          ) : (
            // Show single category
            <Card>
              {faqData.length === 0 ? (
                <EmptyState
                  icon={<HelpCircle className="h-12 w-12 text-text-muted" aria-hidden="true" />}
                  title="Nessuna FAQ in questa categoria"
                  description="Prova a selezionare un'altra categoria."
                />
              ) : (
                <Accordion
                  items={faqData.map((item) => ({
                    id: item.id,
                    question: item.question,
                    answer: item.answer,
                  }))}
                />
              )}
            </Card>
          )}

          {/* Quick CTA */}
          <Card className="mt-6 p-4 bg-gradient-to-r from-secondary/10 to-secondary/5 border-secondary/20">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary/20">
                  <HelpCircle className="h-6 w-6 text-secondary" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold text-text-primary">Non hai trovato la risposta?</p>
                  <p className="text-sm text-text-secondary">Contatta il supporto o apri un ticket dalla chat.</p>
                </div>
              </div>
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => navigate("/studio")}
              >
                <MessageSquare className="h-4 w-4 mr-2" aria-hidden="true" />
                Chiedi all'assistente
              </Button>
            </div>
          </Card>
        </section>
      </div>
    </PageTransition>
  );
}
