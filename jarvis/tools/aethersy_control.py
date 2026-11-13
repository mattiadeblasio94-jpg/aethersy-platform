"""Tool Aethersy: legge e scrive sulla piattaforma (console BFF)."""

from __future__ import annotations

import json
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec
from openjarvis.tools.aethersy_client import AethersyError, render, request

READ_ACTIONS: dict[str, str] = {
    "overview": "/api/platform/overview",
    "business_summary": "/api/platform/business/summary",
    "products": "/api/platform/products",
    "goals": "/api/platform/goals",
    "notifications": "/api/platform/notifications",
    "sites": "/api/platform/sites",
    "agents": "/api/ap/agents",
    "wix_status": "/api/platform/wix",
    "wix_sites": "/api/platform/wix/sites",
    "wix_business": "/api/platform/wix/business",
}

WRITE_ACTIONS: dict[str, str] = {
    "create_wix_product": "/api/platform/wix/products",
    "create_goal": "/api/platform/goals",
}

ACTION_HELP = ", ".join(sorted(READ_ACTIONS) + sorted(WRITE_ACTIONS) + ["publish_site"])


@ToolRegistry.register("aethersy_control")
class AethersyControlTool(BaseTool):
    """Legge o modifica i dati della piattaforma Aethersy."""

    tool_id = "aethersy_control"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="aethersy_control",
            description=(
                "Legge o scrive sulla piattaforma Aethersy (console BFF)."
                " Azioni di lettura: "
                + ", ".join(sorted(READ_ACTIONS))
                + ". Azioni di scrittura (richiedono confirm=true): "
                + ", ".join(sorted(WRITE_ACTIONS))
                + ", publish_site (richiede run_id)."
                " Non cancellare nulla senza conferma esplicita dell'utente."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": f"Azione da eseguire. Valori: {ACTION_HELP}.",
                    },
                    "payload": {
                        "type": "object",
                        "description": (
                            "Corpo JSON per le azioni di scrittura (es. name, price, currency"
                            " per create_wix_product; title per create_goal)."
                        ),
                    },
                    "run_id": {
                        "type": "string",
                        "description": "Identificativo del sito da pubblicare (publish_site).",
                    },
                    "confirm": {
                        "type": "boolean",
                        "description": (
                            "Conferma esplicita per le azioni di scrittura. Prima di confermare,"
                            " mostra all'utente cosa verrà fatto."
                        ),
                    },
                },
                "required": ["action"],
            },
            category="network",
            latency_estimate=2.0,
            timeout_seconds=90.0,
            required_capabilities=["network:fetch"],
        )

    def execute(self, **params: Any) -> ToolResult:
        action = str(params.get("action") or "").strip()
        payload = params.get("payload")
        run_id = str(params.get("run_id") or "").strip()
        confirm = bool(params.get("confirm"))

        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except ValueError as exc:
                return ToolResult(
                    tool_name=self.tool_id,
                    content=f"payload non e' JSON valido: {exc}",
                    success=False,
                )

        try:
            if action in READ_ACTIONS:
                status, body = request(READ_ACTIONS[action])
            elif action in WRITE_ACTIONS:
                if not confirm:
                    return ToolResult(
                        tool_name=self.tool_id,
                        content=(
                            f"Azione '{action}' non eseguita: serve confirm=true."
                            f" Chiedi conferma all'utente e ripeti. Payload: {render(payload, 800)}"
                        ),
                        success=False,
                    )
                status, body = request(
                    WRITE_ACTIONS[action], method="POST", body=payload or {}
                )
            elif action == "publish_site":
                if not run_id:
                    return ToolResult(
                        tool_name=self.tool_id,
                        content="publish_site richiede il parametro run_id.",
                        success=False,
                    )
                if not confirm:
                    return ToolResult(
                        tool_name=self.tool_id,
                        content=(
                            f"Pubblicazione del sito '{run_id}' non eseguita: serve confirm=true."
                            " Chiedi conferma all'utente e ripeti."
                        ),
                        success=False,
                    )
                status, body = request(f"/api/platform/sites/{run_id}/publish", method="POST")
            else:
                return ToolResult(
                    tool_name=self.tool_id,
                    content=f"Azione sconosciuta '{action}'. Valori ammessi: {ACTION_HELP}.",
                    success=False,
                )
        except AethersyError as exc:
            return ToolResult(
                tool_name=self.tool_id, content=f"Errore piattaforma: {exc}", success=False
            )

        ok = 200 <= status < 300
        return ToolResult(
            tool_name=self.tool_id,
            content=f"HTTP {status}\n{render(body)}",
            success=ok,
            metadata={"action": action, "status": status},
        )
