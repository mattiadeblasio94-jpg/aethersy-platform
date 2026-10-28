// =============================================================================
// Impostazioni > Notifiche (brief §4) — rotta /settings/notifications.
// Interruttori per i canali di notifica (email, push, digest settimanale, alert
// task falliti, report mensile, novita' prodotto) e preferenze per piattaforma
// con frequenza. Il salvataggio e' mock con Toast.
// =============================================================================

import { useEffect, useState } from "react";
import { Bell, Mail, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { PageTransition } from "@/components/common/Motion";
import {
  useNotificationPreferences,
  usePlatformNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/lib/queries";
import { notificationCadenceOptions } from "@/mocks";
import type { NotificationCadence, NotificationPreferences } from "@/lib/types";
import { platformLabel } from "@/lib/utils";

type PreferenceKey = keyof NotificationPreferences;

interface PreferenceSpec {
  key: PreferenceKey;
  label: string;
  description: string;
}

const GENERAL_PREFERENCES: PreferenceSpec[] = [
  {
    key: "email",
    label: "Email",
    description: "Ricevi le notifiche importanti via email.",
  },
  {
    key: "push",
    label: "Notifiche push",
    description: "Avvisi in tempo reale sul dispositivo.",
  },
  {
    key: "weeklyDigest",
    label: "Riepilogo settimanale",
    description: "Sintesi delle attivita' del workspace ogni lunedi'.",
  },
  {
    key: "failedTaskAlerts",
    label: "Avvisi task falliti",
    description: "Ricevi un avviso quando un task non va a buon fine.",
  },
  {
    key: "monthlyReport",
    label: "Report mensile",
    description: "Report dettagliato delle performance a fine mese.",
  },
  {
    key: "productNews",
    label: "Novita' prodotto",
    description: "Aggiornamenti e nuove funzionalita' di Aethersy.",
  },
];

export default function SettingsNotifications() {
  const { toast } = useToast();
  const prefs = useNotificationPreferences();
  const platformPrefs = usePlatformNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const [local, setLocal] = useState<NotificationPreferences | null>(null);
  const [cadences, setCadences] = useState<Record<string, NotificationCadence>>({});

  useEffect(() => {
    if (prefs.data) setLocal(prefs.data);
  }, [prefs.data]);

  useEffect(() => {
    if (!platformPrefs.data) return;
    setCadences(
      Object.fromEntries(platformPrefs.data.map((item) => [item.platform, item.cadence])),
    );
  }, [platformPrefs.data]);

  async function handleToggle(key: PreferenceKey, value: boolean) {
    if (!local) return;
    const next = { ...local, [key]: value };
    setLocal(next);
    try {
      await updatePrefs.mutateAsync({ [key]: value });
      toast({ kind: "success", title: "Preferenze aggiornate" });
    } catch {
      setLocal(local);
      toast({ kind: "error", title: "Aggiornamento non riuscito" });
    }
  }

  function handleCadenceChange(platform: string, cadence: NotificationCadence) {
    setCadences((current) => ({ ...current, [platform]: cadence }));
    toast({ kind: "success", title: `Preferenze ${platformLabel(platform)} aggiornate` });
  }

  return (
    <PageTransition>
      <SettingsLayout
        title="Notifiche"
        description="Scegli quali avvisi ricevere e con quale frequenza."
      >
        <Card
          header={
            <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <Bell className="h-4 w-4 text-secondary" aria-hidden="true" />
              Canali di notifica
            </h3>
          }
        >
          {prefs.isLoading || !local ? (
            <Skeleton lines={6} />
          ) : (
            <ul className="flex flex-col divide-y divide-secondary/10">
              {GENERAL_PREFERENCES.map((spec) => (
                <li key={spec.key} className="py-4 first:pt-0 last:pb-0">
                  <Switch
                    id={`notif-${spec.key}`}
                    checked={local[spec.key]}
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
              <Smartphone className="h-4 w-4 text-secondary" aria-hidden="true" />
              Preferenze per piattaforma
            </h3>
          }
        >
          {platformPrefs.isLoading ? (
            <Skeleton lines={6} />
          ) : (
            <ul className="flex flex-col divide-y divide-secondary/10">
              {(platformPrefs.data ?? []).map((item) => (
                <li
                  key={item.platform}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/15">
                      <Mail className="h-4 w-4 text-secondary" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {platformLabel(item.platform)}
                      </p>
                      <p className="text-xs text-text-muted">
                        {item.enabled ? "Notifiche attive" : "Notifiche disattivate"}
                      </p>
                    </div>
                  </div>
                  <Select
                    aria-label={`Frequenza notifiche ${platformLabel(item.platform)}`}
                    value={cadences[item.platform] ?? item.cadence}
                    onChange={(event) =>
                      handleCadenceChange(item.platform, event.target.value as NotificationCadence)
                    }
                    options={notificationCadenceOptions}
                    className="sm:w-56"
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </SettingsLayout>
    </PageTransition>
  );
}
