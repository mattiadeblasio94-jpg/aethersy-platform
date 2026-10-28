import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Globe,
  Menu,
  Quote,
  Shield,
  Share2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLandingContent } from "@/lib/queries";
import { formatCurrency, platformLabel } from "@/lib/utils";

/** Risolve il nome icona salvato nei mock verso il componente lucide-react. */
const FEATURE_ICONS = {
  // "Robot" e' il nome storicizzato nei mock; in lucide-react l'icona e' Bot.
  Robot: Bot,
  Share2,
  BarChart3,
  Zap,
  Globe,
  Shield,
} as const;

type FeatureIconName = keyof typeof FEATURE_ICONS;

function resolveFeatureIcon(name: string) {
  return FEATURE_ICONS[name as FeatureIconName] ?? Sparkles;
}

/**
 * Landing pubblica (brief §4.1). Sezioni: hero, funzionalita', piattaforme,
 * come funziona, testimonianze, prezzi e CTA finale. Tutti i contenuti
 * arrivano dal mock layer tipizzato tramite React Query.
 */
const NAV_LINKS = [
  { href: "#funzionalita", label: "Funzionalita'" },
  { href: "#piattaforme", label: "Piattaforme" },
  { href: "#come-funziona", label: "Come funziona" },
  { href: "#prezzi", label: "Prezzi" },
];

export default function Landing() {
  const { data, isLoading, isError } = useLandingContent();
  const [menuOpen, setMenuOpen] = useState(false);

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

        {/* Menu mobile: stessi link della nav desktop. */}
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

      {isError && (
        <div className="mx-auto max-w-content px-4 py-10 lg:px-8">
          <Card>
            <p className="text-sm text-error">
              Impossibile caricare i contenuti in questo momento. Ricarica la pagina.
            </p>
          </Card>
        </div>
      )}

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
            Aethersy pianifica, crea e pubblica contenuti, gestisce l'outreach e monitora i
            risultati su tutte le piattaforme. Tu definisci gli obiettivi, gli agenti eseguono.
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
            Nessuna carta di credito · Setup in 2 minuti · Disdici quando vuoi
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
            Un'unica piattaforma per social, contenuti, outreach e analytics.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="flex flex-col gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-4/5" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.features ?? []).map((feature) => {
              const Icon = resolveFeatureIcon(feature.icon);
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
        )}
      </section>

      {/* --- Piattaforme ----------------------------------------------------- */}
      <section id="piattaforme" className="border-y border-secondary/10 bg-primary/40">
        <div className="mx-auto w-full max-w-content px-4 py-16 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="font-display text-3xl font-semibold text-text-primary">
              Tutte le tue piattaforme, un solo posto
            </h2>
            <p className="mt-2 text-base text-text-secondary">
              Collega i canali social e lascia che gli agenti distribuiscano i contenuti.
            </p>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-3">
            {(data?.platforms ?? []).map((platformId) => (
              <li
                key={platformId}
                className="flex items-center gap-3 rounded-full border border-secondary/15 bg-bg-card px-4 py-2.5"
              >
                <img
                  src={`/icons/${platformId}.svg`}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium text-text-primary">
                  {platformLabel(platformId)}
                </span>
              </li>
            ))}
          </ul>
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
          {(data?.steps ?? []).map((step, index) => (
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

      {/* --- Testimonianze --------------------------------------------------- */}
      <section className="border-y border-secondary/10 bg-primary/40">
        <div className="mx-auto w-full max-w-content px-4 py-16 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-semibold text-text-primary">
              Chi lo usa ogni giorno
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {(data?.testimonials ?? []).map((testimonial) => (
              <Card key={testimonial.id} className="flex h-full flex-col gap-4">
                <Quote className="h-6 w-6 text-tertiary" aria-hidden="true" />
                <blockquote className="flex-1 text-sm text-text-secondary">
                  “{testimonial.quote}”
                </blockquote>
                <div className="flex items-center gap-3">
                  <img
                    src={testimonial.avatar ?? "/brand/logo-192.png"}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full border border-secondary/20"
                  />
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {testimonial.name}
                    </p>
                    <p className="text-xs text-text-muted">
                      {testimonial.role} · {testimonial.company}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* --- Prezzi ---------------------------------------------------------- */}
      <section id="prezzi" className="mx-auto w-full max-w-content px-4 py-16 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-semibold text-text-primary">
            Prezzi semplici e trasparenti
          </h2>
          <p className="mt-2 text-base text-text-secondary">
            Scegli il piano giusto e cambia quando vuoi.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {(data?.pricing ?? []).map((tier) => (
            <Card
              key={tier.id}
              variant={tier.highlighted ? "elevated" : "default"}
              className="flex h-full flex-col gap-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl font-semibold text-text-primary">
                  {tier.name}
                </h3>
                {tier.highlighted && <Badge variant="accent">Consigliato</Badge>}
              </div>

              <div>
                <p className="font-display text-3xl font-semibold text-text-primary">
                  {formatCurrency(tier.monthlyPrice)}
                  <span className="text-base font-normal text-text-muted"> / mese</span>
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  oppure {formatCurrency(tier.annualPrice)} all'anno
                </p>
              </div>

              <p className="text-sm text-text-secondary">{tier.description}</p>

              <ul className="flex flex-1 flex-col gap-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-text-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                to="/register"
                className={
                  tier.highlighted
                    ? "gradient-accent inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold text-accent-foreground shadow-glow transition-all hover:brightness-110"
                    : "inline-flex h-11 items-center justify-center rounded-lg border border-secondary/25 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover"
                }
              >
                Scegli {tier.name}
              </Link>
            </Card>
          ))}
        </div>
      </section>

      {/* --- CTA finale ------------------------------------------------------ */}
      <section className="mx-auto w-full max-w-content px-4 pb-16 lg:px-8">
        <div className="gradient-primary flex flex-col items-center gap-5 rounded-2xl border border-secondary/20 px-6 py-12 text-center">
          <h2 className="max-w-2xl font-display text-3xl font-semibold text-text-primary">
            Pronto a mettere al lavoro i tuoi agenti?
          </h2>
          <p className="max-w-xl text-base text-text-secondary">
            Inizia oggi e lascia che Aethersy gestisca la tua presenza digitale.
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
            <a href="#prezzi" className="text-sm text-text-muted hover:text-text-secondary">
              Prezzi
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
