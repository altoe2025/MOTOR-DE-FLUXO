from __future__ import annotations

import json
import threading
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from servidor.auth import (
    AccessDenied,
    AuthenticatedUser,
    AuthUnavailable,
    SessionInvalid,
)
from servidor.config import Settings
from servidor.contracts.preview import PreviewEnvelope
from servidor.publication import ResultadoInvalido

USER_ID = UUID("00000000-0000-4000-8000-000000000101")


class FakeVerifier:
    def verify(self, token: str) -> AuthenticatedUser:
        if token != "token-valido":
            raise SessionInvalid("inválido")
        return AuthenticatedUser(USER_ID)


def make_settings(tmp_path: Path | None = None) -> Settings:
    return Settings.model_validate(
        {
            "app_env": "test",
            "supabase_url": "https://projeto.supabase.co",
            "supabase_jwt_issuer": "https://projeto.supabase.co/auth/v1",
            "supabase_jwt_audience": "authenticated",
            "supabase_allowed_user_ids": frozenset({USER_ID}),
            "motor_build_sha": "a" * 40,
            "web_dist_dir": tmp_path,
        }
    )


@pytest.fixture
def app_client():
    from servidor.app import create_app

    with TestClient(
        create_app(make_settings(), FakeVerifier()), raise_server_exceptions=False
    ) as client:
        yield client


def auth() -> dict[str, str]:
    return {"Authorization": "Bearer token-valido"}


def test_health_e_publico_e_session_confirma_usuario(app_client):
    assert app_client.get("/api/v1/health").json() == {"status": "ok"}

    sem_token = app_client.get("/api/v1/session")
    sessao = app_client.get("/api/v1/session", headers=auth())

    assert sem_token.status_code == 401
    assert sem_token.headers["www-authenticate"] == "Bearer"
    assert sem_token.headers["cache-control"] == "no-store"
    assert sessao.status_code == 200
    assert sessao.json() == {"user_id": str(USER_ID)}


def test_nao_autorizado_nao_chama_adaptador(app_client, reference_payload, monkeypatch):
    chamado = False

    def adapter(*args, **kwargs):
        nonlocal chamado
        chamado = True

    monkeypatch.setattr("servidor.routes.preview.executar_previa", adapter)

    response = app_client.post("/api/v1/previas", json=reference_payload)

    assert response.status_code == 401
    assert chamado is False

    malformed = app_client.post(
        "/api/v1/previas",
        content=b"{",
        headers={"Content-Type": "application/json"},
    )
    assert malformed.status_code == 401


def test_exemplo_privado_vem_da_fixture_real(app_client):
    response = app_client.get("/api/v1/examples/reference", headers=auth())

    assert response.status_code == 200
    assert response.json()["cenario"]["ordens"][0]["id"] == "astropay-1"
    assert set(response.json()) == {"cenario", "periodo", "proveniencia"}


def test_post_executa_adaptador_real(app_client, reference_payload):
    response = app_client.post(
        "/api/v1/previas", json=reference_payload, headers=auth()
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["result"]["agregado"]["economia_periodo_brl"] == (
        "1026000.000000"
    )


def test_json_versao_e_entrada_tem_codigos_distintos(app_client, reference_payload):
    invalid_json = app_client.post(
        "/api/v1/previas",
        content=b"{",
        headers={**auth(), "Content-Type": "application/json"},
    )
    reference_payload["api_version"] = "2.0.0"
    incompatible = app_client.post(
        "/api/v1/previas", json=reference_payload, headers=auth()
    )
    reference_payload.pop("api_version")
    missing = app_client.post("/api/v1/previas", json=reference_payload, headers=auth())

    assert invalid_json.status_code == 400
    assert invalid_json.json()["error"]["code"] == "JSON_INVALIDO"
    assert incompatible.status_code == 409
    assert incompatible.json()["error"]["code"] == "VERSAO_INCOMPATIVEL"
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "ENTRADA_INVALIDA"
    assert "input" not in json.dumps(missing.json())


def test_corpo_maior_que_um_mib_e_rejeitado_antes_do_json(app_client):
    response = app_client.post(
        "/api/v1/previas",
        content=b"x" * (1024 * 1024 + 1),
        headers={**auth(), "Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "LIMITE_EXCEDIDO"


def test_corpo_chunked_maior_que_um_mib_e_rejeitado(app_client):
    def chunks():
        yield b"x" * (600 * 1024)
        yield b"x" * (600 * 1024)

    response = app_client.post(
        "/api/v1/previas",
        content=chunks(),
        headers={**auth(), "Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "LIMITE_EXCEDIDO"


def test_mais_de_mil_ordens_retorna_entrada_invalida(
    app_client, reference_payload,
):
    original = reference_payload["cenario"]["ordens"][0]
    reference_payload["cenario"]["ordens"] = [
        {**original, "id": f"ordem-{index}"} for index in range(1001)
    ]

    response = app_client.post(
        "/api/v1/previas", json=reference_payload, headers=auth()
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ENTRADA_INVALIDA"
    assert response.json()["error"]["fields"][0]["path"] == "/cenario/ordens"


def test_slot_retorna_429_sem_bloquear_health(
    app_client, reference_payload, monkeypatch,
):
    entrou = threading.Event()
    liberar = threading.Event()
    envelope = PreviewEnvelope.model_validate_json(
        Path("contracts/fixtures/reference-result.json").read_text(encoding="utf-8")
    )

    def adapter(*args, **kwargs):
        entrou.set()
        liberar.wait(timeout=5)
        return envelope

    monkeypatch.setattr("servidor.routes.preview.executar_previa", adapter)
    respostas: list[object] = []
    primeira = threading.Thread(
        target=lambda: respostas.append(
            app_client.post("/api/v1/previas", json=reference_payload, headers=auth())
        )
    )
    primeira.start()
    assert entrou.wait(timeout=5)

    ocupada = app_client.post(
        "/api/v1/previas", json=reference_payload, headers=auth()
    )
    health = app_client.get("/api/v1/health")
    liberar.set()
    primeira.join(timeout=5)

    assert ocupada.status_code == 429
    assert ocupada.headers["retry-after"] == "1"
    assert health.status_code == 200
    assert respostas[0].status_code == 200


def test_slot_e_liberado_depois_de_erro(app_client, reference_payload, monkeypatch):
    envelope = PreviewEnvelope.model_validate_json(
        Path("contracts/fixtures/reference-result.json").read_text(encoding="utf-8")
    )
    chamadas = 0

    def adapter(*args, **kwargs):
        nonlocal chamadas
        chamadas += 1
        if chamadas == 1:
            raise RuntimeError("detalhe interno secreto")
        return envelope

    monkeypatch.setattr("servidor.routes.preview.executar_previa", adapter)

    primeira = app_client.post(
        "/api/v1/previas", json=reference_payload, headers=auth()
    )
    segunda = app_client.post(
        "/api/v1/previas", json=reference_payload, headers=auth()
    )

    assert primeira.status_code == 500
    assert "secreto" not in primeira.text
    assert segunda.status_code == 200


def test_resposta_maior_que_oito_mib_nao_e_truncada(
    app_client, reference_payload, monkeypatch,
):
    class HugeEnvelope:
        def model_dump_json(self) -> str:
            return '"' + "x" * (8 * 1024 * 1024) + '"'

    monkeypatch.setattr(
        "servidor.routes.preview.executar_previa", lambda *args, **kwargs: HugeEnvelope()
    )

    response = app_client.post(
        "/api/v1/previas", json=reference_payload, headers=auth()
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "RESULTADO_EXCEDE_LIMITE"


def test_resultado_invalido_vira_500_sanitizado(
    app_client, reference_payload, monkeypatch,
):
    def adapter(*args, **kwargs):
        raise ResultadoInvalido("RESULTADO_INVALIDO: detalhe interno")

    monkeypatch.setattr("servidor.routes.preview.executar_previa", adapter)

    response = app_client.post(
        "/api/v1/previas", json=reference_payload, headers=auth()
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "RESULTADO_INVALIDO"
    assert "detalhe interno" not in response.text


def test_api_inexistente_retorna_json(app_client):
    response = app_client.get("/api/v1/inexistente")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["error"]["code"] == "RECURSO_NAO_ENCONTRADO"
    assert response.json()["error"]["request_id"] == response.headers["x-request-id"]


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (AccessDenied("fora da allowlist"), 403, "ACESSO_NAO_PERMITIDO"),
        (AuthUnavailable("jwks offline"), 503, "AUTH_INDISPONIVEL"),
    ],
)
def test_erros_de_autorizacao_sao_uniformes(error, status, code):
    from servidor.app import create_app

    class FailingVerifier:
        def verify(self, token: str) -> AuthenticatedUser:
            raise error

    with TestClient(
        create_app(make_settings(), FailingVerifier()), raise_server_exceptions=False
    ) as client:
        response = client.get("/api/v1/session", headers=auth())

    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert response.headers["cache-control"] == "no-store"


def test_log_nao_contem_token_query_ou_corpo(
    app_client, reference_payload, caplog,
):
    caplog.set_level("INFO", logger="servidor.http")

    response = app_client.post(
        "/api/v1/previas?token_hash=segredo-query",
        json=reference_payload,
        headers={"Authorization": "Bearer token-valido"},
    )

    assert response.status_code == 200
    logs = "\n".join(record.getMessage() for record in caplog.records)
    assert "token-valido" not in logs
    assert "segredo-query" not in logs
    assert "astropay-1" not in logs
    assert "path=/api/v1/previas" in logs
    assert "access-control-allow-origin" not in response.headers
