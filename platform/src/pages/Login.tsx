import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Lock, Mail, Github, Send } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth";
import { platformApi, type SocialProviderStatus } from "@/lib/platform-api";
import { HttpError } from "@/lib/http";

interface LocationState {
  from?: string;
}

/**
 * Login (brief §4.2). Autenticazione reale: le credenziali vanno al BFF
 * (`POST /api/auth/login`), che apre la sessione in un cookie httpOnly. Il
 * redirect post-login rispetta la rotta di provenienza.
 *
 * Social login: Google e GitHub via redirect al BFF (`GET /api/auth/social/:provider`).
 * Se il provider fallisce il BFF rimanda qui con `?error=&message=`: l'utente
 * vede cosa e' successo invece di una pagina JSON. `GET /api/auth/social/providers`
 * dice quali provider sono davvero configurati, cosi' il bottone non promette
 * un accesso che il server non puo' completare.
 * Nessun token salvato in localStorage: la sessione e' interamente nel cookie httpOnly.
 */
export default function Login() {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<Record<string, SocialProviderStatus>>({});

  // Messaggio di errore portato dal callback OAuth (?error=&message=).
  const oauthError = searchParams.get("error");
  const oauthMessage = searchParams.get("message");

  useEffect(() => {
    let active = true;
    platformApi
      .getSocialProviders()
      .then((data) => {
        if (active) setProviders(data.providers);
      })
      .catch(() => {
        // Stato provider non disponibile: i bottoni restano utilizzabili,
        // l'errore eventuale arriva comunque dal callback.
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Inserisci un indirizzo email valido.");
      return;
    }
    if (password.length < 1) {
      setError("Inserisci la password.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(state?.from ?? "/studio", { replace: true });
    } catch (err) {
      const message =
        err instanceof HttpError && err.status === 401
          ? "Email o password non corretti."
          : err instanceof Error
            ? err.message
            : "Accesso non riuscito.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSocialLogin(provider: "google" | "github" | "telegram") {
    setError(null);
    // Redirect al BFF per avviare il flusso OAuth del provider. `target` dice al
    // BFF dove tornare dopo il login (allowlist: platform | console).
    window.location.href = `/api/auth/social/${provider}?target=platform`;
  }

  const providerHint = (provider: "google" | "github" | "telegram"): string | null => {
    const status = providers[provider];
    if (!status) return null;
    if (!status.configured) return `${status.label} non e' ancora configurato su questo ambiente.`;
    if (status.lastError) return status.lastError.message;
    return null;
  };

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Pannello brand, nascosto sotto lg. */}
      <aside className="gradient-primary hidden flex-col justify-between p-10 lg:flex lg:w-1/2">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-192.png" alt="" width={40} height={40} className="h-10 w-10" />
          <span className="wordmark text-xl font-semibold text-text-primary">AETHERSY</span>
        </div>
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight text-text-primary">
            Il tuo <span className="text-gradient-accent">AI Operating Officer</span>
          </h1>
          <p className="mt-4 max-w-md text-base text-text-secondary">
            Agenti autonomi che gestiscono social, contenuti, outreach e analytics
            mentre tu ti concentri sulla crescita.
          </p>
        </div>
        <p className="text-sm text-text-muted">
          © {new Date().getFullYear()} Aethersy. Tutti i diritti riservati.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <img src="/brand/logo-192.png" alt="" width={48} height={48} className="h-12 w-12" />
            <span className="wordmark text-xl font-semibold text-text-primary">AETHERSY</span>
          </div>

          <h2 className="font-display text-2xl font-semibold text-text-primary">Accedi</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Entra con le credenziali del tuo account Aethersy.
          </p>

          {/* Esito del login sociale: il BFF rimanda qui con ?error=&message=. */}
          {oauthError ? (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{oauthMessage ?? "Accesso con il provider non riuscito."}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nome@azienda.it"
              leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
              value={password}
              error={error ?? undefined}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={submitting}
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              Accedi
            </Button>
          </form>

          {/* Divider con "o" */}
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 border-t border-secondary/30" />
            <span className="text-xs font-medium text-text-muted">o continua con</span>
            <span className="h-px flex-1 border-t border-secondary/30" />
          </div>

          {/* Social login buttons - non sovrapposti, uno per riga */}
          <div className="mt-2 flex flex-col gap-3">
            <div>
              <Button
                size="lg"
                fullWidth
                disabled={providers.google ? !providers.google.configured : false}
                onClick={() => handleSocialLogin("google")}
                className="flex items-center justify-center gap-2"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 9.1 1 11.39 1 13.93s.43 4.83 1.18 6.83l3.65-2.77c-.67-.72-1.1-1.78-1.1-2.94zM12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.65 2.77c.87-2.6 3.36-4.46 6.17-4.46z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 23c4.3 0 8.01-2.47 9.82-6.17l-3.57-2.77c-.87 1.62-3.3 2.74-6.25 2.74-3.3 0-6.02-2.47-6.82-5.81H2.18C1 14.72 1.43 12.43 2.18 9.87l3.65-2.77c-.75 1.18-1.18 2.57-1.18 4.07s.43 2.89 1.18 4.07l3.65-2.77A8.5 8.5 0 0 0 12 23z"
                  />
                </svg>
                Continua con Google
              </Button>
              {providerHint("google") ? (
                <p className="mt-1 text-xs text-text-muted">{providerHint("google")}</p>
              ) : null}
            </div>

            <div>
              <Button
                size="lg"
                fullWidth
                disabled={providers.github ? !providers.github.configured : false}
                onClick={() => handleSocialLogin("github")}
                className="flex items-center justify-center gap-2"
              >
                <Github className="h-4 w-4" aria-hidden="true" />
                Continua con GitHub
              </Button>
              {providerHint("github") ? (
                <p className="mt-1 text-xs text-text-muted">{providerHint("github")}</p>
              ) : null}
            </div>

            <div>
              <Button
                size="lg"
                fullWidth
                disabled={providers.telegram ? !providers.telegram.configured : false}
                onClick={() => handleSocialLogin("telegram")}
                className="flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Continua con Telegram
              </Button>
              {providerHint("telegram") ? (
                <p className="mt-1 text-xs text-text-muted">{providerHint("telegram")}</p>
              ) : null}
            </div>
          </div>


          <p className="mt-6 text-center text-sm text-text-secondary">
            Non hai un account?{" "}
            <Link
              to="/register"
              className="font-medium text-secondary underline-offset-2 hover:underline"
            >
              Registrati
            </Link>
          </p>

          <p className="mt-2 text-center text-sm">
            <Link to="/landing" className="text-text-muted hover:text-text-secondary">
              Scopri Aethersy
            </Link>
          </p>

          <p className="mt-1 text-center text-xs text-text-muted">
            <Link to="/privacy" className="hover:text-text-secondary">
              Privacy Policy
            </Link>
            <span className="mx-2">·</span>
            <Link to="/terms" className="hover:text-text-secondary">
              Termini di servizio
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
