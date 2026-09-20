"""Mede 10/30/100 repetições pelo serviço diagnóstico real e determinístico."""

from __future__ import annotations

import argparse
import json
import os
import platform
import time
from uuid import UUID

from servidor.contracts.diagnostics import DiagnosticRequest
from servidor.contracts.preparation import EffectiveInput
from servidor.diagnostics.service import (
    RepetitionTask,
    aggregate_diagnostic,
    execute_repetition,
)
from tests.web_api.test_preparation_http import _payload as preparation_payload

SUPPORTED_COUNTS = (10, 30, 100)
BUILD_SHA = "a" * 40


def build_generated_request(count: int) -> DiagnosticRequest:
    """Constrói o mesmo plano explícito usado pelo executor, sem seeds implícitas."""
    if count not in SUPPORTED_COUNTS:
        raise ValueError("a medição aceita somente 10, 30 ou 100 repetições")
    effective = EffectiveInput.model_validate(preparation_payload()["input"])
    participant_ids = [str(participant.id) for participant in effective.participants]
    repetitions = [
        {
            "repetition_id": str(UUID(int=count * 1000 + index)),
            "participant_seeds": {
                participant_id: str(count * 1000 + index)
                for participant_id in participant_ids
            },
        }
        for index in range(1, count + 1)
    ]
    return DiagnosticRequest.model_validate(
        {
            "api_version": "1.0.0",
            "request_id": str(UUID(int=100_000 + count)),
            "idempotency_key": str(UUID(int=200_000 + count)),
            "study_id": "40000000-0000-4000-8000-000000000003",
            "scenario_id": "40000000-0000-4000-8000-000000000004",
            "scenario_revision": 1,
            "input_fingerprint": "e" * 64,
            "sampling": {
                "kind": "GENERATED_INPUT",
                "count": count,
                "preparation_input": effective.model_dump(mode="json"),
                "repetitions": repetitions,
            },
            "selected_repetition_id": repetitions[count // 2]["repetition_id"],
            "provenance": {},
        }
    )


def summarize_diagnostic_measurement(
    *, count: int, elapsed_ms: float, envelope_bytes: int, repetition_count: int
) -> dict[str, int | float]:
    if count not in SUPPORTED_COUNTS or repetition_count != count:
        raise ValueError("a medição não reconciliou todas as repetições")
    return {
        "count": count,
        "elapsed_ms": round(elapsed_ms, 1),
        "envelope_bytes": envelope_bytes,
        "repetition_count": repetition_count,
    }


def measure_count(count: int) -> dict[str, int | float]:
    request = build_generated_request(count)
    started = time.perf_counter()
    results = tuple(
        execute_repetition(RepetitionTask(request, index, BUILD_SHA))
        for index in range(count)
    )
    envelope = aggregate_diagnostic(UUID(int=300_000 + count), request, results)
    elapsed_ms = (time.perf_counter() - started) * 1000
    return summarize_diagnostic_measurement(
        count=count,
        elapsed_ms=elapsed_ms,
        envelope_bytes=len(envelope.model_dump_json().encode("utf-8")),
        repetition_count=len(envelope.repetitions),
    )


def environment_summary() -> dict[str, str | int | None]:
    return {
        "python": platform.python_version(),
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "logical_cpus": os.cpu_count(),
        "method": "serial-in-process execute_repetition + aggregate_diagnostic",
        "workers": 1,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-100-ms", type=float, default=180_000.0)
    args = parser.parse_args()
    measurements = [measure_count(count) for count in SUPPORTED_COUNTS]
    print(json.dumps({"environment": environment_summary()}, sort_keys=True))
    for measurement in measurements:
        print(json.dumps(measurement, sort_keys=True))
    largest = next(item for item in measurements if item["count"] == 100)
    if float(largest["elapsed_ms"]) > args.max_100_ms:
        raise SystemExit("a medição de 100 repetições excedeu o limite de CI")


if __name__ == "__main__":
    main()
