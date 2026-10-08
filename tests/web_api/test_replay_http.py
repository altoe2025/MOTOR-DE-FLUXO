from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from servidor.app import create_app
from servidor.auth import AuthenticatedUser, SessionInvalid
from servidor.config import Settings
from tests.web_api.test_replay import replay_request

USER_ID = UUID("00000000-0000-4000-8000-000000000101")


class Verifier:
    def verify(self, token: str) -> AuthenticatedUser:
        if token != "valid-token":
            raise SessionInvalid("token inválido")
        return AuthenticatedUser(USER_ID)


class ExpiredExecutor:
    def close(self) -> None:
        pass


def _settings() -> Settings:
    return Settings.model_validate(
        {
            "app_env": "test",
            "supabase_url": "https://projeto.supabase.co",
            "supabase_jwt_issuer": "https://projeto.supabase.co/auth/v1",
            "supabase_jwt_audience": "authenticated",
            "supabase_allowed_user_ids": frozenset({USER_ID}),
            "motor_build_sha": "a" * 40,
        }
    )


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer valid-token"}


def test_endpoint_estateless_constroi_replay_sem_job_no_executor():
    payload = replay_request().model_dump(mode="json")
    with TestClient(
        create_app(_settings(), Verifier(), diagnostic_executor=ExpiredExecutor()),
        raise_server_exceptions=False,
    ) as client:
        unauthorized = client.post("/api/v1/replays", json=payload)
        response = client.post("/api/v1/replays", json=payload, headers=_auth())

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["diagnostic_execution_id"] == payload["diagnostic_execution_id"]


def test_endpoint_rejeita_resultado_temporal_inconsistente_sem_publicar_parcial():
    payload = replay_request().model_dump(mode="json")
    allocation = payload["diagnostic_envelope"]["selected_execution"]["result"][
        "agregado"
    ]["execucao_completa"]["ciclos"][0]["alocacoes"][0]
    allocation["valor_brl"] = "1"
    with TestClient(
        create_app(_settings(), Verifier(), diagnostic_executor=ExpiredExecutor()),
        raise_server_exceptions=False,
    ) as client:
        response = client.post("/api/v1/replays", json=payload, headers=_auth())

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "REPLAY_INCONSISTENTE"
    assert "days" not in response.json()


def test_endpoint_rejeita_versao_futura_antes_do_builder():
    payload = replay_request().model_dump(mode="json")
    payload["api_version"] = "2.0.0"
    with TestClient(
        create_app(_settings(), Verifier(), diagnostic_executor=ExpiredExecutor()),
        raise_server_exceptions=False,
    ) as client:
        response = client.post("/api/v1/replays", json=payload, headers=_auth())

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "VERSAO_INCOMPATIVEL"

