"""Client HTTP condiviso per la piattaforma Aethersy (console BFF)."""

from __future__ import annotations

import os
import threading
import time
from typing import Any

import httpx

DEFAULT_BASE = "https://platform.aethersy.online"
DEFAULT_TIMEOUT = 45.0
MAX_OUTPUT_CHARS = 4000

_lock = threading.Lock()
_cookie: str | None = None
_cookie_expires_at: float = 0.0


class AethersyError(Exception):
    """Errore di comunicazione o di autorizzazione verso la piattaforma."""


def base_url() -> str:
    return os.getenv("AETHERSY_API_BASE", DEFAULT_BASE).rstrip("/")


def _api_key() -> str:
    return os.getenv("AETHERSY_API_KEY", "").strip()


def _credentials() -> tuple[str, str]:
    email = os.getenv("AETHERSY_EMAIL", "").strip()
    password = os.getenv("AETHERSY_PASSWORD", "")
    if not email or not password:
        raise AethersyError(
            "Credenziali Aethersy mancanti: imposta AETHERSY_EMAIL e AETHERSY_PASSWORD"
            " (oppure AETHERSY_API_KEY per l'autenticazione Bearer)."
        )
    return email, password


def _login(client: httpx.Client) -> str:
    email, password = _credentials()
    response = client.post(
        f"{base_url()}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30.0,
    )
    if response.status_code != 200:
        raise AethersyError(
            f"Login Aethersy fallito (HTTP {response.status_code}): {response.text[:200]}"
        )
    cookies = [f"{cookie.name}={cookie.value}" for cookie in response.cookies.jar]
    if not cookies:
        raise AethersyError("Login Aethersy riuscito ma nessun cookie di sessione ricevuto")
    return "; ".join(cookies)


def _auth_headers(client: httpx.Client) -> dict[str, str]:
    global _cookie, _cookie_expires_at
    api_key = _api_key()
    if api_key:
        return {"Authorization": f"Bearer {api_key}"}
    with _lock:
        if _cookie is None or time.time() >= _cookie_expires_at:
            _cookie = _login(client)
            _cookie_expires_at = time.time() + 3600
        return {"Cookie": _cookie}


def request(
    path: str,
    method: str = "GET",
    body: Any = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> tuple[int, Any]:
    """Esegue una richiesta autenticata verso la piattaforma.

    Restituisce (status_http, corpo_json). Non solleva eccezioni sugli errori
    HTTP: il chiamante decide come riportarli all'agente.
    """
    url = path if path.startswith("http") else f"{base_url()}{path}"
    headers = {"Accept": "application/json"}
    with httpx.Client(follow_redirects=True, timeout=timeout) as client:
        headers.update(_auth_headers(client))
        try:
            response = client.request(method.upper(), url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            raise AethersyError(f"Chiamata a {url} fallita: {exc}") from exc
    payload: Any
    try:
        payload = response.json()
    except ValueError:
        payload = {"raw": response.text[:MAX_OUTPUT_CHARS]}
    return response.status_code, payload


def render(payload: Any, limit: int = MAX_OUTPUT_CHARS) -> str:
    """Serializza il payload in testo compatto e troncato."""
    import json

    if isinstance(payload, (dict, list)):
        text = json.dumps(payload, ensure_ascii=False, indent=2)
    else:
        text = str(payload)
    if len(text) > limit:
        text = text[:limit] + f"\n... [troncati {len(text) - limit} caratteri]"
    return text
