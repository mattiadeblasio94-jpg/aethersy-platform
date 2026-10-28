// =============================================================================
// Impostazioni > Fatturazione (brief §4) — rotta /settings/billing. Piano
// corrente, consumo crediti, metodi di pagamento (aggiungi/rimuovi mock) e
// storico fatture. Nessun dato di carta reale: solo ultime 4 cifre.
// =============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { Check, CreditCard, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@pv/components/ui/Badge";
import { Button } from "@pv/components/ui/Button";
import { Card } from "@pv/components/ui/Card";
import { Input } from "@pv/components/ui/Input";
import { Modal } from "@pv/components/ui/Modal";
import { Select } from "@pv/components/ui/Select";
import { Skeleton } from "@pv/components/ui/Skeleton";
import { useToast } from "@pv/components/ui/Toast";
import { SettingsLayout } from "@pv/components/settings/SettingsLayout";
import { EmptyState, ProgressBar } from "@pv/components/common/PageElements";
import { PageTransition } from "@pv/components/common/Motion";
import {
  useAddPaymentMethod,
  useCreditUsage,
  useInvoices,
  usePaymentMethods,
  useRemovePaymentMethod,
} from "@pv/lib/queries";
import type { InvoiceStatus } from "@pv/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@pv/lib/utils";

const INVOICE_STATUS: Record<InvoiceStatus, { label: string; variant: "success" | "warning" | "error" }> = {
  paid: { label: "Pagata", variant: "success" },
  pending: { label: "In attesa", variant: "warning" },
  failed: { label: "Non riuscita", variant: "error" },
};

const PLAN_FEATURES = [
  "10 agenti AI attivi",
  "6 piattaforme social collegate",
  "2.000 crediti al mese",
  "Report e analisi illimitati",
  "Supporto prioritario",
];

const CARD_BRANDS = [
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Amex", label: "American Express" },
];

export default function SettingsBilling() {
  const { toast } = useToast();
  const creditUsage = useCreditUsage();
  const invoices = useInvoices();
  const paymentMethods = usePaymentMethods();
  const addPaymentMethod = useAddPaymentMethod();
  const removePaymentMethod = useRemovePaymentMethod();

  const [addOpen, setAddOpen] = useState(false);
  const [brand, setBrand] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const used = creditUsage.data?.used ?? 0;
  const total = creditUsage.data?.total ?? 0;

  async function handleAddPaymentMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}$/.test(last4)) {
      setFormError("Inserisci le ultime 4 cifre della carta.");
      return;
    }
    setFormError(null);
    try {
      await addPaymentMethod.mutateAsync({ brand, last4 });
      toast({ kind: "success", title: "Metodo aggiunto", description: `${brand} •••• ${last4}` });
      setAddOpen(false);
      setLast4("");
    } catch {
      toast({ kind: "error", title: "Aggiunta non riuscita" });
    }
  }

  async function handleRemove(id: string, label: string) {
    try {
      await removePaymentMethod.mutateAsync(id);
      toast({ kind: "info", title: "Metodo rimosso", description: label });
    } catch {
      toast({ kind: "error", title: "Rimozione non riuscita" });
    }
  }

  return (
    <PageTransition>
      <SettingsLayout
        title="Fatturazione"
        description="Piano, crediti, metodi di pagamento e storico fatture."
        actions={
          <Button
            variant="secondary"
            leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
            onClick={() => toast({ kind: "info", title: "Upgrade piano", description: "Flusso in arrivo (mock)." })}
          >
            Cambia piano
          </Button>
        }
      >
        {/* Piano + crediti */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            variant="elevated"
            header={
              <>
                <h3 className="text-base font-semibold text-pv-ink">Piano Pro</h3>
                <Badge variant="info">Attivo</Badge>
              </>
            }
          >
            <div className="flex items-baseline gap-1">
              <span className="font-display text-3xl font-semibold text-pv-ink">€79</span>
              <span className="text-sm text-pv-ink-3">/ mese</span>
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {PLAN_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-pv-ink-2">
                  <Check className="h-4 w-4 shrink-0 text-pv-success" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          </Card>

          <Card header={<h3 className="text-base font-semibold text-pv-ink">Consumo crediti</h3>}>
            {creditUsage.isLoading ? (
              <Skeleton lines={3} />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-end justify-between">
                  <p className="font-display text-2xl font-semibold text-pv-ink">
                    {formatNumber(used)}{" "}
                    <span className="text-base font-normal text-pv-ink-3">
                      / {formatNumber(total)}
                    </span>
                  </p>
                  <span className="text-sm text-pv-ink-3">
                    {total > 0 ? Math.round((used / total) * 100) : 0}%
                  </span>
                </div>
                <ProgressBar value={used} max={total} label="Crediti utilizzati questo mese" />
                <p className="text-xs text-pv-ink-3">
                  I crediti non utilizzati si azzerano all'inizio del prossimo ciclo di fatturazione.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => toast({ kind: "info", title: "Acquisto crediti", description: "Flusso in arrivo (mock)." })}
                >
                  Acquista crediti
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Metodi di pagamento */}
        <Card
          header={
            <>
              <h3 className="text-base font-semibold text-pv-ink">Metodi di pagamento</h3>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setAddOpen(true)}
              >
                Aggiungi
              </Button>
            </>
          }
          bodyClassName="p-0"
        >
          {paymentMethods.isLoading ? (
            <div className="p-5">
              <Skeleton lines={3} />
            </div>
          ) : (paymentMethods.data ?? []).length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
                title="Nessun metodo di pagamento"
                description="Aggiungi una carta per rinnovare l'abbonamento."
              />
            </div>
          ) : (
            <ul className="divide-y divide-pv-cyan/10">
              {(paymentMethods.data ?? []).map((method) => (
                <li key={method.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-pv-cyan/15">
                    <CreditCard className="h-5 w-5 text-pv-cyan" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-pv-ink">
                      {method.brand} •••• {method.last4}
                    </p>
                    <p className="text-xs text-pv-ink-3">Scade {method.expiry}</p>
                  </div>
                  {method.isDefault && <Badge variant="info">Predefinito</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rimuovi ${method.brand} che termina con ${method.last4}`}
                    loading={removePaymentMethod.isPending && removePaymentMethod.variables === method.id}
                    onClick={() => handleRemove(method.id, `${method.brand} •••• ${method.last4}`)}
                  >
                    <Trash2 className="h-4 w-4 text-pv-error" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Storico fatture */}
        <Card
          header={
            <>
              <h3 className="text-base font-semibold text-pv-ink">Storico fatture</h3>
              <span className="text-xs text-pv-ink-3">{invoices.data?.length ?? 0} fatture</span>
            </>
          }
          bodyClassName="p-0"
        >
          {invoices.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="sr-only">Storico fatture del workspace</caption>
                <thead>
                  <tr className="border-b border-pv-cyan/10 text-left text-xs text-pv-ink-3">
                    <th scope="col" className="py-2 pl-5 pr-4 font-medium">Numero</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Data</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Importo</th>
                    <th scope="col" className="py-2 pr-5 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoices.data ?? []).map((invoice) => {
                    const status = INVOICE_STATUS[invoice.status];
                    return (
                      <tr key={invoice.id} className="border-b border-pv-cyan/5">
                        <td className="py-3 pl-5 pr-4 font-mono text-xs text-pv-ink-2">
                          {invoice.number}
                        </td>
                        <td className="py-3 pr-4 text-pv-ink-2">{formatDate(invoice.date)}</td>
                        <td className="py-3 pr-4 font-medium text-pv-ink">
                          {formatCurrency(invoice.amount, invoice.currency)}
                        </td>
                        <td className="py-3 pr-5">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </SettingsLayout>

      {/* Modale aggiunta metodo */}
      <Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Aggiungi metodo di pagamento"
        description="Solo per demo: inserisci le ultime 4 cifre, nessun dato reale viene salvato."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" form="add-payment-form" loading={addPaymentMethod.isPending}>
              Aggiungi carta
            </Button>
          </>
        }
      >
        <form id="add-payment-form" onSubmit={handleAddPaymentMethod} className="flex flex-col gap-4" noValidate>
          <Select
            label="Circuito"
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            options={CARD_BRANDS}
          />
          <Input
            label="Ultime 4 cifre"
            inputMode="numeric"
            maxLength={4}
            placeholder="4242"
            value={last4}
            error={formError ?? undefined}
            onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </form>
      </Modal>
    </PageTransition>
  );
}
