# Sicurezza migrazione mock → reale — Report Vault

**Piattaforma:** Aethersy (`platform.aethersy.online`, `console.aethersy.online`)
**Data:** 2026-11-03
**Autore:** Vault — Security Engineer Aethersy
**Scope:** Nuovi endpoint BFF (`/api/platform/*`, `/api/business/*`) e flusso auth cross-subdomain (`console.aethersy.online` ↔ `platform.aethersy.online`)

---

## Executive Summary

La migrazione mock → reale introduce una superficie d'attacco consistente: nuovi endpoint BFF sotto `/api/platform/` e `/api/business/`, autenticazione via cookie httpOnly condivisa tra sottodomini, metering per tenant, endpoint AI/chat esposti al pubblico. L'implementazione attuale è **solida su autenticazione, isolamento tenant e validazione input**, ma presenta **lacune su CSRF, security headers e rate limiting generico**. Nessuna segreto risulta esposto al frontend.

---

## Findings (per severità)

### [Important] CSRF: assenza di protezione anti-CSRF sulle rotte mutanti protette da cookie

**File:** `console/server/src/session.ts` (riga 60-65), `console/server/src/config.ts` (riga 96)

**Impatto:** Il cookie `aethersy_session` è `httpOnly`, `sameSite: lax`, dominio `.aethersy.online`. `sameSite=lax` mitiga parzialmente CSRF sulle richieste cross-site, ma **non protegge** da:
- richieste top-level navigation (es. `<form method="POST" action="https://console.aethersy.online/api/platform/schedule">` inviato da sito malvagio),
- richieste same-site originate da sottodomini controllati dall'attaccante,
- metodi GET con effetti collaterali (non presenti qui, ma da prevenire).

**Fix raccomandato:**
1. Aggiungere un token CSRF (double-submit cookie o header `X-CSRF-Token`) per tutte le rotte mutanti (`POST`, `PATCH`, `DELETE`) sotto `/api/platform/` e `/api/business/`.
2. Oppure alzare `sameSite` a `"strict"` (rompe login cross-subdomain da link esterni, da valutare).
3. Test: invocare `POST /api/platform/schedule` con cookie valido ma senza token CSRF → deve restituire `403`.

**Priorità:** Alta (P1 prima del go-live).

---

### [Important] Security headers mancanti (CSP, X-Frame-Options, X-Content-Type-Options, HSTS)

**File:** `aethersy-infra/caddy/Caddyfile`

**Impatto:** Il `Caddyfile` non imposta header di sicurezza. Senza `X-Frame-Options: DENY` la SPA è vulnerabile a clickjacking. Senza `Content-Security-Policy` l'app è esposta a XSS via iniezione di script inline. Senza `Strict-Transport-Security` il downgrade HTTP→HTTPS non è applicato a livello browser.

**Fix raccomandato:** Aggiungere nel blocco `{$PLATFORM_DOMAIN}` (e globalmente):
```
header {
    X-Frame-Options "DENY"
    X-Content-Type-Options "nosniff"
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://platform.aethersy.online https://console.aethersy.online;"
}
```
Nota: `unsafe-inline` per gli stili è necessario per Tailwind; restrittare gli script a `'self'` e valutare `nonce` per script inline futuri.

**Test:** `curl -sI https://platform.aethersy.online/` deve restituire gli header sopra.

**Priorità:** Alta (P1).

---

### [Important] Rate limiting assente su endpoint non-AI

**File:** `console/server/src/metering/guard.ts` (rate limit solo dentro `authorizeAi`), `console/server/src/platform/routes.ts`, `console/server/src/business/routes.ts`

**Impatto:** Gli endpoint AI (`/api/ai/chat`, `/api/ai/generate`) sono rate-limited via Redis (`rl:{key}:{minuto}`, default 120 req/min). Gli endpoint `/api/platform/*` e `/api/business/*` **non** hanno rate limiting generico. Un attaccante potrebbe inondare `POST /api/platform/schedule`, `POST /api/platform/chat`, `GET /api/platform/overview` causando DoS o abuso di risorse DB.

**Fix raccomandato:** Registrare il plugin `@fastify/rate-limit` su `app` (già usato in `builder/agents/specializations/backend.ts`) con un limite globale (es. 300 req/min per IP) più un limite per tenant sulle rotte mutanti. Il rate limit per tenant esiste già solo dentro `authorizeAi`.

**Test:** Effettuare 350 richieste in un minuto su `GET /api/platform/overview` → oltre la soglia deve restituire `429`.

**Priorità:** Media (P2).

---

### [Minor] `CONSOLE_COOKIE_DOMAIN` non impostato di default

**File:** `console/server/src/config.ts` (riga 96), `.env.example`

**Impatto:** `cookieDomain` è vuoto di default → il cookie è host-only (vale solo per `console.aethersy.online`). Se `CONSOLE_COOKIE_DOMAIN=.aethersy.online` non è impostato, il cookie **non viene inviato** a `platform.aethersy.online`, rompendo l'auth cross-subdomain. Il contesto task afferma che dovrebbe essere impostato.

**Fix raccomandato:** Impostare `CONSOLE_COOKIE_DOMAIN=.aethersy.online` in `.env` di produzione e documentarlo in `.env.example`. Verificare che `platform/` invii `credentials: "include"` (già fatto in `http.ts`).

**Test:** Dopo login su `console.aethersy.online`, una richiesta `GET /api/auth/session` da `platform.aethersy.online` deve restituire l'utente (non 401).

**Priorità:** Media (P2).

---

### [Minor] `sameSite: "lax"` potrebbe non bastare per login da link esterni

**File:** `console/server/src/session.ts` (riga 60)

**Impatto:** Con `sameSite=lax`, il cookie viene inviato solo su top-level navigation GET, non su POST cross-site. Questo è un buon compromesso, ma se in futuro si aggiungesse autenticazione via POST cross-origin, servirebbe `none` + `secure` (richiede HTTPS obbligatorio).

**Fix raccomandato:** Mantenere `lax` per ora. Documentare che se si passa a `none` serve `secure: true` (già il caso in produzione).

**Priorità:** Bassa (P3).

---

### [Minor] Redis rate-limit fail-open

**File:** `console/server/src/metering/guard.ts` (riga 99-106)

**Impatto:** Se Redis è down, `rateLimit` restituisce `{ ok: true }` (fail-open). Il metering stesso è fail-closed, ma il rate limit no. Un attaccante che causa l'indisponibilità di Redis potrebbe aggirare il rate limit sugli endpoint AI.

**Fix raccomandato:** Valutare fail-closed per il rate limit su endpoint critici (AI/chat), oppure allertare su Redis down.

**Priorità:** Bassa (P3).

---

## Positives (cosa è già fatto bene)

| Area | Osservazione |
|------|-------------|
| **Autenticazione** | Cookie `httpOnly`, firmato HMAC-SHA256, nessun token in `localStorage`. |
| **Cross-subdomain** | Supporto `domain` cookie già implementato (`config.cookieDomain`), basta impostare `CONSOLE_COOKIE_DOMAIN`. |
| **Endpoint protection** | Tutti i nuovi endpoint `/api/platform/*` e `/api/business/*` usano `requireMeteredTenant` (cookie session o Bearer key). |
| **Isolamento tenant** | Tutte le query in `repo.ts` (platform, business, metering) sono `WHERE tenant_id = $1` / `WHERE id = $1 AND tenant_id = $2`. Nessun IDOR rilevato. |
| **Input validation** | POST/PATCH validano campi richiesti (`title`, `name`, `content`, `cron`, `timezone`, ecc.) con helper dedicati (`validateScheduleInput`, `isValidCron`, `isValidTimeZone`). |
| **Segreti lato server** | Frontend `platform/` usa solo `VITE_API_BASE` / `VITE_DEV_API_TARGET`. Nessuna `OPENROUTER_API_KEY`, `VENICE_API_KEY` o segreto esposto al browser. |
| **Rate limiting AI** | Endpoint `/api/ai/chat` e `/api/ai/generate` usano `authorizeAi` con Redis rate limit per tenant. |
| **Password policy** | Registrazione richiede password ≥ 8 caratteri (`routes.ts` register). |
| **Logout** | `clearSessionCookie` invalida il cookie correttamente. |
| **Audit ledger** | Metering append-only, idempotenza su `(request_id, attempt_no)`, fail-closed su DB. |

---

## Checklist di rimedio (priorità)

| # | Azione | File | Priorità | Verifica |
|---|--------|------|----------|----------|
| 1 | Aggiungere protezione CSRF (token o `sameSite=strict`) su rotte mutanti `/api/platform/*`, `/api/business/*` | `session.ts`, `routes.ts`, `platform/routes.ts`, `business/routes.ts` | P1 | `POST` senza token → `403` |
| 2 | Aggiungere security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS) | `caddy/Caddyfile` | P1 | `curl -sI` restituisce gli header |
| 3 | Impostare `CONSOLE_COOKIE_DOMAIN=.aethersy.online` in `.env` produzione | `console/.env`, `.env.example` | P1 | Login cross-subdomain funziona |
| 4 | Aggiungere rate limiting globale (@fastify/rate-limit) su endpoint non-AI | `index.ts`, `config.ts` | P2 | 350 req/min → `429` |
| 5 | Valutare fail-closed su rate limit quando Redis down | `metering/guard.ts` | P3 | Redis down → rate limit blocca |

---

## Raccomandazioni specifiche per i nuovi endpoint BFF

1. **Tutti i nuovi endpoint** sotto `/api/platform/*` e `/api/business/*` devono chiamare `requireMeteredTenant(request, reply)` all'inizio (già fatto per tutti quelli esistenti).
2. **Tutte le mutazioni** (`POST`, `PATCH`, `DELETE`) devono validare il body prima di scrivere su DB (già fatto per schedule, goals, memory, products, chat).
3. **Tutte le letture per ID** devono filtrare per `tenant_id` (già fatto: `getSchedule(tenantId, id)`, `getGoal(tenantId, id)`, `getMemory(tenantId, id)`, `getProduct(tenantId, id)`).
4. **Endpoint AI/chat** devono continuare a usare `authorizeAi` per rate limit + quota + prenotazione crediti.
5. **Webhook lead** (`/api/pipeline/leads`) usa Bearer key del tenant: non accettare sessione cookie su questa rotta (già corretto, usa `pipelineTenant`).

---

## Test consigliati prima del go-live

1. **Cross-subdomain cookie:** login su `console.aethersy.online`, poi `GET /api/auth/session` da `platform.aethersy.online` con `credentials: include` → `200` con utente.
2. **CSRF:** `POST /api/platform/schedule` con cookie valido ma senza token CSRF → `403`.
3. **IDOR:** `GET /api/platform/schedule/:idAltroTenant` con cookie del tenant A → `404` (non dati del tenant B).
4. **Rate limiting:** 350 richieste in 1 minuto su `GET /api/platform/overview` → `429` oltre soglia.
5. **Security headers:** `curl -sI https://platform.aethersy.online/` → presenza `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`.
6. **Segreti:** build della SPA, grep per `OPENROUTER_API_KEY`, `VENICE_API_KEY`, `CONSOLE_SESSION_SECRET` nel bundle JS → nessun risultato.

---

Fine report. — Vault
