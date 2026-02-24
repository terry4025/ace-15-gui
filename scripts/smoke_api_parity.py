#!/usr/bin/env python3
"""
ACE-Step Studio API parity smoke test.

Usage:
  python scripts/smoke_api_parity.py --base http://127.0.0.1:8001
  python scripts/smoke_api_parity.py --base http://127.0.0.1:8001 --api-key xxxx
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests


@dataclass
class StepResult:
    name: str
    ok: bool
    detail: str
    skipped: bool = False

    def as_dict(self) -> Dict[str, Any]:
        status = "PASS"
        if self.skipped:
            status = "SKIP"
        elif not self.ok:
            status = "FAIL"
        return {
            "name": self.name,
            "ok": self.ok,
            "skipped": self.skipped,
            "status": status,
            "detail": self.detail,
        }


def unwrap(data: Any) -> Any:
    if isinstance(data, dict) and "code" in data and "data" in data:
        if data.get("code") != 200:
            raise RuntimeError(data.get("error") or f"API code={data.get('code')}")
        return data.get("data")
    return data


def run(
    base: str,
    api_key: str = "",
    timeout: float = 30.0,
    skip_release_task: bool = False,
    report_path: str = "",
    allow_known_format_input_failure: bool = False,
) -> int:
    sess = requests.Session()
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    def req(method: str, path: str, payload: Optional[Dict[str, Any]] = None, t: float = timeout) -> Any:
        url = urljoin(base.rstrip("/") + "/", path.lstrip("/"))
        resp = sess.request(method, url, json=payload, headers=headers, timeout=t)
        resp.raise_for_status()
        return unwrap(resp.json())

    results: List[StepResult] = []
    query_samples: List[Dict[str, Any]] = []
    cancel_sample: Dict[str, Any] = {}
    preflight_samples: Dict[str, Any] = {}
    stats_sample: Dict[str, Any] = {}
    app_config_sample: Dict[str, Any] = {}
    format_input_meta: Dict[str, Any] = {}

    def detect_known_format_input_signature(msg: str) -> Optional[str]:
        txt = str(msg or "").lower()
        signatures = [
            "device-side assert triggered",
            "cuda error: device-side assert",
            "device-side assert",
        ]
        for s in signatures:
            if s in txt:
                return s
        return None

    def check(name: str, fn, *, allow_skip: bool = False):
        try:
            v = fn()
            if allow_skip and v == "__skip__":
                results.append(StepResult(name=name, ok=True, skipped=True, detail="SKIP"))
            else:
                results.append(StepResult(name=name, ok=True, detail=str(v)[:240]))
        except Exception as e:
            results.append(StepResult(name=name, ok=False, detail=str(e)))

    # Core endpoints
    check("GET /health", lambda: req("GET", "/health"))
    def get_app_config():
        data = req("GET", "/v1/app-config")
        if isinstance(data, dict):
            app_config_sample.clear()
            app_config_sample.update(data)
        return data
    check("GET /v1/app-config", get_app_config)
    check("GET /v1/library", lambda: f"{len(req('GET', '/v1/library'))} tracks")
    def get_stats():
        data = req("GET", "/v1/stats")
        if isinstance(data, dict):
            stats_sample.clear()
            stats_sample.update(data)
        return data
    check("GET /v1/stats", get_stats)
    check("GET /v1/models", lambda: req("GET", "/v1/models"))
    check("GET /v1/tasks/recent", lambda: req("GET", "/v1/tasks/recent?limit=10&status=failed,canceled"))

    def preflight_pass():
        data = req(
            "POST",
            "/v1/preflight",
            {
                "payload": {
                    "prompt": "smoke upbeat electronic groove",
                    "lyrics": "[Instrumental]",
                    "thinking": False,
                    "sample_mode": False,
                    "batch_size": 1,
                    "audio_duration": 20,
                    "inference_steps": 8,
                    "guidance_scale": 7.0,
                },
                "client_files": {},
                "client_audio": {},
            },
        )
        preflight_samples["pass"] = data
        if not isinstance(data, dict) or not bool(data.get("ok")):
            raise RuntimeError("preflight pass did not return ok=true")
        if data.get("blocking_errors"):
            raise RuntimeError("preflight pass returned unexpected blocking_errors")
        return data

    def preflight_block():
        data = req(
            "POST",
            "/v1/preflight",
            {
                "payload": {
                    "prompt": "",
                    "sample_mode": False,
                    "thinking": False,
                },
                "client_files": {},
                "client_audio": {},
            },
        )
        preflight_samples["block"] = data
        blocks = data.get("blocking_errors") if isinstance(data, dict) else None
        if not isinstance(blocks, list) or len(blocks) == 0:
            raise RuntimeError("preflight block did not return blocking_errors")
        return data

    def preflight_warning():
        data = req(
            "POST",
            "/v1/preflight",
            {
                "payload": {
                    "task_type": "extract",
                    "model": "acestep-v15-turbo",
                    "prompt": "extract vocals",
                    "thinking": False,
                    "audio_duration": 20,
                    "inference_steps": 8,
                    "guidance_scale": 7.0,
                },
                "client_files": {"has_src_audio": True},
                "client_audio": {},
            },
        )
        preflight_samples["warning"] = data
        warns = data.get("warnings") if isinstance(data, dict) else None
        if not isinstance(warns, list) or len(warns) == 0:
            raise RuntimeError("preflight warning did not return warnings")
        return data

    check("POST /v1/preflight (pass)", preflight_pass)
    check("POST /v1/preflight (blocking)", preflight_block)
    check("POST /v1/preflight (warning)", preflight_warning)
    check("POST /create_random_sample", lambda: req("POST", "/create_random_sample", {"sample_type": "simple_mode"}))
    def run_format_input():
        try:
            return req(
                "POST",
                "/format_input",
                {
                    "prompt": "upbeat pop with bright synth",
                    "lyrics": "[Instrumental]",
                    "temperature": 0.85,
                    "param_obj": {"duration": 20},
                },
                t=max(timeout, 60.0),
            )
        except Exception as e:
            msg = str(e)
            sig = detect_known_format_input_signature(msg)
            if sig:
                format_input_meta["detected_signature"] = sig
            if allow_known_format_input_failure:
                if sig or "format_sample failed" in msg.lower():
                    format_input_meta["skip_reason"] = "known_format_input_failure"
                    if not sig:
                        format_input_meta["detected_signature"] = "format_sample failed"
                    return "__skip__"
            raise

    check("POST /format_input", run_format_input, allow_skip=True)

    def validate_query_optional_fields():
        if not query_samples:
            return "__skip__"
        errors: List[str] = []
        for idx, item in enumerate(query_samples):
            if not isinstance(item, dict):
                errors.append(f"item[{idx}] is not an object")
                continue
            for key in (
                "error_code",
                "error_summary",
                "stage",
                "progress_text",
                "recover_hint",
            ):
                v = item.get(key)
                if v is not None and not isinstance(v, str):
                    errors.append(f"{key} must be string|null")
            for key in ("retryable",):
                v = item.get(key)
                if v is not None and not isinstance(v, bool):
                    errors.append(f"{key} must be bool|null")
            for key in ("progress", "eta_seconds", "avg_job_seconds"):
                v = item.get(key)
                if v is not None and not isinstance(v, (int, float)):
                    errors.append(f"{key} must be number|null")
            for key in ("last_heartbeat", "stall_seconds"):
                v = item.get(key)
                if v is not None and not isinstance(v, (int, float)):
                    errors.append(f"{key} must be number|null")
            np = item.get("next_poll_ms")
            if np is not None and not isinstance(np, (int, float)):
                errors.append("next_poll_ms must be number|null")
            qv = item.get("queue_position")
            if qv is not None and not isinstance(qv, int):
                errors.append("queue_position must be int|null")
            status = item.get("status")
            if status is not None and not isinstance(status, int):
                errors.append("status must be int")
            hv = item.get("health_state")
            if hv is not None and hv not in ("healthy", "degraded", "stalled", "terminal"):
                errors.append("health_state must be healthy|degraded|stalled|terminal|null")
        if errors:
            raise RuntimeError("; ".join(errors[:8]))
        return f"{len(query_samples)} items validated"

    def validate_cancel_optional_fields():
        if not cancel_sample:
            return "__skip__"
        errors: List[str] = []
        if "task_id" in cancel_sample and cancel_sample.get("task_id") is not None and not isinstance(cancel_sample.get("task_id"), str):
            errors.append("task_id must be string|null")
        if "status" in cancel_sample and cancel_sample.get("status") is not None:
            if cancel_sample.get("status") not in ("canceled", "running", "queued"):
                errors.append("status must be canceled|running|queued|null")
        if "error_code" in cancel_sample and cancel_sample.get("error_code") is not None and not isinstance(cancel_sample.get("error_code"), str):
            errors.append("error_code must be string|null")
        if "recover_hint" in cancel_sample and cancel_sample.get("recover_hint") is not None and not isinstance(cancel_sample.get("recover_hint"), str):
            errors.append("recover_hint must be string|null")
        if errors:
            raise RuntimeError("; ".join(errors))
        return "cancel fields valid"

    def validate_stats_optional_fields():
        if not stats_sample:
            return "__skip__"
        errors: List[str] = []
        for key in (
            "preflight_calls_total",
            "query_result_calls_total",
            "cancel_calls_total",
            "format_input_calls_total",
            "format_input_fail_total",
            "format_input_known_fail_total",
        ):
            v = stats_sample.get(key)
            if v is not None and not isinstance(v, int):
                errors.append(f"{key} must be int|null")
        if errors:
            raise RuntimeError("; ".join(errors))
        return "stats fields valid"

    check("GET /v1/stats optional fields", validate_stats_optional_fields, allow_skip=True)

    def validate_app_config_optional_fields():
        if not app_config_sample:
            return "__skip__"
        root = app_config_sample
        if not isinstance(root, dict):
            raise RuntimeError("app-config response must be object")
        cfg = root.get("config")
        if not isinstance(cfg, dict):
            raise RuntimeError("app-config.config must be object")
        errors: List[str] = []
        sync = cfg.get("mic_sync_enabled")
        if sync is not None and not isinstance(sync, bool):
            errors.append("mic_sync_enabled must be bool|null")
        vol = cfg.get("mic_input_volume_percent")
        if vol is not None:
            if isinstance(vol, bool) or not isinstance(vol, int):
                errors.append("mic_input_volume_percent must be int|null")
            elif vol < 0 or vol > 100:
                errors.append("mic_input_volume_percent must be within 0..100")
        if errors:
            raise RuntimeError("; ".join(errors))
        return "app-config fields valid"

    check("GET /v1/app-config optional fields", validate_app_config_optional_fields, allow_skip=True)

    # Config round-trip (non-destructive no-op patch)
    def patch_cfg():
        cfg = req("GET", "/v1/app-config")
        current = cfg.get("config", {}) if isinstance(cfg, dict) else {}
        current_mic_sync = bool(current.get("mic_sync_enabled", False))
        current_mic_vol = current.get("mic_input_volume_percent", 100)
        if isinstance(current_mic_vol, bool) or not isinstance(current_mic_vol, int):
            current_mic_vol = 100
        current_mic_vol = max(0, min(100, current_mic_vol))
        patch = {
            "language": cfg.get("config", {}).get("language", "en"),
            "bind_mode": cfg.get("config", {}).get("bind_mode", "local"),
            "mic_sync_enabled": current_mic_sync,
            "mic_input_volume_percent": current_mic_vol,
        }
        try:
            return req("POST", "/v1/app-config", patch)
        except requests.HTTPError as e:
            # Legacy builds may mis-declare request body and return
            # 422 with loc=["query","body"] for valid JSON payloads.
            resp = e.response
            if resp is not None and resp.status_code == 422:
                text = resp.text or ""
                if '"query","body"' in text or '"query", "body"' in text:
                    return "__skip__"
            raise

    check("POST /v1/app-config", patch_cfg, allow_skip=True)

    # /v1/audio if any track exists
    def check_audio():
        tracks = req("GET", "/v1/library")
        if not tracks:
            return "__skip__"
        url = tracks[0].get("audio_url")
        if not url:
            return "__skip__"
        full_url = urljoin(base.rstrip("/") + "/", url.lstrip("/"))
        r = sess.get(full_url, headers=headers, timeout=timeout, stream=True)
        r.raise_for_status()
        return f"{r.status_code} {r.headers.get('content-type', '')}"

    check("GET /v1/audio", check_audio, allow_skip=True)

    # release/query/cancel flow
    if skip_release_task:
        results.append(StepResult("POST /release_task + query/cancel", ok=True, skipped=True, detail="SKIP (--skip-release-task)"))
    else:
        task_id: Optional[str] = None

        def release():
            nonlocal task_id
            data = req(
                "POST",
                "/release_task",
                {
                    "prompt": "test smoke generation short loop",
                    "lyrics": "[Instrumental]",
                    "thinking": False,
                    "batch_size": 1,
                    "audio_duration": 10,
                    "audio_format": "mp3",
                },
                t=max(timeout, 120.0),
            )
            task_id = data.get("task_id")
            if not task_id:
                raise RuntimeError("No task_id returned")
            return data

        check("POST /release_task", release)

        def query():
            if not task_id:
                raise RuntimeError("release_task not completed")
            data = req("POST", "/query_result", {"task_id_list": [task_id]})
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        query_samples.append(item)
            return data

        check("POST /query_result", query)
        check("POST /query_result optional fields", validate_query_optional_fields, allow_skip=True)

        def cancel():
            if not task_id:
                raise RuntimeError("release_task not completed")
            data = req("POST", f"/v1/tasks/{task_id}/cancel", {})
            if isinstance(data, dict):
                cancel_sample.clear()
                cancel_sample.update(data)
            return data

        check("POST /v1/tasks/{task_id}/cancel", cancel)
        check("POST /v1/tasks/{task_id}/cancel optional fields", validate_cancel_optional_fields, allow_skip=True)

        # best-effort second query after cancel request
        if task_id:
            time.sleep(1.5)
            check("POST /query_result (after cancel)", query)
            check("POST /query_result optional fields (after cancel)", validate_query_optional_fields, allow_skip=True)

    failed = [r for r in results if not r.ok]
    passed = [x for x in results if x.ok and not x.skipped]
    skipped = [x for x in results if x.skipped]
    print("=" * 72)
    print("ACE-Step API Parity Smoke")
    print("=" * 72)
    for r in results:
        tag = "PASS"
        if r.skipped:
            tag = "SKIP"
        elif not r.ok:
            tag = "FAIL"
        print(f"[{tag}] {r.name}: {r.detail}")
    print("-" * 72)
    print(f"Total={len(results)} Pass={len(passed)} Skip={len(skipped)} Fail={len(failed)}")

    if report_path:
        format_step = next((x for x in results if x.name == "POST /format_input"), None)
        format_input_status = "fail"
        if format_step and format_step.ok and not format_step.skipped:
            format_input_status = "pass"
        elif (
            format_step
            and format_step.skipped
            and format_input_meta.get("skip_reason") == "known_format_input_failure"
        ):
            format_input_status = "skip_known_failure"
        strict_mode: Dict[str, Any] = {
            "format_input_status": format_input_status,
            "allow_known_format_input_failure": allow_known_format_input_failure,
        }
        sig = format_input_meta.get("detected_signature")
        if sig:
            strict_mode["format_input_signature"] = sig
        report = {
            "at": datetime.now(timezone.utc).isoformat(),
            "base": base,
            "timeout": timeout,
            "skip_release_task": skip_release_task,
            "allow_known_format_input_failure": allow_known_format_input_failure,
            "format_input": format_input_meta,
            "strict_mode": strict_mode,
            "preflight": preflight_samples,
            "total": len(results),
            "pass": len(passed),
            "skip": len(skipped),
            "fail": len(failed),
            "steps": [x.as_dict() for x in results],
        }
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"Report: {report_path}")

    return 1 if failed else 0


def main() -> int:
    # Windows cp949 consoles may fail printing model names with non-CP949 glyphs.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="backslashreplace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(errors="backslashreplace")

    parser = argparse.ArgumentParser()
    parser.add_argument("base_positional", nargs="?", default="")
    parser.add_argument("--base", default="http://127.0.0.1:8001")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--skip-release-task", action="store_true")
    parser.add_argument("--report", default="")
    parser.add_argument("--allow-known-format-input-failure", action="store_true")
    args = parser.parse_args()
    base = args.base_positional or args.base
    try:
        return run(
            base,
            args.api_key,
            args.timeout,
            args.skip_release_task,
            args.report,
            args.allow_known_format_input_failure,
        )
    except requests.HTTPError as e:
        print(f"HTTP error: {e}", file=sys.stderr)
        if e.response is not None:
            print(e.response.text[:1000], file=sys.stderr)
        return 2
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
