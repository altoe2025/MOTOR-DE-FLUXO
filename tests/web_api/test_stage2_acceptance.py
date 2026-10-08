"""Aceitação integrada da Etapa 2 contra API e motor reais locais."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.web_api.run_e2e import (
    CONTROLLED_TOKEN,
    CONTROLLED_TOKEN_B,
    CONTROLLED_USER_ID,
    CONTROLLED_USER_ID_B,
    build_e2e_app,
)


def _evidence(kind: str = "DADO_OBSERVADO") -> dict[str, str]:
    return {
        "tipo": kind,
        "fonte": "fixture anonimizada MOT-32",
        "registrado_em_utc": "2026-09-19T12:00:00Z",
    }


def _observed_request() -> dict[str, object]:
    evidence = _evidence()
    provenance = {
        "/horizonte_dias": evidence,
        "/janela_dias": evidence,
        "/custo/iof_out": evidence,
        "/custo/iof_in": evidence,
        "/custo/carry_cnr": evidence,
        "/custo/spread_rail_bps": evidence,
        "/custo/custo_fixo_remessa": evidence,
        "/custo/custo_oportunidade_aa": evidence,
        "/custo/ptax": evidence,
    }
    for field in (
        "dia_conhecida",
        "dia_limite",
        "eh_efx",
        "finalidade",
        "valor_brl",
    ):
        provenance[f"/ordens/0/{field}"] = evidence
    return {
        "api_version": "1.0.0",
        "request_id": "00000000-0000-4000-8000-000000000101",
        "study_id": "00000000-0000-4000-8000-000000000102",
        "scenario_id": "00000000-0000-4000-8000-000000000103",
        "scenario_revision": 1,
        "cenario": {
            "ordens": [
                {
                    "id": "observed-order-1",
                    "cliente_id": "client-anon",
                    "direcao": "OUT",
                    "dia_conhecida": 0,
                    "dia_limite": 2,
                    "valor_brl": "100",
                    "finalidade": "ANEXO_V_REMESSA_TERCEIRO",
                    "eh_efx": True,
                }
            ],
            "janela_dias": 7,
            "horizonte_dias": 30,
            "custo": {
                "iof_out": "0.035",
                "iof_in": "0.0038",
                "carry_cnr": "0.0004",
                "spread_rail_bps": "25",
                "custo_fixo_remessa": "40",
                "custo_oportunidade_aa": "0",
                "ptax": "5.40",
                "iof_por_finalidade": [],
            },
        },
        "periodo": {
            "modo": "NATURAL",
            "dias_aquecimento": 0,
            "periodo_medicao_dias": 30,
        },
        "proveniencia": provenance,
    }


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_observed_snapshot_executes_real_engine_without_raw_import_metadata():
    payload = _observed_request()
    serialized = str(payload)
    assert "sourceManifest" not in serialized
    assert ".xlsx" not in serialized

    with TestClient(build_e2e_app(), raise_server_exceptions=False) as client:
        response = client.post(
            "/api/v1/previas", json=payload, headers=_auth(CONTROLLED_TOKEN)
        )

    assert response.status_code == 200
    document = response.json()
    assert document["study_id"] == payload["study_id"]
    assert document["scenario_id"] == payload["scenario_id"]
    assert document["input_snapshot"]["cenario"]["ordens"] == payload["cenario"][
        "ordens"
    ]
    assert document["result"]["agregado"]["volume_bruto_periodo_brl"] == "100"


def test_controlled_two_account_acceptance_uses_distinct_subjects():
    with TestClient(build_e2e_app(), raise_server_exceptions=False) as client:
        account_a = client.get("/api/v1/session", headers=_auth(CONTROLLED_TOKEN))
        account_b = client.get("/api/v1/session", headers=_auth(CONTROLLED_TOKEN_B))

    assert account_a.json() == {"user_id": str(CONTROLLED_USER_ID)}
    assert account_b.json() == {"user_id": str(CONTROLLED_USER_ID_B)}
    assert account_a.json() != account_b.json()
