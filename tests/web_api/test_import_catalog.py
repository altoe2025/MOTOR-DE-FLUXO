from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from servidor.auth import AccessDenied, AuthenticatedUser, SessionInvalid
from servidor.catalogs.importacao import canonical_catalog_bytes, load_import_catalog
from servidor.config import Settings
from servidor.contracts.catalog import CatalogoImportacao

USER_ID = UUID("00000000-0000-4000-8000-000000000101")
CATALOG_PATH = (
    Path(__file__).parents[2] / "servidor" / "catalogs" / "importacao.v1.json"
)


def make_settings() -> Settings:
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


class AllowedVerifier:
    def verify(self, token: str) -> AuthenticatedUser:
        if token != "token-valido":
            raise SessionInvalid("token inválido")
        return AuthenticatedUser(USER_ID)


class DeniedVerifier:
    def verify(self, token: str) -> AuthenticatedUser:
        raise AccessDenied("usuário fora da allowlist")


def auth() -> dict[str, str]:
    return {"Authorization": "Bearer token-valido"}


def unconfigured_payload() -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "status": "NAO_CONFIGURADO",
        "publicado_em_utc": "2026-09-17T00:00:00Z",
        "finalidades": [],
        "custos_padrao": {
            "iof_out": "0.035",
            "iof_in": "0.0038",
            "carry_cnr": "0.0004",
            "spread_rail_bps": "25",
            "custo_fixo_remessa": "40",
            "custo_oportunidade_aa": "0",
            "ptax": "5.4",
            "iof_por_finalidade": [],
        },
        "custos_origem": {
            "tipo": "PADRAO_SINTETICO",
            "fonte": "Parâmetros técnicos não calibrados do simulador",
            "registrado_em_utc": "2026-09-17T00:00:00Z",
        },
        "custos_calibrados": False,
    }


def configured_payload() -> dict[str, Any]:
    payload = unconfigured_payload()
    payload["status"] = "CONFIGURADO"
    payload["finalidades"] = [
        {
            "codigo": "FINALIDADE_TESTE",
            "descricao": "Finalidade fictícia usada somente no teste",
            "aliquotas": [
                {"direcao": "OUT", "aliquota": "0.012300"},
                {"direcao": "IN", "aliquota": "0.004500"},
            ],
        }
    ]
    return payload


def write_catalog(tmp_path: Path, payload: dict[str, Any]) -> Path:
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def test_catalogo_de_producao_e_intencionalmente_nao_configurado():
    catalog = load_import_catalog(CATALOG_PATH)

    assert catalog.schema_version == "1.0.0"
    assert catalog.status == "NAO_CONFIGURADO"
    assert catalog.finalidades == []
    assert catalog.custos_calibrados is False
    assert catalog.custos_origem.tipo == "PADRAO_SINTETICO"


def test_loader_calcula_hash_deterministico_do_json_canonico(tmp_path):
    payload = unconfigured_payload()
    first = load_import_catalog(write_catalog(tmp_path, payload))
    second_path = tmp_path / "same-catalog.json"
    second_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=4, sort_keys=False),
        encoding="utf-8",
    )
    second = load_import_catalog(second_path)
    expected = hashlib.sha256(canonical_catalog_bytes(payload)).hexdigest()

    assert first.catalog_version == expected
    assert second.catalog_version == expected
    assert first == second


def test_catalog_version_do_arquivo_nao_e_aceito(tmp_path):
    payload = unconfigured_payload()
    payload["catalog_version"] = "0" * 64

    with pytest.raises((ValueError, ValidationError)):
        load_import_catalog(write_catalog(tmp_path, payload))


def test_loader_preserva_texto_decimal_sem_converter_para_float(tmp_path):
    catalog = load_import_catalog(write_catalog(tmp_path, configured_payload()))

    assert catalog.finalidades[0].aliquotas[0].aliquota == "0.012300"
    assert catalog.finalidades[0].aliquotas[1].aliquota == "0.004500"
    assert catalog.custos_padrao.iof_out == "0.035"
    assert catalog.custos_padrao.ptax == "5.4"


@pytest.mark.parametrize(
    "mutation",
    [
        "duplicate_code",
        "duplicate_direction",
        "unconfigured_with_purpose",
        "configured_without_purpose",
    ],
)
def test_contrato_rejeita_duplicidade_e_status_incoerente(mutation):
    payload = configured_payload()
    finalidades = payload["finalidades"]

    if mutation == "duplicate_code":
        finalidades.append(deepcopy(finalidades[0]))
    elif mutation == "duplicate_direction":
        finalidades[0]["aliquotas"][1]["direcao"] = "OUT"
    elif mutation == "unconfigured_with_purpose":
        payload["status"] = "NAO_CONFIGURADO"
    elif mutation == "configured_without_purpose":
        payload["finalidades"] = []

    with pytest.raises(ValidationError):
        CatalogoImportacao.model_validate(
            {**payload, "catalog_version": "a" * 64}
        )


def test_loader_falha_com_arquivo_ausente_ou_corrompido(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_import_catalog(tmp_path / "missing.json")

    corrupt = tmp_path / "corrupt.json"
    corrupt.write_text("{", encoding="utf-8")
    with pytest.raises(ValueError):
        load_import_catalog(corrupt)


def test_falha_do_catalogo_impede_startup(monkeypatch):
    from servidor.app import create_app

    def fail_loading():
        raise ValueError("catálogo inválido")

    monkeypatch.setattr("servidor.app.load_import_catalog", fail_loading)
    app = create_app(make_settings(), AllowedVerifier())

    with pytest.raises(ValueError, match="catálogo inválido"), TestClient(app):
        pass


def test_rota_exige_token_e_rejeita_usuario_fora_da_allowlist():
    from servidor.app import create_app

    catalog = load_import_catalog(CATALOG_PATH)
    with TestClient(
        create_app(make_settings(), AllowedVerifier(), import_catalog=catalog),
        raise_server_exceptions=False,
    ) as client:
        unauthorized = client.get("/api/v1/catalogos/importacao")
    with TestClient(
        create_app(make_settings(), DeniedVerifier(), import_catalog=catalog),
        raise_server_exceptions=False,
    ) as client:
        forbidden = client.get("/api/v1/catalogos/importacao", headers=auth())

    assert unauthorized.status_code == 401
    assert unauthorized.headers["cache-control"] == "no-store"
    assert forbidden.status_code == 403
    assert forbidden.headers["cache-control"] == "no-store"


def test_rota_retorna_catalogo_estavel_sem_dados_do_usuario():
    from servidor.app import create_app

    catalog = load_import_catalog(CATALOG_PATH)
    with TestClient(
        create_app(make_settings(), AllowedVerifier(), import_catalog=catalog)
    ) as client:
        first = client.get("/api/v1/catalogos/importacao", headers=auth())
        second = client.get("/api/v1/catalogos/importacao", headers=auth())

    assert first.status_code == 200
    assert first.headers["cache-control"] == "no-store"
    assert first.json() == second.json() == catalog.model_dump(mode="json")
    assert str(USER_ID) not in first.text
    assert set(first.json()) == {
        "schema_version",
        "catalog_version",
        "status",
        "publicado_em_utc",
        "finalidades",
        "custos_padrao",
        "custos_origem",
        "custos_calibrados",
    }


def test_rota_aceita_catalogo_ficticio_com_duas_direcoes(tmp_path):
    from servidor.app import create_app

    catalog = load_import_catalog(write_catalog(tmp_path, configured_payload()))
    with TestClient(
        create_app(make_settings(), AllowedVerifier(), import_catalog=catalog)
    ) as client:
        response = client.get("/api/v1/catalogos/importacao", headers=auth())

    assert response.status_code == 200
    assert response.json()["status"] == "CONFIGURADO"
    assert response.json()["finalidades"][0]["aliquotas"] == [
        {"direcao": "OUT", "aliquota": "0.012300"},
        {"direcao": "IN", "aliquota": "0.004500"},
    ]


def test_rota_nao_oferece_post_ou_put():
    from servidor.app import create_app

    catalog = load_import_catalog(CATALOG_PATH)
    with TestClient(
        create_app(make_settings(), AllowedVerifier(), import_catalog=catalog),
        raise_server_exceptions=False,
    ) as client:
        post = client.post("/api/v1/catalogos/importacao", headers=auth(), json={})
        put = client.put("/api/v1/catalogos/importacao", headers=auth(), json={})

    assert post.status_code == 404
    assert put.status_code == 404
