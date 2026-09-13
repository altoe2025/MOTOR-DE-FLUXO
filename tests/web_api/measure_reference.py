"""Mede cinco execuções da referência pela API real com autenticação controlada."""

from __future__ import annotations

import argparse
import time
from copy import deepcopy
from uuid import UUID

from fastapi.testclient import TestClient

from servidor.generate_reference_fixture import build_reference_request
from tests.web_api.run_e2e import CONTROLLED_TOKEN, build_e2e_app


def summarize_measurements(durations_ms: list[float], envelope_bytes: int) -> dict[str, int | float]:
    if len(durations_ms) != 5:
        raise ValueError("a aceitação exige exatamente cinco execuções")
    return {
        "runs": 5,
        "p95_ms": round(max(durations_ms), 1),
        "envelope_bytes": envelope_bytes,
    }


def measure_reference() -> dict[str, int | float]:
    base = build_reference_request()
    durations: list[float] = []
    envelope_bytes = 0
    headers = {"Authorization": f"Bearer {CONTROLLED_TOKEN}"}
    with TestClient(build_e2e_app()) as client:
        for index in range(5):
            payload = deepcopy(base)
            payload["request_id"] = str(UUID(int=2200 + index))
            started = time.perf_counter()
            response = client.post("/api/v1/previas", json=payload, headers=headers)
            durations.append((time.perf_counter() - started) * 1000)
            response.raise_for_status()
            envelope_bytes = max(envelope_bytes, len(response.content))
    return summarize_measurements(durations, envelope_bytes)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-p95-ms", type=float, default=5000.0)
    args = parser.parse_args()
    summary = measure_reference()
    print(
        f"reference_runs={summary['runs']} p95_ms={summary['p95_ms']} "
        f"envelope_bytes={summary['envelope_bytes']}"
    )
    if float(summary["p95_ms"]) > args.max_p95_ms:
        raise SystemExit("a referência excedeu o limite de aceitação")


if __name__ == "__main__":
    main()
