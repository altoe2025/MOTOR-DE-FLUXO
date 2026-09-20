"""Aceitacao integrada da Etapa 3 em fronteiras reais do servidor."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi.testclient import TestClient

from servidor.contracts.diagnostics import DiagnosticRequest
from servidor.generate_reference_fixture import build_reference_request
from tests.web_api.measure_diagnostics import (
    build_generated_request,
    summarize_diagnostic_measurement,
)
from tests.web_api.run_e2e import (
    CONTROLLED_TOKEN,
    CONTROLLED_TOKEN_B,
    ControlledDiagnosticPool,
    build_e2e_app,
)
from tests.web_api.scan_credentials import (
    find_binary_secret_findings,
    find_sensitive_log_findings,
)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _request(index: int) -> dict[str, object]:
    preview = build_reference_request()
    selected = f"30000000-0000-4000-8000-{index:012d}"
    return DiagnosticRequest.model_validate(
        {
            "api_version": "1.0.0",
            "request_id": f"10000000-0000-4000-8000-{index:012d}",
            "idempotency_key": f"20000000-0000-4000-8000-{index:012d}",
            "study_id": preview["study_id"],
            "scenario_id": preview["scenario_id"],
            "scenario_revision": preview["scenario_revision"],
            "input_fingerprint": "a" * 64,
            "sampling": {
                "kind": "FIXED_INPUT",
                "count": 1,
                "preview_request": preview,
            },
            "selected_repetition_id": selected,
            "provenance": preview["proveniencia"],
        }
    ).model_dump(mode="json")


def test_performance_measurement_covers_only_supported_counts_and_records_envelope():
    """Pega medicao que reduza 100 repeticoes ou aceite contagem fora do contrato."""
    for count in (10, 30, 100):
        request = build_generated_request(count)
        assert request.sampling.count == count
        assert len(request.sampling.repetitions) == count
        assert len({item.repetition_id for item in request.sampling.repetitions}) == count

    summary = summarize_diagnostic_measurement(
        count=10,
        elapsed_ms=123.456,
        envelope_bytes=4096,
        repetition_count=10,
    )
    assert summary == {
        "count": 10,
        "elapsed_ms": 123.5,
        "envelope_bytes": 4096,
        "repetition_count": 10,
    }


def test_http_queue_proves_progress_idempotency_cancel_isolation_and_shutdown():
    """Pega duplicacao, vazamento cross-owner e shutdown que abandone trabalho."""
    pool = ControlledDiagnosticPool()
    app = build_e2e_app(diagnostic_worker_pool=pool, diagnostic_max_workers=1)
    first = _request(1)
    second = _request(2)

    with TestClient(app, raise_server_exceptions=False) as client:
        created = client.post(
            "/api/v1/diagnosticos", json=first, headers=_auth(CONTROLLED_TOKEN)
        )
        repeated = client.post(
            "/api/v1/diagnosticos", json=first, headers=_auth(CONTROLLED_TOKEN)
        )
        queued = client.post(
            "/api/v1/diagnosticos", json=second, headers=_auth(CONTROLLED_TOKEN_B)
        )

        assert created.status_code == repeated.status_code == queued.status_code == 202
        assert created.json()["job_id"] == repeated.json()["job_id"]
        assert pool.wait_for_pending(1)
        assert pool.snapshot()["max_active"] == 1
        assert client.get(
            f"/api/v1/diagnosticos/{created.json()['job_id']}",
            headers=_auth(CONTROLLED_TOKEN_B),
        ).status_code == 404

        cancelled = client.post(
            f"/api/v1/diagnosticos/{queued.json()['job_id']}/cancelamentos",
            headers=_auth(CONTROLLED_TOKEN_B),
        )
        assert cancelled.status_code == 202
        assert cancelled.json()["status"] == "CANCELLED"

        pool.release_next()
        terminal = client.get(
            f"/api/v1/diagnosticos/{created.json()['job_id']}",
            headers=_auth(CONTROLLED_TOKEN),
        )
        assert terminal.json()["status"] == "SUCCEEDED"
        assert terminal.json()["progress"] | {
            "created_at": "ignored",
            "finished_at": "ignored",
        } == {
            "completed": 1,
            "failed": 0,
            "total": 1,
            "current_repetition_id": None,
            "phase": "TERMINAL",
            "started_at": terminal.json()["progress"]["started_at"],
            "updated_at": terminal.json()["progress"]["updated_at"],
            "created_at": "ignored",
            "finished_at": "ignored",
        }
        result = client.get(
            f"/api/v1/diagnosticos/{created.json()['job_id']}/resultado",
            headers=_auth(CONTROLLED_TOKEN),
        )
        assert result.status_code == 200
        assert result.json()["job_id"] == created.json()["job_id"]

    assert pool.snapshot() == {
        "active": 0,
        "closed": True,
        "max_active": 1,
        "pending": 0,
        "submitted": 1,
    }


def test_http_logs_exclude_query_tokens_and_order_payloads(caplog):
    """Pega access log que serialize URL completa ou corpo financeiro."""
    pool = ControlledDiagnosticPool()
    app = build_e2e_app(diagnostic_worker_pool=pool, diagnostic_max_workers=1)
    secret_order = "order-that-must-not-enter-logs"
    payload = _request(3)
    payload["sampling"]["preview_request"]["cenario"]["ordens"][0]["id"] = secret_order

    with (
        caplog.at_level(logging.INFO, logger="servidor.http"),
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        sensitive_query = "access_" + "token=controlled-secret-token"
        response = client.post(
            f"/api/v1/diagnosticos?{sensitive_query}",
            json=payload,
            headers=_auth(CONTROLLED_TOKEN),
        )
        assert response.status_code == 202
        assert pool.wait_for_pending(1)
        pool.release_next()

    logs = caplog.text
    assert "access_token" not in logs
    assert "controlled-secret-token" not in logs
    assert secret_order not in logs
    assert '"cenario"' not in logs


def test_scanner_detects_secrets_in_binary_and_sensitive_logger_arguments():
    """Pega scanner que ignore binarios ou logging de query/body."""
    binary_findings = find_binary_secret_findings(
        {
            "safe.png": b"\x89PNG\x00publishable",
            "leak.bin": (
                b"\x00OPENAI_API_KEY=sk-" + b"proj-abcdefghijklmnopqrstuvwx123456\x00"
            ),
        }
    )
    assert [(item.path, item.kind) for item in binary_findings] == [
        ("leak.bin", "openai-key")
    ]

    log_findings = find_sensitive_log_findings(
        {
            "safe.py": 'logger.info("path=%s", request.url.path)',
            "query.py": "log" + 'ger.info("url=%s", request.url)',
            "body.py": "log" + 'ger.debug("payload=%s", request.json())',
        }
    )
    assert [(item.path, item.kind) for item in log_findings] == [
        ("body.py", "sensitive-log-payload"),
        ("query.py", "sensitive-log-url"),
    ]


def test_job_identity_remains_owner_scoped_even_for_same_uuid():
    """Pega UUID global ou despacho que ultrapasse o limite de workers."""
    pool = ControlledDiagnosticPool()
    app = build_e2e_app(diagnostic_worker_pool=pool, diagnostic_max_workers=2)
    payload = _request(4)

    with TestClient(app, raise_server_exceptions=False) as client:
        owner_a = client.post(
            "/api/v1/diagnosticos", json=payload, headers=_auth(CONTROLLED_TOKEN)
        )
        owner_b = client.post(
            "/api/v1/diagnosticos", json=payload, headers=_auth(CONTROLLED_TOKEN_B)
        )
        third = client.post(
            "/api/v1/diagnosticos", json=_request(5), headers=_auth(CONTROLLED_TOKEN)
        )
        assert third.status_code == 202
        assert owner_a.json()["job_id"] == owner_b.json()["job_id"] == str(
            UUID(str(payload["idempotency_key"]))
        )
        assert pool.wait_for_pending(2)
        assert pool.snapshot() | {"closed": False} == {
            "active": 2,
            "closed": False,
            "max_active": 2,
            "pending": 2,
            "submitted": 2,
        }
        pool.release_next()
        assert pool.wait_for_pending(2)
        assert pool.snapshot()["max_active"] == 2
        pool.release_all()
        for token in (CONTROLLED_TOKEN, CONTROLLED_TOKEN_B):
            result = client.get(
                f"/api/v1/diagnosticos/{owner_a.json()['job_id']}/resultado",
                headers=_auth(token),
            )
            assert result.status_code == 200
