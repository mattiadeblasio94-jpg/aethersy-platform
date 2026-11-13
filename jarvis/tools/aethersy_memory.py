"""Tool Aethersy: memoria costruttiva (vault markdown, stile Obsidian).

Scrive e legge la memoria del tenant sulla piattaforma: ogni voce e' un file
markdown con un percorso nel vault e collegamenti wiki `[[Titolo]]`. Jarvis usa
questo tool per costruire contesto fra una sessione e l'altra, senza reinventare
quello che e' gia' noto.
"""

from __future__ import annotations

import json
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec
from openjarvis.tools.aethersy_client import AethersyError, render, request

WRITE_ACTIONS: dict[str, str] = {
    "create": "/api/platform/memory",
}


@ToolRegistry.register("aethersy_memory")
class AethersyMemoryTool(BaseTool):
    """Legge e scrive la memoria markdown del tenant (vault con wiki link)."""

    tool_id = "aethersy_memory"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name=self.tool_id,
            description=(
                "Memoria costruttiva del tenant: lista, cerca, crea o aggiorna voci "
                "markdown con wiki link [[Titolo]]. Usa 'search' per non rileggere tutto."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["list", "search", "get", "create", "update", "graph", "vault"],
                        "description": "Operazione da eseguire sulla memoria.",
                    },
                    "query": {
                        "type": "string",
                        "description": "Testo da cercare (azioni list/search).",
                    },
                    "id": {
                        "type": "string",
                        "description": "Id della voce (azioni get/update).",
                    },
                    "kind": {
                        "type": "string",
                        "enum": ["fact", "note", "preference", "constraint", "decision", "contact"],
                        "description": "Tipo della voce (azione create/update).",
                    },
                    "title": {"type": "string", "description": "Titolo della voce."},
                    "content": {"type": "string", "description": "Contenuto markdown della voce."},
                    "path": {
                        "type": "string",
                        "description": "Percorso del file nel vault, es. Progetti/Aethersy/launch.md",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Etichette della voce.",
                    },
                    "pinned": {"type": "boolean", "description": "Fissa la voce in cima."},
                    "confirm": {
                        "type": "boolean",
                        "description": "Necessario per creare o modificare (default false = piano).",
                    },
                },
                "required": ["action"],
            },
        )

    def execute(self, **kwargs: Any) -> ToolResult:
        action = str(kwargs.get("action") or "list").strip().lower()
        try:
            if action in {"list", "search"}:
                query = kwargs.get("query")
                path = "/api/platform/memory"
                if query:
                    path += f"?search={str(query).strip()}"
                status, payload = request(path, method="GET")
                if status >= 400:
                    raise AethersyError(f"memoria non leggibile (HTTP {status}): {render(payload)}")
                entries = payload if isinstance(payload, list) else []
                lines = [
                    "- [{kind}] {title} ({path})".format(
                        kind=e.get("kind") or "note",
                        title=e.get("title") or "(senza titolo)",
                        path=e.get("path") or "",
                    )
                    for e in entries
                ]
                return ToolResult(
                    tool_name=self.tool_id,
                    content="\n".join(lines) or "Memoria vuota.",
                    success=True,
                    metadata={"action": action, "count": len(entries)},
                )

            if action == "get":
                memory_id = str(kwargs.get("id") or "").strip()
                if not memory_id:
                    raise AethersyError("action 'get' richiede id")
                status, payload = request("/api/platform/memory/graph", method="GET")
                if status >= 400:
                    raise AethersyError(f"memoria non leggibile (HTTP {status}): {render(payload)}")
                nodes = payload.get("nodes", []) if isinstance(payload, dict) else []
                node = next((n for n in nodes if n.get("id") == memory_id), None)
                if node is None:
                    raise AethersyError(f"voce di memoria non trovata: {memory_id}")
                return ToolResult(tool_name=self.tool_id, content=render(node), success=True)

            if action == "graph":
                status, payload = request("/api/platform/memory/graph", method="GET")
                if status >= 400:
                    raise AethersyError(f"memoria non leggibile (HTTP {status}): {render(payload)}")
                nodes = payload.get("nodes", []) if isinstance(payload, dict) else []
                edges = payload.get("edges", []) if isinstance(payload, dict) else []
                lines = [
                    f"- {n.get('title') or n.get('path')} ({n.get('kind')}, {n.get('path')})"
                    for n in nodes
                ]
                if edges:
                    lines.append("")
                    lines.append("Collegamenti:")
                    for edge in edges:
                        lines.append(f"- {edge.get('label')}")
                return ToolResult(
                    tool_name=self.tool_id,
                    content="\n".join(lines) or "Memoria vuota.",
                    success=True,
                    metadata={"nodes": len(nodes), "edges": len(edges)},
                )

            if action == "vault":
                status, payload = request("/api/platform/memory/vault", method="GET")
                if status >= 400:
                    raise AethersyError(f"vault non leggibile (HTTP {status}): {render(payload)}")
                files = payload.get("files", []) if isinstance(payload, dict) else []
                lines = [f"## {f.get('path')}\n{f.get('content', '')}" for f in files]
                return ToolResult(
                    tool_name=self.tool_id,
                    content="\n\n".join(lines) or "Vault vuoto.",
                    success=True,
                    metadata={"files": len(files)},
                )

            if action in {"create", "update"}:
                if not kwargs.get("confirm"):
                    body = {
                        "kind": kwargs.get("kind") or "note",
                        "title": kwargs.get("title") or "",
                        "content": kwargs.get("content") or "",
                    }
                    if kwargs.get("path"):
                        body["path"] = kwargs["path"]
                    if kwargs.get("tags"):
                        body["tags"] = list(kwargs["tags"])
                    if kwargs.get("pinned") is not None:
                        body["pinned"] = bool(kwargs["pinned"])
                    return ToolResult(
                        tool_name=self.tool_id,
                        content=(
                            "Piano (nessuna scrittura eseguita). "
                            + json.dumps(body, ensure_ascii=False)
                            + "\nRipeti con confirm: true per applicare."
                        ),
                        success=True,
                        metadata={"planned": True},
                    )
                if action == "create":
                    body = {
                        "kind": kwargs.get("kind") or "note",
                        "title": kwargs.get("title") or "",
                        "content": kwargs.get("content") or "",
                        "source": "jarvis",
                    }
                    if kwargs.get("path"):
                        body["path"] = kwargs["path"]
                    if kwargs.get("tags"):
                        body["tags"] = list(kwargs["tags"])
                    if kwargs.get("pinned") is not None:
                        body["pinned"] = bool(kwargs["pinned"])
                    status, payload = request("POST", "/api/platform/memory", body)
                    if status >= 400:
                        raise AethersyError(f"salvataggio fallito (HTTP {status}): {render(payload)}")
                    return ToolResult(
                        tool_name=self.tool_id,
                        content=f"Memoria salvata: {payload.get('path')} ({payload.get('title')})",
                        success=True,
                        metadata={"id": payload.get("id"), "path": payload.get("path")},
                    )
                memory_id = str(kwargs.get("id") or "").strip()
                if not memory_id:
                    raise AethersyError("action 'update' richiede id")
                body = {}
                for key in ("kind", "title", "content", "path"):
                    if kwargs.get(key) is not None:
                        body[key] = kwargs[key]
                if kwargs.get("tags"):
                    body["tags"] = list(kwargs["tags"])
                if kwargs.get("pinned") is not None:
                    body["pinned"] = bool(kwargs["pinned"])
                status, payload = request("PATCH", f"/api/platform/memory/{memory_id}", body)
                if status >= 400:
                    raise AethersyError(f"aggiornamento fallito (HTTP {status}): {render(payload)}")
                return ToolResult(
                    tool_name=self.tool_id,
                    content=f"Memoria aggiornata: {payload.get('path')}",
                    success=True,
                    metadata={"id": payload.get("id")},
                )

            raise AethersyError(f"azione non supportata: {action}")
        except AethersyError as err:
            return ToolResult(tool_name=self.tool_id, content=str(err), success=False)
        except Exception as err:  # pragma: no cover - rete/JSON inattesi
            return ToolResult(tool_name=self.tool_id, content=f"Errore: {err}", success=False)
