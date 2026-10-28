// =============================================================================
// Impostazioni > Profilo (brief §4) — rotta /settings/profile. Dati personali,
// preferenze di visualizzazione (lingua, fuso orario, tema) con salvataggio
// mock e Toast di conferma.
// =============================================================================

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Building2, Check, Globe, Mail, Phone, Save, User as UserIcon } from "lucide-react";
import { Button } from "@pv/components/ui/Button";
import { Card } from "@pv/components/ui/Card";
import { Input } from "@pv/components/ui/Input";
import { Select } from "@pv/components/ui/Select";
import { Skeleton } from "@pv/components/ui/Skeleton";
import { useToast } from "@pv/components/ui/Toast";
import { SettingsLayout } from "@pv/components/settings/SettingsLayout";
import { PageTransition } from "@pv/components/common/Motion";
import { useUpdateUserProfile, useUserProfile } from "@pv/lib/queries";
import { languageOptions, timezoneOptions } from "@pv/mocks";

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  company: string;
  bio: string;
  language: string;
  timezone: string;
}

const EMPTY_FORM: ProfileForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  bio: "",
  language: "it",
  timezone: "Europe/Rome",
};

export default function SettingsProfile() {
  const { toast } = useToast();
  const profile = useUserProfile();
  const updateProfile = useUpdateUserProfile();

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  // Popola il form quando il profilo arriva dal mock layer.
  useEffect(() => {
    if (!profile.data) return;
    const { name, email, phone, company, bio, language, timezone } = profile.data;
    setForm({ name, email, phone, company, bio, language, timezone });
  }, [profile.data]);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Il nome e' obbligatorio.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Inserisci un indirizzo email valido.");
      return;
    }
    setError(null);
    try {
      await updateProfile.mutateAsync(form);
      toast({
        kind: "success",
        title: "Profilo aggiornato",
        description: "Le modifiche sono state salvate.",
      });
    } catch {
      toast({ kind: "error", title: "Salvataggio non riuscito" });
    }
  }

  return (
    <PageTransition>
      <SettingsLayout
        title="Profilo"
        description="Dati personali e preferenze di visualizzazione del tuo account."
        actions={
          <Button
            type="submit"
            form="profile-form"
            leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
            loading={updateProfile.isPending}
          >
            Salva modifiche
          </Button>
        }
      >
        {profile.isLoading ? (
          <Card>
            <Skeleton lines={6} />
          </Card>
        ) : (
          <form id="profile-form" onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
            <Card header={<h3 className="text-base font-semibold text-pv-ink">Dati personali</h3>}>
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-4">
                  <img
                    src={profile.data?.avatar ?? "/brand/logo-192.png"}
                    alt=""
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full border border-pv-cyan/20"
                  />
                  <div>
                    <p className="text-sm font-medium text-pv-ink">Avatar</p>
                    <p className="text-xs text-pv-ink-3">
                      L'immagine del workspace (modifica in arrivo).
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Nome completo"
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    leftIcon={<UserIcon className="h-4 w-4" aria-hidden="true" />}
                    autoComplete="name"
                    required
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
                    autoComplete="email"
                    error={error ?? undefined}
                    required
                  />
                  <Input
                    label="Telefono"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    leftIcon={<Phone className="h-4 w-4" aria-hidden="true" />}
                    autoComplete="tel"
                  />
                  <Input
                    label="Azienda"
                    value={form.company}
                    onChange={(event) => update("company", event.target.value)}
                    leftIcon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                    autoComplete="organization"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-bio" className="text-sm font-medium text-pv-ink-2">
                    Bio
                  </label>
                  <textarea
                    id="profile-bio"
                    value={form.bio}
                    onChange={(event) => update("bio", event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-pv-cyan/20 bg-pv-indigo/60 px-3.5 py-2.5 text-base text-pv-ink placeholder:text-pv-ink-3 transition-colors focus:border-pv-cyan focus:outline-none focus:ring-1 focus:ring-pv-cyan"
                    placeholder="Racconta in breve chi sei…"
                  />
                </div>
              </div>
            </Card>

            <Card header={<h3 className="text-base font-semibold text-pv-ink">Preferenze</h3>}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Lingua"
                  value={form.language}
                  onChange={(event) => update("language", event.target.value)}
                  options={languageOptions}
                  leftIcon={<Globe className="h-4 w-4" aria-hidden="true" />}
                />
                <Select
                  label="Fuso orario"
                  value={form.timezone}
                  onChange={(event) => update("timezone", event.target.value)}
                  options={timezoneOptions}
                  leftIcon={<Globe className="h-4 w-4" aria-hidden="true" />}
                />
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <p className="text-sm font-medium text-pv-ink-2">Tema dell'interfaccia</p>
                <p className="flex items-center gap-1.5 text-xs text-pv-ink-3">
                  <Check className="h-3.5 w-3.5 text-pv-success" aria-hidden="true" />
                  La Console usa un solo tema scuro: l'anteprima segue la stessa palette.
                </p>
              </div>
            </Card>
          </form>
        )}
      </SettingsLayout>
    </PageTransition>
  );
}
