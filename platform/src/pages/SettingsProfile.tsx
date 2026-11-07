import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, Globe, Mail, Save, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { EmptyState } from "@/components/common/PageElements";
import { ThemeSelector } from "@/components/common/ThemeToggle";
import { PageTransition } from "@/components/common/Motion";
import { platformApi } from "@/lib/platform-api";
import { useProfile, useUpdateProfile } from "@/lib/platform-queries";

const TIMEZONE_OPTIONS = [
  { value: "Europe/Rome", label: "Europe/Rome" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Europe/Madrid", label: "Europe/Madrid" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "UTC", label: "UTC" },
];

const LOCALE_OPTIONS = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
];

interface ProfileForm {
  firstName: string;
  lastName: string;
  company: string;
  roleTitle: string;
  timezone: string;
  locale: string;
}

const EMPTY_FORM: ProfileForm = {
  firstName: "",
  lastName: "",
  company: "",
  roleTitle: "",
  timezone: "Europe/Rome",
  locale: "it",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Salvataggio non riuscito";
}

export default function SettingsProfile() {
  const { toast } = useToast();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const session = useQuery({
    queryKey: ["real", "session"],
    queryFn: () => platformApi.getSession(),
  });

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      firstName: profile.data.firstName ?? "",
      lastName: profile.data.lastName ?? "",
      company: profile.data.company ?? "",
      roleTitle: profile.data.roleTitle ?? "",
      timezone: profile.data.timezone || "Europe/Rome",
      locale: profile.data.locale || "it",
    });
  }, [profile.data]);

  const timezoneOptions = useMemo(() => {
    if (form.timezone && !TIMEZONE_OPTIONS.some((option) => option.value === form.timezone)) {
      return [{ value: form.timezone, label: form.timezone }, ...TIMEZONE_OPTIONS];
    }
    return TIMEZONE_OPTIONS;
  }, [form.timezone]);

  const email = session.data?.email ?? profile.data?.email ?? "";

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.firstName.trim()) {
      setError("Il nome e' obbligatorio.");
      return;
    }
    setError(null);
    try {
      await updateProfile.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        company: form.company.trim(),
        roleTitle: form.roleTitle.trim(),
        timezone: form.timezone,
        locale: form.locale,
      });
      toast({
        kind: "success",
        title: "Profilo aggiornato",
        description: "Le modifiche sono state salvate sul tuo profilo.",
      });
    } catch (mutationError) {
      toast({
        kind: "error",
        title: "Salvataggio non riuscito",
        description: errorText(mutationError),
      });
    }
  }

  return (
    <PageTransition>
      <SettingsLayout
        title="Profilo"
        description="Dati anagrafici e preferenze di visualizzazione legati alla tua identita'."
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
        ) : profile.isError ? (
          <Card bodyClassName="p-5">
            <EmptyState
              title="Profilo non disponibile"
              description={errorText(profile.error)}
              action={
                <Button variant="secondary" size="sm" onClick={() => profile.refetch()}>
                  Ricarica profilo
                </Button>
              }
            />
          </Card>
        ) : (
          <form id="profile-form" onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
            <Card header={<h3 className="text-base font-semibold text-text-primary">Dati personali</h3>}>
              <div className="flex flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Nome"
                    value={form.firstName}
                    onChange={(event) => update("firstName", event.target.value)}
                    leftIcon={<UserIcon className="h-4 w-4" aria-hidden="true" />}
                    autoComplete="given-name"
                    required
                  />
                  <Input
                    label="Cognome"
                    value={form.lastName}
                    onChange={(event) => update("lastName", event.target.value)}
                    autoComplete="family-name"
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={email}
                    readOnly
                    disabled
                    leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
                    autoComplete="email"
                    hint="L'email identifica l'identita' Console e non e' modificabile."
                  />
                  <Input
                    label="Azienda"
                    value={form.company}
                    onChange={(event) => update("company", event.target.value)}
                    leftIcon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                    autoComplete="organization"
                  />
                  <Input
                    label="Ruolo"
                    value={form.roleTitle}
                    onChange={(event) => update("roleTitle", event.target.value)}
                    placeholder="Es. Responsabile marketing"
                    autoComplete="organization-title"
                  />
                </div>
              </div>
            </Card>

            <Card header={<h3 className="text-base font-semibold text-text-primary">Preferenze</h3>}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Lingua"
                  value={form.locale}
                  onChange={(event) => update("locale", event.target.value)}
                  options={LOCALE_OPTIONS}
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
                <p className="text-sm font-medium text-text-secondary">Tema dell'interfaccia</p>
                <ThemeSelector />
                <p className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                  La preferenza viene salvata e applicata subito.
                </p>
              </div>
            </Card>

            {error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}
          </form>
        )}
      </SettingsLayout>
    </PageTransition>
  );
}
