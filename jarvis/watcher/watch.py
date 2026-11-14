"""Watcher di Jarvis: l'assistente che vigila la piattaforma e parla per primo.

Jarvis non deve aspettare istruzioni: questo processo osserva continuamente
la piattaforma (lead, ordini, run, obiettivi, saldi, salute dei servizi) e
invia al BFF gli eventi che meritano attenzione. La pagina /jarvis li
riceve in streaming (SSE) e li annuncia anche a voce.

Dipendenze: solo stdlib (il container usa python slim senza pacchetti extra).

Variabili d'ambiente:
  AETHERSY_API_BASE   base URL della piattaforma (default https://platform.aethersy.online)
  AETHERSY_EMAIL      account di servizio (jarvis@aethersy.online)
  AETHERSY_PASSWORD   password dell'account di servizio
  JARVIS_EVENTS_URL   URL di ingestione degli eventi (default <base>/api/platform/jarvis/events)
  JARVIS_EVENTS_TOKEN token condiviso col BFF
  WATCH_INTERVAL_SEC  intervallo fra due controlli (default 120)
  WATCH_STATE_FILE    file di stato (snapshot precedente)
  WATCH_DIGEST_EVERY  ogni quanti cicli inviare un digest "tutto regolare" (default 30)
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

BASE = os.getenv("AETHERSY_API_BASE", "https://platform.aethersy.online").rstrip("/")
EMAIL = os.getenv("AETHERSY_EMAIL", "").strip()
PASSWORD = os.getenv("AETHERSY_PASSWORD", "")
EVENTS_URL = os.getenv("JARVIS_EVENTS_URL", f"{BASE}/api/platform/jarvis/events")
EVENTS_TOKEN = os.getenv("JARVIS_EVENTS_TOKEN", "")
INTERVAL = max(30, int(os.getenv("WATCH_INTERVAL_SEC", "120")))
STATE_FILE = os.getenv("WATCH_STATE_FILE", "/var/lib/openjarvis/watcher-state.json")
DIGEST_EVERY = max(1, int(os.getenv("WATCH_DIGEST_EVERY", "30")))
LOW_BALANCE = float(os.getenv("WATCH_LOW_BALANCE", "10"))
JARVIS_HEALTH_URL = os.getenv("JARVIS_HEALTH_URL", "https://jarvis.aethersy.online/v1/speech/health")

CTX = ssl.create_default_context()


def log(message: str) -> None:
    print(f"[watcher {time.strftime('%H:%M:%S')}] {message}", flush=True)


class Session:
    """Sessione HTTP con login piattaforma e cookie riutilizzati."""

    def __init__(self) -> None:
        self.cookie = ""

    def request(
        self,
        url: str,
        *,
        method: str = "GET",
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 45.0,
    ) -> tuple[int, Any]:
        data = None
        hdrs = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode()
            hdrs["Content-Type"] = "application/json"
        if self.cookie:
            hdrs["Cookie"] = self.cookie
        if headers:
            hdrs.update(headers)
        req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as res:
                raw = res.read()
                payload: Any
                try:
                    payload = json.loads(raw.decode("utf-8", "replace"))
                except Exception:
                    payload = raw.decode("utf-8", "replace")[:500]
                # Il BFF invia due Set-Cookie (quello di reset e quello di
                # sessione): va tenuto quello con valore non vuoto.
                raw_cookies = res.headers.get_all("Set-Cookie") or []
                pairs = []
                for raw in raw_cookies:
                    first = raw.split(";")[0].strip()
                    if "=" not in first:
                        continue
                    name, _, value = first.partition("=")
                    if value:
                        pairs.append(f"{name}={value}")
                if pairs:
                    self.cookie = "; ".join(pairs)
                return res.status, payload
        except urllib.error.HTTPError as err:
            raw = err.read().decode("utf-8", "replace")
            try:
                return err.code, json.loads(raw)
            except Exception:
                return err.code, raw[:300]
        except Exception as err:  # rete assente, timeout, DNS
            return 0, str(err)

    def login(self) -> bool:
        status, _ = self.request(
            f"{BASE}/api/auth/login",
            method="POST",
            body={"email": EMAIL, "password": PASSWORD},
        )
        if status == 200 and self.cookie:
            return True
        log(f"login fallito (HTTP {status}): credenziali del watcher non valide")
        return False

    def get(self, path: str) -> Any:
        status, payload = self.request(f"{BASE}{path}")
        if status != 200:
            return None
        return payload


def emit(
    session: Session,
    *,
    kind: str,
    severity: str,
    title: str,
    message: str = "",
    meta: dict[str, Any] | None = None,
) -> None:
    """Invia un evento proattivo al BFF (token + sessione del tenant)."""
    if not EVENTS_TOKEN:
        log("JARVIS_EVENTS_TOKEN assente: evento non inviato")
        return
    status, payload = session.request(
        EVENTS_URL,
        method="POST",
        body={
            "kind": kind,
            "severity": severity,
            "title": title,
            "message": message,
            "source": "watcher",
            "meta": meta or {},
        },
        headers={"x-jarvis-token": EVENTS_TOKEN},
    )
    if status in (200, 201):
        log(f"evento inviato: {title}")
    else:
        log(f"invio evento fallito (HTTP {status}): {str(payload)[:200]}")


def load_state() -> dict[str, Any]:
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}


def save_state(state: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        tmp = f"{STATE_FILE}.tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, sort_keys=True)
        os.replace(tmp, STATE_FILE)
    except Exception as err:
        log(f"salvataggio stato fallito: {err}")


def count_items(payload: Any, *keys: str) -> int:
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                return len(value)
            if isinstance(value, dict):
                nested = count_items(value, *keys)
                if nested:
                    return nested
    return 0


def ids_of(payload: Any, *keys: str) -> list[str]:
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                out: list[str] = []
                for item in value:
                    if isinstance(item, dict):
                        ident = item.get("id") or item.get("email") or item.get("name") or item.get("title")
                        if ident:
                            out.append(str(ident))
                return out
    return []


def poll(session: Session) -> dict[str, Any]:
    """Raccoglie lo stato corrente della piattaforma."""
    snapshot: dict[str, Any] = {}
    snapshot["leads"] = count_items(session.get("/api/pipeline/leads"), "leads", "items", "data")
    snapshot["lead_ids"] = ids_of(session.get("/api/pipeline/leads"), "leads", "items", "data")
    snapshot["runs"] = count_items(session.get("/api/pipeline/runs"), "runs", "items", "data")
    snapshot["goals"] = session.get("/api/platform/goals") or []
    snapshot["balance"] = session.get("/api/ai/balance") or {}
    snapshot["wix"] = session.get("/api/platform/wix/business") or {}
    snapshot["health"] = session.get("/api/health") or {}
    return snapshot


def diff_and_report(
    session: Session,
    state: dict[str, Any],
    previous: dict[str, Any],
    current: dict[str, Any],
) -> None:
    # Lead nuovi: il contatto e' la notizia che conta per un'impresa.
    old_leads = set(previous.get("lead_ids") or [])
    new_leads = [lead for lead in current.get("lead_ids") or [] if lead not in old_leads]
    if new_leads and previous:
        emit(
            session,
            kind="notice",
            severity="info",
            title=f"Nuovo lead da contattare ({len(new_leads)})",
            message="La piattaforma ha rilevato un contatto nuovo. Apri la sezione Lead per i dettagli.",
            meta={"lead_ids": new_leads},
        )

    # Ordini Wix: evento ad alta rilevanza.
    wix = current.get("wix") if isinstance(current.get("wix"), dict) else {}
    old_wix = previous.get("wix") if isinstance(previous.get("wix"), dict) else {}
    orders = count_items(wix, "orders", "items", "data")
    old_orders = count_items(old_wix, "orders", "items", "data")
    if previous and orders > old_orders:
        emit(
            session,
            kind="notice",
            severity="info",
            title=f"Nuovo ordine ricevuto ({orders - old_orders})",
            message="Il negozio ha registrato un ordine in piu'. I dettagli sono nel pannello Wix.",
            meta={"orders": orders},
        )

    # Saldo crediti in esaurimento: Jarvis avvisa prima del blocco.
    balance = current.get("balance") if isinstance(current.get("balance"), dict) else {}
    credits = balance.get("balance") or balance.get("available") or balance.get("credits")
    try:
        value = float(credits)
    except (TypeError, ValueError):
        value = None
    if value is not None and value <= LOW_BALANCE:
        emit_once(
            session,
            state,
            "low_balance",
            kind="alert",
            severity="warning",
            title="Crediti AI in esaurimento",
            message=f"Restano {value:g} crediti: conviene ricaricare prima che i servizi si fermino.",
            meta={"balance": value},
        )

    # Salute della piattaforma.
    health = current.get("health") if isinstance(current.get("health"), dict) else {}
    if health and str(health.get("status", "")).lower() not in ("ok", "healthy", ""):
        emit(
            session,
            kind="alert",
            severity="critical",
            title="Piattaforma non sana",
            message=f"Il BFF risponde {health.get('status')}: controllo i servizi.",
            meta={"health": health},
        )


def check_jarvis_health() -> bool:
    """Il BFF di Jarvis richiede il token: senza, /health risponde 401."""
    token = os.getenv("OPENJARVIS_API_KEY", "").strip()
    request = urllib.request.Request(JARVIS_HEALTH_URL)
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=20, context=CTX) as res:
            return res.status == 200
    except Exception:
        return False


def emit_once(
    session: Session,
    state: dict[str, Any],
    latch: str,
    *,
    kind: str,
    severity: str,
    title: str,
    message: str = "",
    meta: dict[str, Any] | None = None,
) -> None:
    """Invia un evento solo se la condizione e' cambiata (niente spam)."""
    alerts = state.setdefault("alerts", {})
    if alerts.get(latch):
        return
    alerts[latch] = True
    emit(session, kind=kind, severity=severity, title=title, message=message, meta=meta)


def clear_latch(state: dict[str, Any], latch: str) -> None:
    alerts = state.get("alerts")
    if isinstance(alerts, dict):
        alerts.pop(latch, None)


def main() -> int:
    if not EMAIL or not PASSWORD:
        log("AETHERSY_EMAIL/AETHERSY_PASSWORD mancanti: watcher fermo")
        return 2
    session = Session()
    if not session.login():
        time.sleep(30)
        if not session.login():
            return 1

    state = load_state()
    cycles = int(state.get("cycles") or 0)
    log(f"watcher attivo ogni {INTERVAL}s verso {BASE}")

    while True:
        try:
            if not session.cookie or not session.login():
                time.sleep(30)
                continue
            current = poll(session)
            if state.get("snapshot"):
                diff_and_report(session, state, state.get("snapshot") or {}, current)
            if not check_jarvis_health():
                emit_once(
                    session,
                    state,
                    "jarvis_down",
                    kind="alert",
                    severity="critical",
                    title="Jarvis non raggiungibile",
                    message="Il servizio vocale non risponde: la voce e' sospesa finche' non torna.",
                )
            else:
                clear_latch(state, "jarvis_down")
            cycles += 1
            if cycles % DIGEST_EVERY == 0:
                emit(
                    session,
                    kind="insight",
                    severity="info",
                    title="Controllo di routine completato",
                    message="Nessuna novita' critica: lead, ordini, run e saldi sono sotto controllo.",
                    meta={"cycles": cycles},
                )
            state = {
                "snapshot": current,
                "cycles": cycles,
                "alerts": state.get("alerts") or {},
                "updated_at": time.time(),
            }
            save_state(state)
        except Exception as err:
            log(f"errore nel ciclo: {err}")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    sys.exit(main())
