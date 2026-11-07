-- Schema `auth` - idempotente, rieseguibile a ogni avvio del BFF.
-- Credenziali delle identita' che il BFF gestisce: l'email dell'utente, il
-- provider (email | google | github) e la password Activepieces cifrata.
--
-- Perche' serve: il login con Google/GitHub non conosce la password Activepieces
-- dell'utente. Per restituire al browser un token Activepieces valido (quello
-- che abilita /api/ap/*), il BFF deve poter rientrare con le credenziali che
-- lui stesso ha creato. La password e' salvata CIFRATA (AES-256-GCM, vedi
-- pipeline/secrets.ts): nel database non c'e' mai in chiaro.
--
-- Se la riga manca (es. account creato direttamente nella UI Activepieces),
-- il login social apre comunque la sessione: il token Activepieces resta
-- assente e le rotte /api/ap/* rispondono 401 con un messaggio esplicito.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.identity_credential (
  email           text PRIMARY KEY,
  provider        text NOT NULL DEFAULT 'email',
  ap_user_id      text,
  ap_password_enc text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_credential_provider CHECK (provider IN ('email', 'google', 'github'))
);
CREATE INDEX IF NOT EXISTS identity_credential_provider_idx
  ON auth.identity_credential(provider);

-- Profilo utente ----------------------------------------------------------------
-- Dati che l'utente compila (nome, azienda, ruolo, fuso orario, lingua). Non
-- contiene segreti: e' la scheda mostrata in "Impostazioni > Profilo".
CREATE TABLE IF NOT EXISTS auth.identity_profile (
  email      text PRIMARY KEY,
  first_name text NOT NULL DEFAULT '',
  last_name  text NOT NULL DEFAULT '',
  company    text NOT NULL DEFAULT '',
  role_title text NOT NULL DEFAULT '',
  timezone   text NOT NULL DEFAULT 'Europe/Rome',
  locale     text NOT NULL DEFAULT 'it',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preferenze di notifica ---------------------------------------------------------
-- Un solo documento JSON per identita': canali attivi, frequenza del digest,
-- silenzi, tema. La pagina "Impostazioni > Notifiche" legge e scrive qui.
CREATE TABLE IF NOT EXISTS auth.identity_preference (
  email      text PRIMARY KEY,
  prefs      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
