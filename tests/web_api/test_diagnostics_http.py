"""Fronteira HTTP autenticada da fila diagnóstica."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from servidor.auth import AuthenticatedUser, SessionInvalid
from servidor.config import Settings
from servidor.contracts.diagnostics import JobProgress, JobSnapshot
from servidor.generate_reference_fixture import build_reference_request

USER_A = UUID("00000000-0000-4000-8000-000000000101")
USER_B = UUID("00000000-0000-4000-8000-000000000102")
JOB_ID = UUID("00000000-0000-4000-8000-000000000901")
NOW = datetime(2026, 9, 20, 12, tzinfo=UTC)


class Verifier:
    def verify(self, token: str) -> AuthenticatedUser:
        if token == "token-a":
            return AuthenticatedUser(USER_A)
        if token == "token-b":
            return AuthenticatedUser(USER_B)
        raise SessionInvalid("token inválido")


def _settings(**changes: object) -> Settings:
    values = {
        "app_env": "test",
        "supabase_url": "https://projeto.supabase.co",
        "supabase_jwt_issuer": "https://projeto.supabase.co/auth/v1",
        "supabase_jwt_audience": "authenticated",
        "supabase_allowed_user_ids": frozenset({USER_A, USER_B}),
        "motor_build_sha": "a" * 40,
    }
    values.update(changes)
    return Settings.model_validate(values)


def _payload() -> dict[str, object]:
    preview = build_reference_request()
    return {
        "api_version": "1.0.0",
        "request_id": "00000000-0000-4000-8000-000000000801",
        "idempotency_key": "00000000-0000-4000-8000-000000000802",
        "study_id": preview["study_id"],
        "scenario_id": preview["scenario_id"],
        "scenario_revision": preview["scenario_revision"],
        "input_fingerprint": "a" * 64,
        "sampling": {
            "kind": "FIXED_INPUT",
            "count": 1,
            "preview_request": preview,
        },
        "selected_repetition_id": "00000000-0000-4000-8000-000000000803",
        "provenance": preview["proveniencia"],
    }


def _snapshot(status: str = "QUEUED") -> JobSnapshot:
    terminal = status in {"SUCCEEDED", "FAILED", "CANCELLED"}
    return JobSnapshot(
        api_version="1.0.0",
        job_id=JOB_ID,
        request_id=UUID("00000000-0000-4000-8000-000000000801"),
        status=status,
        progress=JobProgress(
            completed=1 if status == "SUCCEEDED" else 0,
            failed=1 if status == "FAILED" else 0,
            total=1,
            current_repetition_id=None,
            phase="TERMINAL" if terminal else "QUEUED",
            created_at=NOW,
            started_at=None,
            updated_at=NOW,
            finished_at=NOW if terminal else None,
        ),
        retry_of_job_id=None,
        error=(
            {
                "code": "DIAGNOSTICO_INVALIDO",
                "message": "falha",
                "repetition_id": None,
            }
            if status == "FAILED"
            else None
        ),
    )


class FakeExecutor:
    def __init__(self) -> None:
        self.closed = False
        self.snapshot = _snapshot()
        self.result_value: object = None
        self.calls: list[tuple[object, ...]] = []

    def submit(self, owner: str, request: object) -> JobSnapshot:
        self.calls.append(("submit", owner, request))
        return self.snapshot

    def get(self, owner: str, job_id: UUID) -> JobSnapshot:
        self.calls.append(("get", owner, job_id))
        if owner != str(USER_A):
            from servidor.diagnostics.executor import DiagnosticExecutorError

            raise DiagnosticExecutorError("JOB_NAO_ENCONTRADO")
        return self.snapshot

    def result(self, owner: str, job_id: UUID) -> object:
        self.calls.append(("result", owner, job_id))
        if self.result_value is None:
            from servidor.diagnostics.executor import DiagnosticExecutorError

            raise DiagnosticExecutorError("JOB_NAO_TERMINAL")
        return self.result_value

    def cancel(self, owner: str, job_id: UUID) -> JobSnapshot:
        self.calls.append(("cancel", owner, job_id))
        self.snapshot = _snapshot("CANCELLED")
        return self.snapshot

    def retry(self, owner: str, job_id: UUID, key: UUID) -> JobSnapshot:
        self.calls.append(("retry", owner, job_id, key))
        return self.snapshot

    def close(self) -> None:
        self.closed = True


@pytest.fixture
def client_parts():
    from servidor.app import create_app

    executor = FakeExecutor()
    with TestClient(
        create_app(_settings(), Verifier(), diagnostic_executor=executor),
        raise_server_exceptions=False,
    ) as client:
        yield client, executor
    assert executor.closed is True


def _auth(token: str = "token-a") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_cinco_operacoes_sao_autenticadas_isoladas_e_no_store(client_parts):
    """Pega rota sem auth, owner derivado do payload ou cacheável."""
    client, executor = client_parts
    unauthorized = client.post("/api/v1/diagnosticos", json=_payload())
    created = client.post("/api/v1/diagnosticos", json=_payload(), headers=_auth())
    progress = client.get(f"/api/v1/diagnosticos/{JOB_ID}", headers=_auth())
    hidden = client.get(f"/api/v1/diagnosticos/{JOB_ID}", headers=_auth("token-b"))
    cancelled = client.post(
        f"/api/v1/diagnosticos/{JOB_ID}/cancelamentos", headers=_auth()
    )
    retried = client.post(
        f"/api/v1/diagnosticos/{JOB_ID}/retries",
        json={
            "api_version": "1.0.0",
            "request_id": "00000000-0000-4000-8000-000000000811",
            "idempotency_key": "00000000-0000-4000-8000-000000000812",
        },
        headers=_auth(),
    )

    assert unauthorized.status_code == 401
    assert created.status_code == 202
    assert progress.status_code == 200
    assert hidden.status_code == 404
    assert cancelled.status_code == 202
    assert retried.status_code == 202
    assert all(
        response.headers["cache-control"] == "no-store"
        for response in (unauthorized, created, progress, hidden, cancelled, retried)
    )
    assert executor.calls[0][1] == str(USER_A)


def test_resultado_prematuro_e_erros_de_fila_tem_codigos_estaveis(client_parts):
    """Pega mapeamento genérico que perca semântica operacional."""
    client, executor = client_parts
    premature = client.get(f"/api/v1/diagnosticos/{JOB_ID}/resultado", headers=_auth())
    assert premature.status_code == 409
    assert premature.json()["error"]["code"] == "JOB_NAO_TERMINAL"

    from servidor.diagnostics.executor import DiagnosticExecutorError

    def full(owner: str, request: object) -> JobSnapshot:
        raise DiagnosticExecutorError("FILA_CHEIA")

    executor.submit = full  # type: ignore[method-assign]
    response = client.post("/api/v1/diagnosticos", json=_payload(), headers=_auth())
    assert response.status_code == 429
    assert response.headers["retry-after"] == "1"
    assert response.json()["error"]["code"] == "FILA_CHEIA"


def test_corpo_maior_que_um_mib_e_resposta_invalida_sao_sanitizados(client_parts):
    """Pega leitura ilimitada e vazamento de payload interno em erro de serialização."""
    client, executor = client_parts
    oversized = client.post(
        "/api/v1/diagnosticos",
        content=b"x" * (1024 * 1024 + 1),
        headers={**_auth(), "Content-Type": "application/json"},
    )
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "LIMITE_EXCEDIDO"

    executor.result_value = {"payload_secreto": "nao-vazar"}
    invalid = client.get(f"/api/v1/diagnosticos/{JOB_ID}/resultado", headers=_auth())
    assert invalid.status_code == 500
    assert invalid.json()["error"]["code"] == "ERRO_INTERNO"
    assert "nao-vazar" not in invalid.text


def test_configuracao_valida_workers_entre_um_e_quatro():
    """Pega configuração que permita explosão de processos."""
    assert _settings(diagnostic_max_workers=1).diagnostic_max_workers == 1
    assert _settings(diagnostic_max_workers=4).diagnostic_max_workers == 4
    with pytest.raises(ValueError):
        _settings(diagnostic_max_workers=0)
    with pytest.raises(ValueError):
        _settings(diagnostic_max_workers=5)
