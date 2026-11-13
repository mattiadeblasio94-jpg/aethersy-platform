---
name: self-hosted-backend
description: Progetta e realizza il backend dati self-hosted di un'app (Postgres su VPS, schema per progetto, RLS, client drop-in) senza lock-in e senza cambiare i provider AI gia' configurati
license: Apache-2.0
metadata:
  openjarvis:
    version: "1.0.0"
    author: aethersy
    tags: [backend, postgres, self-hosted, rls, sdk, deploy]
---

# Backend dati self-hosted

Quando l'utente chiede "fammi un'app", "collegala a una tabella", "migrami il
backend", questa skill descrive il modo *professionale* di farlo in Aethersy:
tutto self-hosted, dentro l'infrastruttura che gia' esiste, senza introdurre
servizi esterni e senza toccare i provider AI gia' configurati.

## Principi

1. **Niente lock-in, niente servizi nuovi.** Il backend e' Postgres sul VPS
   Aruba (schema `business`/`pipeline` per la piattaforma, schema dedicato per
   ogni progetto cliente). Nessun "database as a service" esterno.
2. **I provider AI non cambiano.** Si continua a usare OpenRouter, NVIDIA,
   z.ai, Venice, fal.ai e Replicate cosi' come sono configurati. Il backend
   dati e' indipendente dal modello.
3. **Progetto = schema isolato.** Uno schema per progetto, tabelle con UUID,
   colonne `created_at`/`updated_at`, indice sulle chiavi usate.
4. **Isolamento per utente.** Ogni tabella "riga" porta `tenant_id` (e
   `user_email` quando serve attribuirla a una persona). Le query passano
   sempre dal tenant risolto dal BFF, mai da un parametro libero del client.
5. **Accesso via API della piattaforma.** Il browser non parla mai col
   Postgres: chiama il BFF (`/api/platform/...`), che autentica, valida e
   applica il tenant.

## Flusso standard

1. **Ascolta e schematizza.** Dall'intento ("app per gestire i clienti")
   ricava entita', campi e vincoli. Se un campo non e' chiaro, chiedi: non
   inventare schemi.
2. **Proponi il piano.** Elenco tabelle, campi, indici e regole di accesso.
   Mostra il piano all'utente e attendi conferma.
3. **Realizza.** Crea lo schema e le tabelle, le policy di accesso e gli
   endpoint BFF necessari; mantieni lo stile del repository (TypeScript,
   `console/server/src/...`, validazione con zod come nel resto del progetto).
4. **Genera il client.** Un modulo drop-in lato browser/server che parla con
   il BFF, con i tipi derivati dallo schema. Il client non contiene segreti:
   usa la sessione (cookie) o una chiave API del tenant.
5. **Verifica e deploy.** Testa gli endpoint (crea/lista/aggiorna), poi
   deploya con `bash scripts/deploy-stack.sh "console platform" "<nota>"` e
   aggiorna `docs/phases.md`.

## Regole di sicurezza (non negoziabili)

- Mai SQL costruito concatenando input del modello: usa identificatori
  validati (regex `^[a-z_][a-z0-9_]*$`) e parametri per i valori.
- Mai segreti nel repository: le chiavi stanno in `.env` / nel vault.
- Nessuna cancellazione di dati senza conferma esplicita: prima l'archivio,
  poi la rimozione definitiva.
- Il modello non esegue codice del tenant: l'agente di codice lavora in una
  sandbox (immagine `aethersy/builder-sandbox`) e il deploy passa dallo script
  del repository.

## Esempi

- "Fammi un'app per gestire le ferie del team" → piano con tabella
  `vacanza` (dipendente, data, tipo, stato), poi implementazione, client e
  deploy.
- "Collega il mio form a Supabase" → spiega che in Aethersy il backend e'
  Postgres self-hosted su VPS: crea schema del progetto, tabella del form e
  endpoint di inserimento con attribuzione al tenant.
- "Migra i dati dal foglio Excel" → importa in tabella del progetto con
  `tenant_id`, verifica conteggi e lascia il file sorgente intatto.
