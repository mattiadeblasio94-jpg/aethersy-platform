# restore.md — Procedura di ripristino

> **Stato: NON ANCORA TESTATA.** La procedura va eseguita almeno una volta su un
> database temporaneo e la data del test va annotata in fondo, prima di
> considerare il backup affidabile (`BLOCKED: input #1` — serve il VPS).

## 0. Prerequisiti

- Stack fermo o attivo, ma **nessuna scrittura** in corso durante il ripristino.
- File di dump disponibile: `backups/daily/postgres-<stamp>.sql.gz`
  (eventualmente copiato da storage esterno).
- Accesso a `docker compose` come `deploy`.

Variabili usate dallo script di backup:

```bash
AP_POSTGRES_USERNAME   # es. postgres
AP_POSTGRES_DATABASE   # es. activepieces
```

## 1. Verifica integrità del dump

```bash
cd ~/aethersy-infra
DUMP=backups/daily/postgres-<stamp>.sql.gz

ls -lh "$DUMP"
gzip -t "$DUMP" && echo "gzip OK"
zcat "$DUMP" | head -n 20          # deve mostrare header pg_dump
zcat "$DUMP" | grep -c 'CREATE TABLE'   # atteso > 0
```

Se `gzip -t` fallisce o non ci sono `CREATE TABLE`, il dump è inutilizzabile: **non** proseguire.

## 2. Test di restore su database temporaneo (procedura consigliata)

Non tocca i dati di produzione: usa un database separato nello stesso Postgres.

```bash
# 1. Crea un DB di test
docker compose exec -T postgres \
  psql -U "$AP_POSTGRES_USERNAME" -c 'CREATE DATABASE activepieces_restore_test;'

# 2. Ripristina il dump nel DB di test
zcat "$DUMP" | docker compose exec -T postgres \
  psql -U "$AP_POSTGRES_USERNAME" -d activepieces_restore_test

# 3. Controlla che le tabelle siano popolate
docker compose exec -T postgres \
  psql -U "$AP_POSTGRES_USERNAME" -d activepieces_restore_test \
  -c '\dt' \
  -c 'SELECT count(*) AS utenti FROM "user";' \
  -c 'SELECT count(*) AS flow FROM flow;'

# 4. Pulizia
docker compose exec -T postgres \
  psql -U "$AP_POSTGRES_USERNAME" -c 'DROP DATABASE activepieces_restore_test;'
```

Atteso: `\dt` elenca le tabelle e i `count(*)` restituiscono valori plausibili (> 0 se in produzione ci sono dati).

## 3. Restore in produzione (sovrascrittura)

> Distruttivo: sostituisce i dati correnti. Eseguire solo con conferma esplicita.

```bash
cd ~/aethersy-infra
DUMP=backups/daily/postgres-<stamp>.sql.gz

# 1. Backup di sicurezza dello stato attuale (nel caso il restore peggiori le cose)
./scripts/backup.sh

# 2. Ferma app e worker (niente connessioni durante il restore)
docker compose stop app worker

# 3. Ricrea il database di produzione
docker compose exec -T postgres \
  psql -U "$AP_POSTGRES_USERNAME" -c 'DROP DATABASE IF EXISTS activepieces WITH (FORCE);'
docker compose exec -T postgres \
  psql -U "$AP_POSTGRES_USERNAME" -c 'CREATE DATABASE activepieces;'

# 4. Ripristina
zcat "$DUMP" | docker compose exec -T postgres \
  psql -U "$AP_POSTGRES_USERNAME" -d activepieces

# 5. Riavvia e verifica
docker compose up -d
./scripts/04-smoke-test.sh
```

## 4. Ripristino del volume Redis

Redis contiene le code (job pending/attivi). Il dump Redis è secondario: il peggio che può capitare è perdere i job in coda, non i dati dei flow.

```bash
cd ~/aethersy-infra
TAR=backups/daily/redis-<stamp>.tar.gz

docker compose stop redis
docker run --rm \
  -v aethersy_redis_data:/data \
  -v "$(pwd)/backups/daily":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$TAR") -C /data"
docker compose up -d redis
```

## 5. Dopo il ripristino

- Verificare i segreti: il DB ripristinato contiene le connessioni cifrate con `AP_ENCRYPTION_KEY`. Se la chiave in `.env` **non** è quella originale, le connessioni non si decifrano → ripristinare la chiave corretta o re-inserire le credenziali dei flow.
- Verificare `AP_JWT_SECRET`: se cambiato, gli utenti devono ri-autenticarsi (non è un errore).
- Eseguire un flow di test AI (provider OpenRouter, o Venice se con credito) e controllare che vada verde.

## 6. Log dei test

| Data | Dump usato | Esito | Note |
|---|---|---|---|
| _(da compilare)_ | | | |

> Non dichiarare il backup "affidabile" finché questa tabella non ha almeno una riga con esito positivo.
