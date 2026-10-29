import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth";
import { HttpError } from "@/lib/http";

interface LocationState {
  from?: string;
}

/**
 * Login (brief §4.2). Autenticazione reale: le credenziali vanno al BFF
 * (`POST /api/auth/login`), che apre la sessione in un cookie httpOnly. Il
 * redirect post-login rispetta la rotta di provenienza.
 */
export default function Login() {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
