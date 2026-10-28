import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Mail } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth";

interface LocationState {
  from?: string;
}

/**
 * Login (brief §4.2). Stadio A: autenticazione mock — nessuna password
 * transitata o salvata, si richiede solo l'email per creare la sessione locale.
 * Il redirect post-login rispetta la rotta di provenienza.
 */
export default function Login() {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Inserisci un indirizzo email valido.");
      return;
    }
    setError(null);
    setSubmitting(true);
    // Simula la latenza della chiamata di auth (mock).
    window.setTimeout(() => {
      login(email);
      navigate(state?.from ?? "/dashboard", { replace: true });
    }, 350);
  }

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
            Inserisci la tua email per entrare nel workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nome@azienda.it"
              leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              value={email}
              error={error ?? undefined}
              onChange={(event) => setEmail(event.target.value)}
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
        </div>
      </main>
    </div>
  );
}
