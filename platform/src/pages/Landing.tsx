// =============================================================================
// Landing pubblica — solo dati reali.
//
// I contenuti descrivono cio' che la piattaforma fa davvero (stadi della
// pipeline: brand, sito, contenuti, social; lead dal form; analytics sui
// crediti consumati) e le uniche informazioni dinamiche sono quelle del
// workspace dell'utente autenticato: piano, crediti e canali collegati
// (GET /api/platform/account, GET /api/platform/platforms). Niente
// testimonianze, prezzi o metriche inventate.
// =============================================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Globe,
  Menu,
  PenLine,
  Share2,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { realKeys } from "@/lib/platform-queries";
import { platformApi } from "@/lib/platform-api";
import { useAuthStore } from "@/store/auth";
import { formatNumber, platformLabel } from "@/lib/utils";

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const FEATURES: Feature[] = [
  {
    id: "brand",
    title: "Brand",
    description:
      "Naming, moodboard, palette, tipografia, tone of voice e logo kit: l'identita' visiva del tuo business.",
    icon: PenLine,
  },
  {
    id: "website",
    title: "Sito web",
    description:
      "Sitemap, wireframe, copy delle pagine, build del sito, form per i lead e SEO on-page di base.",
    icon: Globe,
  },
  {
    id: "content",
    title: "Contenuti",
    description:
      "Piano editoriale, keyword map, primi articoli in bozza e mappa di linking interno tra i contenuti.",
    icon: Bot,
  },
  {
    id: "social",
    title: "Social media",
    description:
      "Calendario editoriale, caption, asset statici, reel e coda di pubblicazione programmata.",
    icon: Share2,
  },
  {
    id: "lead",
    title: "Lead e outreach",
    description:
      "I contatti che arrivano dal form del sito entrano in un funnel con stati reali: nuovo, contattato, qualificato, acquisito.",
    icon: Target,
  },
  {
    id: "analytics",
    title: "Analisi dei consumi",
    description:
      "Crediti effettivamente consumati per capability e per giorno, stato dei deliverable e riepilogo dei lead.",
    icon: BarChart3,
  },
];

const STEPS = [
  {
    id: "step-1",
    title: "Definisci il lavoro",
    description:
      "Descrivi il bisogno al consulente della piattaforma: la richiesta viene trasformata in un'esecuzione con specialisti dedicati.",
  },
  {
    id: "step-2",
    title: "Gli agenti producono",
    description:
      "Ogni stadio della pipeline (brand, sito, contenuti, social) genera deliverable reali, con i crediti consumati registrati.",
  },
  {
    id: "step-3",
    title: "Tu approvi",
    description:
      "I deliverable passano in revisione: approvi o rifiuti, e il lavoro riparte da li'.",
  },
];

/** Canali social supportati dal collegamento account. */
const SUPPORTED_CHANNELS = ["instagram", "linkedin", "tiktok", "facebook", "x", "youtube"];

const NAV_LINKS = [
  { href: "#funzionalita", label: "Funzionalita'" },
  { href: "#come-funziona", label: "Come funziona" },
  { href: "#piano", label: "Il tuo piano" },
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const account = useQuery({
    queryKey: realKeys.account,
    queryFn: () => platformApi.getAccount(),
    enabled: isAuthenticated,
  });
  const platforms = useQuery({
    queryKey: realKeys.platforms,
    queryFn: () => platformApi.getPlatforms(),
    enabled: isAuthenticated,
  });

  const connectedChannels = (platforms.data ?? [])
    .filter((platform) => platform.connected)
    .map((platform) => platform.provider);

  return (
    <div className="min-h-dvh">
      {/* --- Header pubblico ------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-secondary/10 bg-primary/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-content items-center gap-3 px-4 lg:px-8">
          <Link to="/landing" className="flex items-center gap-2.5" aria-label="Aethersy — Home">
            <img src="/brand/logo-192.png" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="wordmark text-lg font-semibold text-text-primary">AETHERSY</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Sezioni pagina">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary sm:block"
            >
              Accedi
            </Link>
            <Link
              to="/register"
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-hover"
            >
              Inizia gratis
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "Chiudi menu" : "Apri menu"}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover lg:hidden"
            >
              {menuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="landing-mobile-menu"
            aria-label="Sezioni pagina"
            className="border-t border-secondary/10 px-4 py-3 lg:hidden"
          >
            <ul className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  Accedi
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </header>

      {/* --- Hero ------------------------------------------------------------ */}
      <section className="relative overflow-hidden">
        <div className="mx-auto flex w-full max-w-content flex-col items-center gap-6 px-4 py-16 text-center lg:px-8 lg:py-24">
          <Badge variant="info" icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}>
            Agenti AI per la tua presenza digitale
          </Badge>

          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-text-primary lg:text-5xl">
            Il tuo <span className="text-gradient-accent">AI Operating Officer</span>, sempre al
            lavoro
          </h1>

          <p className="max-w-2xl text-base text-text-secondary lg:text-lg">
            Aethersy produce il brand, il sito, i contenuti e i contenuti social del tuo business,
            gestisce i lead e registra ogni consumo. Tu definisci gli obiettivi, gli agenti
            eseguono.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/register"
              className="gradient-accent inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-base font-semibold text-accent-foreground shadow-glow transition-all hover:brightness-110"
            >
              Inizia gratis
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#funzionalita"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-secondary/25 px-6 text-base font-medium text-text-primary transition-colors hover:bg-bg-hover"
            >
              Scopri di piu'
            </a>
          </div>

          <p className="text-sm text-text-muted">
            Il piano Free include 100 crediti al mese e non richiede carta di credito.
          </p>
        </div>
      </section>

      {/* --- Funzionalita' --------------------------------------------------- */}
      <section id="funzionalita" className="mx-auto w-full max-w-content px-4 py-16 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-semibold text-text-primary">
            Tutto cio' che serve per crescere
          </h2>
          <p className="mt-2 text-base text-text-secondary">
            Ogni area e' una specializzazione della pipeline, con deliverable e consumi registrati.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.id} interactive className="flex flex-col gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/15">
                  <Icon className="h-5 w-5 text-secondary" aria-hidden="true" />
                </span>
                <h3 className="font-display text-lg font-semibold text-text-primary">
                  {feature.title}
                </h3>
                <p className="text-sm text-text-secondary">{feature.description}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* --- Canali ---------------------------------------------------------- */}
      <section className="border-y border-secondary/10 bg-primary/40">
        <div className="mx-auto w-full max-w-content px-4 py-16 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="font-display text-3xl font-semibold text-text-primary">
              I tuoi canali, un solo posto
            </h2>
            <p className="mt-2 text-base text-text-secondary">
              Collega gli account social dal tuo workspace e lascia che la coda di pubblicazione
              venga gestita dalla pipeline.
            </p>
          </div>

          {isAuthenticated && platforms.isLoading ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-40 rounded-full" />
              ))}
            </div>
          ) : connectedChannels.length > 0 ? (
            <ul className="flex flex-wrap items-center justify-center gap-3">
              {connectedChannels.map((provider) => (
                <li
                  key={provider}
                  className="flex items-center gap-3 rounded-full border border-secondary/15 bg-bg-card px-4 py-2.5"
                >
                  <img
                    src={`/icons/${provider}.svg`}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                  <span className="text-sm font-medium text-text-primary">
                    {platformLabel(provider)}
                  </span>
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-wrap items-center justify-center gap-3">
              {SUPPORTED_CHANNELS.map((provider) => (
                <li
                  key={provider}
                  className="flex items-center gap-3 rounded-full border border-secondary/15 bg-bg-card px-4 py-2.5"
                >
                  <img
                    src={`/icons/${provider}.svg`}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                  <span className="text-sm font-medium text-text-primary">
                    {platformLabel(provider)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {isAuthenticated && connectedChannels.length === 0 && !platforms.isLoading && (
            <p className="mt-6 text-center text-sm text-text-muted">
              Nessun canale collegato al momento: puoi collegarli in qualsiasi momento dalla sezione
              Integrazioni.
            </p>
          )}
        </div>
      </section>

      {/* --- Come funziona --------------------------------------------------- */}
      <section id="come-funziona" className="mx-auto w-full max-w-content px-4 py-16 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-semibold text-text-primary">
            Come funziona
          </h2>
          <p className="mt-2 text-base text-text-secondary">Tre passi, zero complicazioni.</p>
        </div>

        <ol className="grid gap-4 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.id}>
              <Card className="flex h-full flex-col gap-3">
                <span className="gradient-accent flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-accent-foreground">
                  {index + 1}
                </span>
                <h3 className="font-display text-lg font-semibold text-text-primary">
                  {step.title}
                </h3>
                <p className="text-sm text-text-secondary">{step.description}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Piano reale ------------------------------------------------------ */}
      <section id="piano" className="mx-auto w-full max-w-content px-4 pb-16 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="font-display text-3xl font-semibold text-text-primary">
            Il tuo piano, i tuoi crediti
          </h2>
          <p className="mt-2 text-base text-text-secondary">
            Dati letti dal tuo workspace: niente stime ne' prezzi ipotetici.
          </p>
        </div>

        {isAuthenticated && account.isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : isAuthenticated && account.data ? (
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-text-muted">Workspace</p>
                <p className="font-display text-xl font-semibold text-text-primary">
                  {account.data.tenantName}
                </p>
              </div>
              <Badge variant="info">{account.data.plan}</Badge>
            </div>

            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-primary/40 px-4 py-3">
                <dt className="text-xs text-text-muted">Crediti disponibili</dt>
                <dd className="font-display text-2xl font-semibold text-text-primary">
                  {formatNumber(account.data.available)}
                </dd>
              </div>
              <div className="rounded-lg bg-primary/40 px-4 py-3">
                <dt className="text-xs text-text-muted">Crediti riservati</dt>
                <dd className="font-display text-2xl font-semibold text-text-primary">
                  {formatNumber(account.data.reserved)}
                </dd>
              </div>
              <div className="rounded-lg bg-primary/40 px-4 py-3">
                <dt className="text-xs text-text-muted">Hard-stop a crediti esauriti</dt>
                <dd className="font-display text-2xl font-semibold text-text-primary">
                  {account.data.hardStopOnEmpty ? "Attivo" : "Disattivato"}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/subscription"
                className="gradient-accent inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-accent-foreground shadow-glow transition-all hover:brightness-110"
              >
                Vai all'abbonamento
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="text-sm text-text-muted">
                Pacchetti crediti e ricarica automatica si gestiscono nella sezione Abbonamento.
              </p>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              Accedi per vedere piano, crediti disponibili e consumi reali del tuo workspace. Il
              piano Free parte con 100 crediti al mese e senza carta di credito; i pacchetti crediti
              si acquistano nella sezione Abbonamento.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="gradient-accent inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-accent-foreground shadow-glow transition-all hover:brightness-110"
              >
                Accedi
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/register"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-secondary/25 px-5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover"
              >
                Crea un account
              </Link>
            </div>
          </Card>
        )}
      </section>

      {/* --- CTA finale ------------------------------------------------------ */}
      <section className="mx-auto w-full max-w-content px-4 pb-16 lg:px-8">
        <div className="gradient-primary flex flex-col items-center gap-5 rounded-2xl border border-secondary/20 px-6 py-12 text-center">
          <h2 className="max-w-2xl font-display text-3xl font-semibold text-text-primary">
            Pronto a mettere al lavoro i tuoi agenti?
          </h2>
          <p className="max-w-xl text-base text-text-secondary">
            Inizia oggi e lascia che Aethersy produca brand, sito, contenuti e social del tuo
            business.
          </p>
          <Link
            to="/register"
            className="gradient-accent inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-base font-semibold text-accent-foreground shadow-glow transition-all hover:brightness-110"
          >
            Crea il tuo account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* --- Footer ---------------------------------------------------------- */}
      <footer className="border-t border-secondary/10 bg-primary/40">
        <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-2.5">
            <img src="/brand/logo-192.png" alt="" width={28} height={28} className="h-7 w-7" />
            <span className="wordmark text-base font-semibold text-text-primary">AETHERSY</span>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Link footer">
            <a href="#funzionalita" className="text-sm text-text-muted hover:text-text-secondary">
              Funzionalita'
            </a>
            <a href="#come-funziona" className="text-sm text-text-muted hover:text-text-secondary">
              Come funziona
            </a>
            <Link to="/login" className="text-sm text-text-muted hover:text-text-secondary">
              Accedi
            </Link>
            <Link to="/register" className="text-sm text-text-muted hover:text-text-secondary">
              Registrati
            </Link>
          </nav>

          <p className="text-sm text-text-muted">
            © {new Date().getFullYear()} Aethersy. Tutti i diritti riservati.
          </p>
        </div>
      </footer>
    </div>
  );
}
