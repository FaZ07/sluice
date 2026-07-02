"""
SLUICE — Wire adapter: the ONLY file that talks to the outside world.

LIVE flow (same shape confirmed against the real Anakin Wire API in beacon):
  POST {WIRE_BASE_URL}/task          {action_id, params}  -> {job_id, ...}
  GET  {WIRE_BASE_URL}/jobs/{job_id}                      -> {status, data:{data:{data:[...]}}}
  header: X-API-Key: <key>

MODE=mock (default) reads bundled fixtures from fixtures/{action_id}.json so
the whole pipeline runs keyless and offline — demos cost zero credits, and
the data shapes are identical to live, so flipping the switch changes only
the source.

Stdlib only (urllib) — no dependencies to install on a client machine.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"

POLL_CEILING_S = 90          # hard cap — a gig fetch never hangs forever
POLL_BACKOFF = (1, 2, 4, 8)  # then stays at 8s; well under Wire's rate limit


class WireError(RuntimeError):
    """Anything that stops us getting rows back from Wire."""


def _mode() -> str:
    return os.getenv("MODE", "mock").lower()


def _base_url() -> str:
    return os.getenv("WIRE_BASE_URL", "https://api.anakin.io/v1/wire").rstrip("/")


def _api_key() -> str:
    return os.getenv("WIRE_API_KEY", "")


def unwrap(payload) -> list:
    """Wire nests results as data.data.data (depth varies by action).
    Descend through 'data'/'results'/'rows' keys until we hit the list."""
    node = payload
    for _ in range(6):
        if isinstance(node, list):
            return node
        if isinstance(node, dict):
            for key in ("data", "results", "rows", "items"):
                if key in node:
                    node = node[key]
                    break
            else:
                break
        else:
            break
    raise WireError(f"could not find a result list in Wire response: {type(payload).__name__}")


def _request(url: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"X-API-Key": _api_key(), "Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise WireError(f"Wire HTTP {e.code} on {url}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise WireError(f"Wire unreachable: {e}") from e


def _fetch_live(action_id: str, params: dict) -> list[dict]:
    task = _request(f"{_base_url()}/task", {"action_id": action_id, "params": params})
    job_id = task.get("job_id")
    if not job_id:
        raise WireError(f"Wire task submit returned no job_id: {task}")

    deadline = time.monotonic() + POLL_CEILING_S
    attempt = 0
    while time.monotonic() < deadline:
        job = _request(f"{_base_url()}/jobs/{job_id}")
        status = str(job.get("status", "")).lower()
        if status in ("completed", "success", "done"):
            return unwrap(job)
        if status in ("failed", "error"):
            raise WireError(f"Wire job {job_id} failed: {job.get('error', 'unknown')}")
        time.sleep(POLL_BACKOFF[min(attempt, len(POLL_BACKOFF) - 1)])
        attempt += 1
    raise WireError(f"Wire job {job_id} did not finish within {POLL_CEILING_S}s")


def _fetch_mock(action_id: str) -> list[dict]:
    path = FIXTURES_DIR / f"{action_id}.json"
    if not path.exists():
        raise WireError(f"no mock fixture for action '{action_id}' ({path.name})")
    return unwrap(json.loads(path.read_text(encoding="utf-8")))


def fetch(action_id: str, params: dict) -> list[dict]:
    """Return raw rows for an action — mock or live decided by MODE."""
    if _mode() == "live":
        if not _api_key():
            raise WireError("MODE=live but WIRE_API_KEY is not set")
        return _fetch_live(action_id, params)
    return _fetch_mock(action_id)
