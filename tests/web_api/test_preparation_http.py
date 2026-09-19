"""Integração HTTP real da preparação canônica de carteiras."""

from __future__ import annotations

from copy import deepcopy
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from servidor.auth import AuthenticatedUser, SessionInvalid
from servidor.config import Settings

USER_ID = UUID("00000000-0000-4000-8000-000000000101")
PARTICIPANT_ID = "00000000-0000-4000-8000-000000000013"


class Verifier:
    def verify(self, token: str) -> AuthenticatedUser:
        if token != "token-valido":
            raise SessionInvalid("token inválido")
        return AuthenticatedUser(USER_ID)


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


@pytest.fixture
def app_client():
    from servidor.app import create_app

    with TestClient(
        create_app(_settings(), Verifier()), raise_server_exceptions=False
    ) as client:
        yield client


def _source() -> dict[str, object]:
    return {
        "kind": "PADRAO_SINTETICO",
        "source": "Fixture sintética MOT-25",
        "recorded_at": "2026-09-19T00:00:00Z",
    }


def _payload() -> dict[str, object]:
    participant_prefix = f"/participants/{PARTICIPANT_ID}"
    paths = {
        "/warmup_days",
        "/measurement_days",
        "/window_days",
        "/costs/iof_out",
        "/costs/iof_in",
        "/costs/carry_cnr",
        "/costs/spread_rail_bps",
        "/costs/custo_fixo_remessa",
        "/costs/custo_oportunidade_aa",
        "/costs/ptax",
        f"{participant_prefix}/profile",
        f"{participant_prefix}/seed",
        f"{participant_prefix}/monthly_volume_brl",
        f"{participant_prefix}/ticket_median_brl",
        f"{participant_prefix}/out_fraction",
        f"{participant_prefix}/deadline/mode",
        f"{participant_prefix}/deadline/days",
        f"{participant_prefix}/eh_efx",
        f"{participant_prefix}/purpose_out",
        f"{participant_prefix}/purpose_in",
    }
    return {
        "preparation_version": "1.0.0",
        "request_id": "00000000-0000-4000-8000-000000000010",
        "study_id": "00000000-0000-4000-8000-000000000011",
        "scenario_id": "00000000-0000-4000-8000-000000000012",
        "scenario_revision": 1,
        "expected_build_sha": "a" * 40,
        "input": {
            "participants": [
                {
                    "id": PARTICIPANT_ID,
                    "profile": "remessa_outbound_massiva",
                    "seed": "1",
                    "monthly_volume_brl": "10000",
                    "ticket_median_brl": "1000",
                    "out_fraction": "0.5",
                    "deadline": {"mode": "FIXED", "days": 7},
                    "eh_efx": True,
                    "purpose_out": "ANEXO_V_REMESSA_TERCEIRO",
                    "purpose_in": "ANEXO_V_DISPONIBILIDADE",
                }
            ],
            "warmup_days": 0,
            "measurement_days": 30,
            "window_days": 7,
            "costs": {
                "iof_out": "0.035",
                "iof_in": "0.0038",
                "carry_cnr": "0.0004",
                "spread_rail_bps": "0",
                "custo_fixo_remessa": "0",
                "custo_oportunidade_aa": "0",
                "ptax": "5.40",
                "iof_por_finalidade": [],
            },
            "sources": {path: _source() for path in paths},
        },
    }


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer token-valido"}


def test_preparacao_autenticada_usa_gerador_oficial_e_retorna_ordens_canonicas(
    app_client,
):
    """A regressão pega uma rota que publique DTO sem passar pelo gerador do motor."""
    response = app_client.post("/api/v1/preparacoes", json=_payload(), headers=_auth())

    assert response.status_code == 200
    document = response.json()
    assert document["preparation_version"] == "1.0.0"
    assert document["motor_build_sha"] == "a" * 40
    assert document["generator_version"] == "dimensionamento-v1"
    assert "result" not in document
    assert document["parameters"] == [
        {
            "participant_id": PARTICIPANT_ID,
            "sigma": "0.6",
            "cadence_monthly": "8.352702114113",
            "expected_period_brl": "10000.000000",
            "deadline_min": 7,
            "deadline_max": 7,
        }
    ]
    assert document["orders"] == sorted(document["orders"], key=lambda order: order["id"])
    assert all(order["cliente_id"] == PARTICIPANT_ID for order in document["orders"])
    assert document["composition"][-1]["participant_id"] is None
    assert document["composition"][-1]["order_count"] == len(document["orders"])
    assert set(document["derived_provenance"][f"/orders/{PARTICIPANT_ID}"]["inputs"]) == {
        f"/participants/{PARTICIPANT_ID}/profile",
        f"/participants/{PARTICIPANT_ID}/seed",
        f"/participants/{PARTICIPANT_ID}/monthly_volume_brl",
        f"/participants/{PARTICIPANT_ID}/ticket_median_brl",
        f"/participants/{PARTICIPANT_ID}/out_fraction",
        f"/participants/{PARTICIPANT_ID}/deadline/mode",
        f"/participants/{PARTICIPANT_ID}/deadline/days",
        f"/participants/{PARTICIPANT_ID}/eh_efx",
        f"/participants/{PARTICIPANT_ID}/purpose_out",
        f"/participants/{PARTICIPANT_ID}/purpose_in",
        "/warmup_days",
        "/measurement_days",
    }


def test_preparacao_repetida_preserva_resultado_gerativo_e_fingerprint(app_client):
    """A regressão pega seed ignorada, ordenação instável ou fingerprint temporal."""
    first = app_client.post("/api/v1/preparacoes", json=_payload(), headers=_auth())
    second = app_client.post("/api/v1/preparacoes", json=_payload(), headers=_auth())

    assert first.status_code == second.status_code == 200
    first_document = first.json()
    second_document = second.json()
    for field in (
        "generation_fingerprint",
        "input_snapshot",
        "orders",
        "parameters",
        "composition",
        "derived_provenance",
    ):
        assert first_document[field] == second_document[field]


def test_preparacao_exige_bearer_antes_de_ler_payload(app_client):
    """A regressão pega uma preparação que seria exposta sem autenticação real."""
    response = app_client.post(
        "/api/v1/preparacoes",
        content=b"{",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "SESSAO_INVALIDA"


def test_preparacao_rejeita_build_diferente_sem_gerar(app_client):
    """A regressão pega reuso de ordens criadas contra uma versão diferente do motor."""
    payload = _payload()
    payload["expected_build_sha"] = "b" * 40

    response = app_client.post("/api/v1/preparacoes", json=payload, headers=_auth())

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "VERSAO_INCOMPATIVEL"


def test_preparacao_rejeita_cadencia_que_excederia_limite_sem_sortear(app_client):
    """A regressão pega geração desprotegida que pode criar milhões de ordens."""
    payload = _payload()
    payload["input"]["participants"][0]["monthly_volume_brl"] = "1000000"  # type: ignore[index]

    response = app_client.post("/api/v1/preparacoes", json=payload, headers=_auth())

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "LIMITE_EXCEDIDO"


def test_preparacao_rejeita_extra_na_fronteira_http(app_client):
    """A regressão pega uma rota que deixe o FastAPI aceitar campos extras do JSON."""
    payload = deepcopy(_payload())
    payload["input"]["participants"][0]["injetado"] = True  # type: ignore[index]

    response = app_client.post("/api/v1/preparacoes", json=payload, headers=_auth())

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ENTRADA_INVALIDA"


def test_openapi_publicado_declara_preparacao_real():
    """A regressão pega a rota integrada mas ausente do contrato gerado."""
    from servidor.app import create_schema_app

    operation = create_schema_app().openapi()["paths"]["/api/v1/preparacoes"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert operation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/PreparationRequest"
    }
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/PreparationResponse"
    }
