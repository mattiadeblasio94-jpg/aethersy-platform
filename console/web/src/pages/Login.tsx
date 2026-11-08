import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useLogin, useSession } from "../lib/query";

export default function Login() {
  const { data: user } = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Messaggio di errore portato dal callback OAuth (?error=&message=).
  const oauthError = searchParams.get("error");
  const oauthMessage = searchParams.get("message");

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex h-full items-center justify-center px-4">
      <form
        className="card w-full max-w-sm p-7"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password }, { onSuccess: () => navigate("/") });
        }}
      >
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src="/brand/logo-192.png" alt="Aethersy" className="h-14 w-14" />
          <div className="text-center">
            <h1 className="wordmark text-2xl font-semibold text-white">Aethersy Console</h1>
            <p className="mt-1 text-sm text-[--color-muted]">Piattaforma AI di automazione</p>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-[--color-muted]">Email</label>
        <input
          className="input mb-4"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@aethersy.online"
        />

        <label className="mb-1 block text-xs font-medium text-[--color-muted]">Password</label>
        <input
          className="input mb-5"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {login.isError && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            Credenziali non valide.
          </div>
        )}

        {/* Esito del login sociale: il BFF rimanda qui con ?error=&message=. */}
        {oauthError && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            {oauthMessage ?? "Accesso con il provider non riuscito."}
          </div>
        )}

        <button className="btn btn-primary glow w-full justify-center" disabled={login.isPending}>
          {login.isPending ? "Accesso…" : "Accedi"}
        </button>

        <p className="mt-4 text-center text-[11px] text-[--color-muted]">
          Usa le credenziali del tuo account Activepieces.
        </p>
      </form>
    </div>
  );
}
