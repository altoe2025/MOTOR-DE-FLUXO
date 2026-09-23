"""Mede o limite público do Replay sem repetir a varredura analítica."""

from __future__ import annotations

import json
from statistics import median
from time import perf_counter
from typing import Any
from uuid import UUID

from servidor.contracts.diagnostics import DiagnosticRequest
from servidor.contracts.replay import ReplayDocumentV1, ReplayRequestV1
from servidor.diagnostics.service import (
    RepetitionTask,
    aggregate_diagnostic,
    execute_repetition,
)
from servidor.generate_reference_fixture import build_reference_request
from servidor.replay import construir_replay

BUILD_SHA = "a" * 40
JOB_ID = UUID("00000000-0000-4000-8000-000000000892")
REPETITION_ID = UUID("00000000-0000-4000-8000-000000000893")
EXECUTION_ID = UUID("00000000-0000-4000-8000-000000000894")
PUBLIC_BODY_LIMIT_BYTES = 8 * 1024 * 1024
REQUESTED_REPLAY_ORDER_LIMIT = 1000
DIAGNOSTIC_PROVENANCE_LIMIT = 500
ORDER_PROVENANCE_FIELDS = 5
BASE_PROVENANCE_FIELDS = 9
EFFECTIVE_ORDER_LIMIT = (
    DIAGNOSTIC_PROVENANCE_LIMIT - BASE_PROVENANCE_FIELDS
) // ORDER_PROVENANCE_FIELDS


def _preview_at_limit(
    order_count: int = EFFECTIVE_ORDER_LIMIT, horizon_days: int = 364
) -> dict[str, Any]:
    payload = build_reference_request()
    orders: list[dict[str, object]] = []
    for index in range(order_count):
        known = index % (horizon_days + 1)
        orders.append(
            {
                "id": f"limit-{index:04d}",
                "cliente_id": f"client-{index % 100:03d}",
                "direcao": "OUT" if index % 2 == 0 else "IN",
                "valor_brl": str(100_000 + index),
                "dia_conhecida": known,
                "dia_limite": min(horizon_days, known + 7),
                "eh_efx": False,
                "finalidade": "ANEXO_V_OUTROS",
            }
        )
    payload["cenario"]["ordens"] = orders
    payload["cenario"]["horizonte_dias"] = horizon_days
    payload["cenario"]["janela_dias"] = 7
    payload["periodo"] = {"modo": "LEGADO"}
    origin = next(iter(payload["proveniencia"].values()))
    provenance = {
        path: value
        for path, value in payload["proveniencia"].items()
        if not path.startswith("/ordens/")
    }
    for index in range(order_count):
        for field in ("valor_brl", "dia_conhecida", "dia_limite", "eh_efx", "finalidade"):
            provenance[f"/ordens/{index}/{field}"] = dict(origin)
    payload["proveniencia"] = provenance
    return payload


def build_limit_request() -> ReplayRequestV1:
    preview = _preview_at_limit()
    diagnostic = DiagnosticRequest.model_validate(
        {
            "api_version": "1.0.0",
            "request_id": "00000000-0000-4000-8000-000000000891",
            "idempotency_key": str(JOB_ID),
            "study_id": preview["study_id"],
            "scenario_id": preview["scenario_id"],
            "scenario_revision": preview["scenario_revision"],
            "input_fingerprint": "b" * 64,
            "sampling": {"kind": "FIXED_INPUT", "count": 1, "preview_request": preview},
            "selected_repetition_id": str(REPETITION_ID),
            "provenance": preview["proveniencia"],
        }
    )
    result = execute_repetition(RepetitionTask(diagnostic, 0, BUILD_SHA))
    envelope = aggregate_diagnostic(JOB_ID, diagnostic, (result,))
    return ReplayRequestV1(
        api_version="1.0.0",
        diagnostic_execution_id=EXECUTION_ID,
        diagnostic_envelope=envelope,
    )


def measure_limit_replay(iterations: int = 5) -> tuple[dict[str, object], ReplayDocumentV1]:
    request_started = perf_counter()
    request = build_limit_request()
    input_build_ms = (perf_counter() - request_started) * 1000
    durations: list[float] = []
    document: ReplayDocumentV1 | None = None
    for _ in range(iterations):
        started = perf_counter()
        document = construir_replay(request)
        durations.append((perf_counter() - started) * 1000)
    if document is None:
        raise RuntimeError("medição do Replay exige ao menos uma iteração")
    request_bytes = len(request.model_dump_json().encode("utf-8"))
    response_bytes = len(document.model_dump_json().encode("utf-8"))
    report: dict[str, object] = {
        "requested_orders": REQUESTED_REPLAY_ORDER_LIMIT,
        "requested_orders_supported": False,
        "binding_limit": "DIAGNOSTIC_PROVENANCE_MAX_500",
        "provenance_entries": BASE_PROVENANCE_FIELDS
        + ORDER_PROVENANCE_FIELDS * len(document.orders),
        "orders": len(document.orders),
        "days": len(document.days),
        "horizon_days_inclusive": document.period.settlement_end_day + 1,
        "events": sum(len(day.events) for day in document.days),
        "segments": sum(len(day.closing.flow_segments) for day in document.days if day.closing),
        "request_bytes": request_bytes,
        "response_bytes": response_bytes,
        "body_limit_bytes": PUBLIC_BODY_LIMIT_BYTES,
        "within_request_limit": request_bytes <= PUBLIC_BODY_LIMIT_BYTES,
        "within_response_limit": response_bytes <= PUBLIC_BODY_LIMIT_BYTES,
        "input_and_engine_ms": round(input_build_ms, 3),
        "builder_iterations": iterations,
        "builder_p50_ms": round(median(durations), 3),
        "builder_max_ms": round(max(durations), 3),
    }
    return report, document


if __name__ == "__main__":
    measured, _ = measure_limit_replay()
    print(json.dumps(measured, ensure_ascii=False, sort_keys=True, indent=2))
