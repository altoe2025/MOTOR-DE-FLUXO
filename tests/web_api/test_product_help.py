"""Contrato HTTP e integridade do catálogo versionado de ajuda."""

from __future__ import annotations

import hashlib
import importlib
import json

import pytest
from fastapi.testclient import TestClient

from tests.web_api.test_http import FakeVerifier, auth, make_settings


REQUIRED_HELP_IDS = {
    "page.importacao",
    "concept.empresa",
    "concept.caso",
    "concept.perfil",
    "concept.participante",
    "concept.arquetipo",
    "concept.composicao",
    "concept.mix-demonstrativo",
    "concept.seed",
    "concept.repeticao",
    "concept.repeticao-representativa",
    "concept.replay",
    "page.diagnostico",
    "page.comparacao",
    "page.apresentacao",
    "page.relatorio",
    "page.chat",
}


@pytest.fixture
def product_help_client():
    from servidor.app import create_app

    with TestClient(create_app(make_settings(), FakeVerifier())) as client:
        yield client


def test_catalogo_de_ajuda_autenticado_publica_conteudo_versionado(product_help_client):
    response = product_help_client.get("/api/v1/catalogos/ajuda", headers=auth())

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    document = response.json()
    assert document["apiVersion"] == "1.0.0"
    assert len(document["catalogVersion"]) == 64
    items = {item["id"]: item for item in document["items"]}
    assert REQUIRED_HELP_IDS <= set(items)
    for item in items.values():
        assert item["purpose"].strip()
        assert item["changes"].strip()
        assert item["doesNotChange"].strip()
        assert isinstance(item["disabledWhen"], list)
        assert isinstance(item["recovery"], list)
        assert set(item["relatedConceptIds"]) <= set(items)


def test_catalogo_de_ajuda_exige_bearer(product_help_client):
    response = product_help_client.get("/api/v1/catalogos/ajuda")

    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["www-authenticate"] == "Bearer"


def test_loader_calcula_versao_canonica_e_recusa_versao_fornecida(tmp_path):
    catalogs = importlib.import_module("servidor.catalogs.product_help")
    payload = {
        "apiVersion": "1.0.0",
        "items": [{
            "id": "page.importacao",
            "routePattern": "/importar",
            "elementKind": "PAGE",
            "label": "Importar",
            "purpose": "Revisar uma planilha antes da confirmação.",
            "changes": "Prepara uma revisão local.",
            "doesNotChange": "Não confirma automaticamente um Caso.",
            "disabledWhen": [],
            "recovery": [],
            "relatedConceptIds": [],
        }],
    }
    path = tmp_path / "product-help.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    catalog = catalogs.load_product_help_catalog(path)

    canonical = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")
    assert catalog.catalogVersion == hashlib.sha256(canonical).hexdigest()
    path.write_text(
        json.dumps({**payload, "catalogVersion": "0" * 64}), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="catalogVersion"):
        catalogs.load_product_help_catalog(path)


def test_catalogo_invalido_impede_inicio_da_aplicacao(monkeypatch):
    from servidor.app import create_app

    def fail_loading():
        raise ValueError("catálogo de ajuda inválido")

    monkeypatch.setattr(
        "servidor.app.load_product_help_catalog", fail_loading, raising=False
    )
    with pytest.raises(ValueError, match="catálogo de ajuda inválido"), TestClient(
        create_app(make_settings(), FakeVerifier())
    ):
        pass


def test_schema_publico_documenta_catalogo_de_ajuda_autenticado():
    from servidor.app import create_schema_app

    operation = create_schema_app().openapi()["paths"]["/api/v1/catalogos/ajuda"]["get"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ProductHelpCatalogV1"
    }
