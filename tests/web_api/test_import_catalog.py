"""Contrato HTTP do catálogo técnico da importação."""

import hashlib
import importlib
import json

import pytest
from fastapi.testclient import TestClient

from tests.web_api.test_http import FakeVerifier, auth, make_settings


@pytest.fixture
def catalog_client():
    from servidor.app import create_app

    with TestClient(create_app(make_settings(), FakeVerifier())) as client:
        yield client


def test_catalogo_autenticado_publica_estado_nao_configurado(catalog_client):
    response = catalog_client.get("/api/v1/catalogos/importacao", headers=auth())

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["schema_version"] == "1.0.0"
    assert len(response.json()["catalog_version"]) == 64
    assert response.json()["status"] == "NAO_CONFIGURADO"
    assert response.json()["finalidades"] == []
    assert response.json()["custos_calibrados"] is False


def test_catalogo_exige_bearer(catalog_client):
    response = catalog_client.get("/api/v1/catalogos/importacao")

    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["www-authenticate"] == "Bearer"


def test_catalogo_empacotado_e_nao_configurado_sem_finalidades_inventadas():
    catalogs = importlib.import_module("servidor.catalogs.importacao")

    catalog = catalogs.load_import_catalog()

    assert catalog.schema_version == "1.0.0"
    assert catalog.status == "NAO_CONFIGURADO"
    assert catalog.finalidades == []
    assert catalog.custos_calibrados is False
    assert catalog.custos_origem.tipo == "PADRAO_SINTETICO"


def test_loader_injeta_hash_do_json_canonico_e_recusa_hash_fornecido(tmp_path):
    catalogs = importlib.import_module("servidor.catalogs.importacao")
    payload = {
        "schema_version": "1.0.0",
        "status": "NAO_CONFIGURADO",
        "publicado_em_utc": "2026-09-23T00:00:00Z",
        "finalidades": [],
        "custos_padrao": {
            "iof_out": "0.035", "iof_in": "0.0038", "carry_cnr": "0.0004",
            "spread_rail_bps": "25", "custo_fixo_remessa": "40",
            "custo_oportunidade_aa": "0", "ptax": "5.4", "iof_por_finalidade": [],
        },
        "custos_origem": {
            "tipo": "PADRAO_SINTETICO",
            "fonte": "Parâmetros técnicos sintéticos não calibrados",
            "registrado_em_utc": "2026-09-23T00:00:00Z",
        },
        "custos_calibrados": False,
    }
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    catalog = catalogs.load_import_catalog(path)

    canonical = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")
    assert catalog.catalog_version == hashlib.sha256(canonical).hexdigest()
    path.write_text(json.dumps({**payload, "catalog_version": "0" * 64}), encoding="utf-8")
    with pytest.raises(ValueError, match="catalog_version"):
        catalogs.load_import_catalog(path)


def test_catalogo_invalido_impede_inicio_da_aplicacao(monkeypatch):
    from servidor.app import create_app
    def fail_loading():
        raise ValueError("catálogo inválido")

    monkeypatch.setattr("servidor.app.load_import_catalog", fail_loading, raising=False)
    with pytest.raises(ValueError, match="catálogo inválido"), TestClient(
        create_app(make_settings(), FakeVerifier())
    ):
        pass


def test_schema_publico_documenta_catalogo_autenticado():
    from servidor.app import create_schema_app

    operation = create_schema_app().openapi()["paths"]["/api/v1/catalogos/importacao"]["get"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/CatalogoImportacao"
    }
