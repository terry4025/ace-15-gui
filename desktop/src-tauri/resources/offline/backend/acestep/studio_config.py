from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field


BindMode = Literal["local", "lan"]
Language = Literal["ko", "en"]
DownloadSource = Literal["auto", "huggingface", "modelscope"]
LMBackend = Literal["pt", "vllm"]


def _default_config_dir() -> Path:
    override = os.getenv("ACESTEP_STUDIO_CONFIG_DIR", "").strip()
    if override:
        return Path(override)
    if os.name == "nt":
        appdata = os.getenv("APPDATA", "").strip()
        if appdata:
            return Path(appdata) / "ACE-Step Studio"
        return Path.home() / "AppData" / "Roaming" / "ACE-Step Studio"
    # Linux/macOS fallback
    xdg = os.getenv("XDG_CONFIG_HOME", "").strip()
    if xdg:
        return Path(xdg) / "ace-step-studio"
    return Path.home() / ".config" / "ace-step-studio"


def default_output_dir() -> str:
    override = os.getenv("ACESTEP_STUDIO_OUTPUT_DIR", "").strip()
    if override:
        return override
    # Windows: ~/Music/ACE-Step Studio
    return str(Path.home() / "Music" / "ACE-Step Studio")


def default_config_path() -> str:
    return str(_default_config_dir() / "config.json")


class StudioConfig(BaseModel):
    version: int = Field(default=1)
    output_dir: str = Field(default_factory=default_output_dir)
    bind_mode: BindMode = Field(default="local")
    api_key: str = Field(default="")
    dit_model: str = Field(default="acestep-v15-turbo")
    lm_model: str = Field(default="acestep-5Hz-lm-4B")
    lm_backend: LMBackend = Field(default="pt")  # Windows-friendly default
    download_source: DownloadSource = Field(default="auto")
    language: Language = Field(default="ko")

    @classmethod
    def load(cls, path: str) -> "StudioConfig":
        p = Path(path)
        if not p.exists():
            return cls()
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                return cls()
            return cls(**raw)
        except Exception:
            return cls()

    def save(self, path: str) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(self.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_dirs(cfg: StudioConfig) -> None:
    Path(cfg.output_dir).mkdir(parents=True, exist_ok=True)
    Path(default_config_path()).parent.mkdir(parents=True, exist_ok=True)


def scan_library(output_dir: str) -> List[Dict[str, Any]]:
    """
    Scan output_dir for tracks.

    Track format:
    - audio: {track_id}.mp3|wav|flac|ogg
    - meta:  {track_id}.json (optional)
    - peaks: {track_id}.peaks.json (optional)
    """
    out = Path(output_dir)
    if not out.exists():
        return []

    audio_exts = {".mp3", ".wav", ".flac", ".ogg"}
    by_id: Dict[str, Dict[str, Any]] = {}

    for f in out.iterdir():
        if not f.is_file():
            continue
        if f.suffix.lower() in audio_exts:
            tid = f.stem
            by_id.setdefault(tid, {})
            by_id[tid]["audio_path"] = str(f)
            by_id[tid].setdefault("created_at", f.stat().st_mtime)
        elif f.suffix.lower() == ".json" and not f.name.endswith(".peaks.json"):
            tid = f.stem
            try:
                meta = json.loads(f.read_text(encoding="utf-8"))
                if isinstance(meta, dict):
                    by_id.setdefault(tid, {})
                    by_id[tid]["meta"] = meta
                    if isinstance(meta.get("created_at"), (int, float)):
                        by_id[tid]["created_at"] = float(meta["created_at"])
            except Exception:
                continue

    tracks: List[Dict[str, Any]] = []
    for tid, rec in by_id.items():
        meta = rec.get("meta") if isinstance(rec.get("meta"), dict) else {}
        tracks.append(
            {
                "track_id": tid,
                "created_at": float(rec.get("created_at") or 0.0),
                "audio_path": rec.get("audio_path") or "",
                "meta": meta,
            }
        )

    tracks.sort(key=lambda x: x.get("created_at", 0.0), reverse=True)
    return tracks

