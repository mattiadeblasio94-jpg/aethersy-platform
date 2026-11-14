"""Tool Aethersy: delega a opencode l'implementazione dei cambiamenti richiesti."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

# Repository della piattaforma: sul VPS e' il mount /opt/aethersy-infra.
DEFAULT_REPO = "/opt/aethersy-infra"
MAX_OUTPUT_CHARS = 4000
DEFAULT_TIMEOUT = 1800


@ToolRegistry.register("aethersy_change")
class AethersyChangeTool(BaseTool):
    """Chiede a opencode di applicare un cambiamento al repository della piattaforma."""

    tool_id = "aethersy_change"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="aethersy_change",
            description=(
                "Applica un cambiamento alla piattaforma Aethersy delegando il lavoro a"
                " opencode (agente di sviluppo con accesso al repository, ai test e al"
                " deploy). Usalo per richieste di codice, contenuti, documentazione,"
                " configurazione o deploy. Prima mostra il piano all'utente (confirm=false),"
                " poi esegui con confirm=true. Non usare questo tool per cancellare dati"
                " o risorse del tenant: niente viene rimosso senza conferma."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "instruction": {
                        "type": "string",
                        "description": (
                            "Istruzione completa per opencode, in italiano, con il contesto"
                            " necessario (cosa cambia, dove, come verificare)."
                        ),
                    },
                    "confirm": {
                        "type": "boolean",
                        "description": (
                            "Conferma esplicita: prima mostra il piano all'utente, poi"
                            " ripeti con confirm=true per applicare il cambiamento."
                        ),
                    },
                    "timeout": {
                        "type": "integer",
                        "description": f"Timeout in secondi (default {DEFAULT_TIMEOUT}).",
                    },
                },
                "required": ["instruction"],
            },
            category="system",
            latency_estimate=60.0,
            timeout_seconds=float(DEFAULT_TIMEOUT) + 60.0,
            required_capabilities=["network:fetch"],
        )

    def execute(self, **params: Any) -> ToolResult:
        instruction = str(params.get("instruction") or "").strip()
        confirm = bool(params.get("confirm"))
        timeout = int(params.get("timeout") or DEFAULT_TIMEOUT)

        if not instruction:
            return ToolResult(
                tool_name=self.tool_id,
                content="Il parametro 'instruction' e' obbligatorio.",
                success=False,
            )

        repo = os.getenv("AETHERSY_REPO", DEFAULT_REPO)
        if not os.path.isdir(repo):
            return ToolResult(
                tool_name=self.tool_id,
                content=f"Repository Aethersy non trovato in '{repo}'.",
                success=False,
            )

        binary = shutil.which("opencode") or shutil.which("opencode.cmd")
        if not binary:
            return ToolResult(
                tool_name=self.tool_id,
                content="Eseguibile 'opencode' non trovato nel PATH.",
                success=False,
            )

        command = [
            binary,
            "run",
            instruction,
            "--dir",
            repo,
            "--auto",
            "--format",
            "default",
        ]

        if not confirm:
            return ToolResult(
                tool_name=self.tool_id,
                content=(
                    "Piano (nessuna esecuzione senza confirm=true):\n"
                    f"opencode run \"{instruction}\"\n"
                    f"in {repo}\n"
                    "Chiedi conferma all'utente e ripeti con confirm=true."
                ),
                success=False,
            )

        try:
            completed = subprocess.run(  # noqa: S603
                command,
                cwd=repo,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                tool_name=self.tool_id,
                content=f"opencode ha superato il timeout di {timeout}s.",
                success=False,
            )

        output = (completed.stdout or "") + (("\n[stderr]\n" + completed.stderr) if completed.stderr else "")
        if len(output) > MAX_OUTPUT_CHARS:
            output = output[-MAX_OUTPUT_CHARS:]
        ok = completed.returncode == 0
        return ToolResult(
            tool_name=self.tool_id,
            content=(
                f"opencode terminato con codice {completed.returncode}.\n{output.strip()}"
                if output.strip()
                else f"opencode terminato con codice {completed.returncode} (nessun output)."
            ),
            success=ok,
            metadata={"returncode": completed.returncode, "repo": repo},
        )
