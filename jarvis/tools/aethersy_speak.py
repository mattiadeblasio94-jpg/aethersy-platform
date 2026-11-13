"""Tool Aethersy: sintesi vocale italiana tramite il provider gia' impostato (Venice)."""

from __future__ import annotations

import base64
import os
import tempfile
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec
from openjarvis.tools.aethersy_client import AethersyError, render, request

DEFAULT_VOICE = "af_sky"
DEFAULT_LANGUAGE = "it"


@ToolRegistry.register("aethersy_speak")
class AethersySpeakTool(BaseTool):
    """Trasforma un testo in audio e lo riproduce sul PC."""

    tool_id = "aethersy_speak"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="aethersy_speak",
            description=(
                "Legge ad alta voce un testo usando la sintesi vocale della piattaforma"
                " (provider gia' configurato) e riproduce l'audio sul computer."
                " Usalo per le risposte vocali quando l'utente ha chiesto di parlare."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Testo da pronunciare (massimo 4000 caratteri).",
                    },
                    "voice": {
                        "type": "string",
                        "description": f"Voce (default {DEFAULT_VOICE}).",
                    },
                    "language": {
                        "type": "string",
                        "description": f"Codice lingua (default {DEFAULT_LANGUAGE}).",
                    },
                    "play": {
                        "type": "boolean",
                        "description": "Riproduce l'audio (default true).",
                    },
                },
                "required": ["text"],
            },
            category="network",
            latency_estimate=4.0,
            timeout_seconds=120.0,
            required_capabilities=["network:fetch"],
        )

    def execute(self, **params: Any) -> ToolResult:
        text = str(params.get("text") or "").strip()
        voice = str(params.get("voice") or os.getenv("AETHERSY_TTS_VOICE") or DEFAULT_VOICE)
        language = str(params.get("language") or os.getenv("AETHERSY_TTS_LANGUAGE") or DEFAULT_LANGUAGE)
        play = params.get("play")
        should_play = True if play is None else bool(play)

        if not text:
            return ToolResult(
                tool_name=self.tool_id,
                content="Il parametro 'text' e' obbligatorio.",
                success=False,
            )
        if len(text) > 4000:
            text = text[:4000]

        try:
            status, body = request(
                "/api/ai/generate",
                method="POST",
                body={
                    "capability": "tts",
                    "input": text,
                    "voice": voice,
                    "language": language,
                    "responseFormat": "wav",
                },
                timeout=120.0,
            )
        except AethersyError as exc:
            return ToolResult(
                tool_name=self.tool_id, content=f"Errore sintesi vocale: {exc}", success=False
            )

        if not (200 <= status < 300):
            return ToolResult(
                tool_name=self.tool_id,
                content=f"Sintesi vocale fallita (HTTP {status}): {render(body, 600)}",
                success=False,
            )

        audio = body.get("audio") if isinstance(body, dict) else None
        if not audio:
            return ToolResult(
                tool_name=self.tool_id,
                content=f"Risposta senza audio: {render(body, 600)}",
                success=False,
            )

        try:
            raw = base64.b64decode(audio)
        except (ValueError, TypeError) as exc:
            return ToolResult(
                tool_name=self.tool_id,
                content=f"Audio non decodificabile: {exc}",
                success=False,
            )

        fmt = str(body.get("format") or "wav")
        path = os.path.join(tempfile.gettempdir(), f"aethersy-jarvis-{abs(hash(text)) % 100000}.{fmt}")
        with open(path, "wb") as handle:
            handle.write(raw)

        played = "non riprodotto"
        if should_play:
            played = self._play(path)
        return ToolResult(
            tool_name=self.tool_id,
            content=(
                f"Audio pronto ({len(raw)} byte, voce {voice}, lingua {language}): {path}. {played}"
            ),
            success=True,
            metadata={"path": path, "voice": voice, "language": language, "bytes": len(raw)},
        )

    @staticmethod
    def _play(path: str) -> str:
        try:
            import numpy as np
            import soundfile as sf
            import sounddevice as sd

            data, samplerate = sf.read(path, dtype="float32")
            sd.play(np.asarray(data), samplerate)
            sd.wait()
            return "riprodotto."
        except Exception as exc:  # noqa: BLE001
            return f"riproduzione non disponibile ({exc})."
