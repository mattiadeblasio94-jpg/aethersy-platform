import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Mail, User } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth";

interface FormErrors {
  name?: string;
  email?: string;
}

/**
 * Registrazione (brief §4.2). Stadio A: nessuna password raccolta o trasmessa;
 * al submit si crea la sessione mock e si prosegue nell'onboarding.
 */
export default function Register() {
  const register = useAuthStore((state) => state.register);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    if (name.trim().length < 2) next.name = "Inserisci il tuo nome (min. 2 caratteri).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Inserisci un indirizzo email valido.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    window.setTimeout(() => {
      register(name.trim(), email.trim());
      navigate("/onboarding", { replace: true });
    }, 350);
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="gradient-primary hidden flex-col justify-between p-10 lg:flex lg:w-1/2">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-192.png" alt="" width={40} height={40} className="h-10 w-10" />
          <span className="wordmark text-xl font-semibold text-text-primary">AETHERSY</span>
        </div>
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight text-text-primary">
            Inizia in <span className="text-gradient-accent">tre passi</span>
          </h1>
          <ol className="mt-6 flex flex-col gap-3 text-base text-text-secondary">
            <li>1. Crea il tuo account</li>
            <li>2. Descrivi la tua attivita'</li>
            <li>3. Attiva i primi agenti AI</li>
          </ol>
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

          <h2 className="font-display text-2xl font-semibold text-text-primary">
            Crea il tuo account
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Nessuna carta richiesta per iniziare.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <Input
              label="Nome e cognome"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Mario Rossi"
              leftIcon={<User className="h-4 w-4" aria-hidden="true" />}
              value={name}
              error={errors.name}
              onChange={(event) => setName(event.target.value)}
              required
            />

            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nome@azienda.it"
              leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              value={email}
              error={errors.email}
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
              Crea account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Hai gia' un account?{" "}
            <Link
              to="/login"
              className="font-medium text-secondary underline-offset-2 hover:underline"
            >
              Accedi
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
