import { useEffect, useState } from "react";
import { Bell, Mail, Moon, ShieldAlert, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { EmptyState } from "@/components/common/PageElements";
import { PageTransition } from "@/components/common/Motion";
import { usePreferences, useUpdatePreferences } from "@/lib/platform-queries";
import type { IdentityPreferences } from "@/lib/platform-api";

const DIGEST_OPTIONS = [
  { value: "off", label: "Nessun riepilogo" },
  { value: "daily", label: "Ogni giorno" },
  { value: "weekly", label: "Ogni settimana" },
];

const CHANNEL_PREFERENCES: {
  key: keyof IdentityPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: "channelEmail",
    label: "Email",
    description: "Ricevi le notifiche importanti via email.",
  },
  {
    key: "channelPush",
    label: "Notifiche push",
    description: "Avvisi in tempo reale sul dispositivo.",
  },
  {
    key: "quietHours",
    label: "Ore silenziose",
    description: "Sospende gli avvisi non urgenti nel fuso orario del profilo.",
  },
];

const ALERT_PREFERENCES: {
  key: keyof IdentityPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: "runUpdates",
    label: "Avanzamento delle run",
    description: "Ricevi un aggiornamento quando una run cambia stato.",
  },
  {
    key: "leadAlerts",
    label: "Avvisi nuovi lead",
    description: "Notifica quando il pipeline registra un nuovo lead.",
  },
  {
    key: "budgetAlerts",
    label: "Avvisi di budget",
    description: "Notifica quando il consumo crediti si avvicina alla quota.",
  },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Aggiornamento non riuscito";
}

export default function SettingsNotifications() {
  const { toast } = useToast();
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();

  const [local, setLocal] = useState<IdentityPreferences | null>(null);

  useEffect(() => {
    if (prefs.data) setLocal(prefs.data);
  }, [prefs.data]);

  async function handleToggle(key: keyof IdentityPreferences, value: boolean) {
    if (!local) return;
    const previous = local;
    setLocal({ ...local, [key]: value });
    try {
      await updatePrefs.mutateAsync({ [key]: value } as Partial<IdentityPreferences>);
      toast({ kind: "success", title: "Preferenze aggiornate" });
    } catch (error) {
      setLocal(previous);
      toast({ kind: "error", title: "Aggiornamento non riuscita", description: errorText(error) });
    }
  }

  async function handleDigest(value: string) {
    if (!local) return;
    const previous = local;
    const next = value as IdentityPreferences["emailDigest"];
    setLocal({ ...local, emailDigest: next });
    try {
      await updatePrefs.mutateAsync({ emailDigest: next });
      toast({ kind: "success", title: "Riepilogo email aggiornato" });
    } catch (error) {
      setLocal(previous);
      toast({ kind: "error", title: "Aggiornamento non riuscita", description: errorText(error) });
    }
  }

  return (
    <PageTransition>
      <SettingsLayout
        title="Notifiche"
        description="Canali, riepilogo email e avvisi operativi: tutto viene salvato sul profilo del tenant."
      >
        <Card
          header={
            <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <Bell className="h-4 w-4 text-secondary" aria-hidden="true" />
              Canali di notifica
            </h3>
          }
        >
          {prefs.isError ? (
            <EmptyState
              title="Preferenze non disponibili"
              description={errorText(prefs.error)}
              action={
                <Button variant="secondary" size="sm" onClick={() => prefs.refetch()}>
                  Ricarica preferenze
                </Button>
              }
            />
          ) : prefs.isLoading || !local ? (
            <Skeleton lines={6} />
          ) : (
            <ul className="flex flex-col divide-y divide-secondary/10">
              {CHANNEL_PREFERENCES.map((spec) => (
                <li key={spec.key} className="py-4 first:pt-0 last:pb-0">
                  <Switch
                    id={`notif-${spec.key}`}
                    checked={Boolean(local[spec.key])}
                    disabled={updatePrefs.isPending}
                    onCheckedChange={(value) => handleToggle(spec.key, value)}
                    label={spec.label}
                    description={spec.description}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          header={
            <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <Mail className="h-4 w-4 text-secondary" aria-hidden="true" />
              Riepilogo email
            </h3>
          }
        >
          {prefs.isLoading || !local ? (
            <Skeleton lines={3} />
          ) : (
            <div className="flex flex-col gap-2">
              <Select
                label="Frequenza"
                options={DIGEST_OPTIONS}
                value={local.emailDigest}
                disabled={updatePrefs.isPending}
                onChange={(event) => handleDigest(event.target.value)}
                hint="Il riepilogo raccoglie run, task e lead del periodo selezionato."
              />
              <p className="flex items-center gap-1.5 text-xs text-text-muted">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Ultimo salvataggio: {local.updatedAt ?? "nessuna modifica registrata"}
              </p>
            </div>
          )}
        </Card>

        <Card
          header={
            <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <ShieldAlert className="h-4 w-4 text-secondary" aria-hidden="true" />
              Avvisi operativi
            </h3>
          }
        >
          {prefs.isLoading || !local ? (
            <Skeleton lines={6} />
          ) : (
            <ul className="flex flex-col divide-y divide-secondary/10">
              {ALERT_PREFERENCES.map((spec) => (
                <li key={spec.key} className="py-4 first:pt-0 last:pb-0">
                  <Switch
                    id={`notif-${spec.key}`}
                    checked={Boolean(local[spec.key])}
                    disabled={updatePrefs.isPending}
                    onCheckedChange={(value) => handleToggle(spec.key, value)}
                    label={spec.label}
                    description={spec.description}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          header={
            <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <Moon className="h-4 w-4 text-secondary" aria-hidden="true" />
              Note
            </h3>
          }
        >
          <p className="text-sm text-text-secondary">
            Le preferenze valgono per l'utente autenticato. La piattaforma non espone canali push
            nativi: la preferenza resta salvata ma la consegna dipende dal canale disponibile sul
            tenant.
          </p>
        </Card>
      </SettingsLayout>
    </PageTransition>
  );
}
