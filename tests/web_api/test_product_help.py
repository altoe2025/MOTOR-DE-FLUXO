"""Contrato HTTP e integridade do catálogo versionado de ajuda."""

from __future__ import annotations

import hashlib
import importlib
import json
import re
from pathlib import Path

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
    "page.quadro",
    "page.apresentacao",
    "page.relatorio",
    "page.chat",
}

INTERFACE_CONTROLS = [
    ("control.importacao.ler", "Ler planilha", "/importar"),
    ("control.importacao.confirmar", "Confirmar Caso Observado", "/importar"),
    ("control.empresa.excluir", "Excluir", "/empresas"),
    ("control.estudos.novo", "Novo estudo", "/estudos"),
    ("control.estudos.nova-combinacao", "Nova combinação de carteiras", "/estudos"),
    ("control.estudos.importar", "Importar estudo", "/estudos"),
    ("control.estudos.exportar", "Exportar", "/estudos"),
    ("control.estudos.criar-caso", "Criar estudo", "/estudos"),
    ("control.estudos.criar-carteira", "Criar carteira", "/estudos"),
    ("control.estudos.criar-gerada", "Criar com carteira gerada", "/estudos"),
    ("control.carteira.trocar-origem", "Trocar origem", "/carteira/:id"),
    ("control.carteira.diagnosticar-combinacoes", "Diagnosticar combinações", "/carteira/:id"),
    ("control.alavancas.aplicar-carteira", "Aplicar à carteira", "/carteira/:id"),
    ("control.diagnostico.combinacoes", "Diagnosticar combinações", "/estudos/:studyId/diagnostico"),
    ("control.diagnostico.cancelar-lote", "Cancelar lote", "/estudos/:studyId/diagnostico"),
    ("control.diagnostico.mostrar-quadros", "Abrir quadros comparativos", "/estudos/:studyId/diagnostico"),
    ("control.importacao.modelo", "Baixar modelo (.xlsx)", "/importar"),
    ("control.importacao.analisar-caso", "Analisar este caso", "/importar"),
    ("control.importacao.adicionar-carteira", "Adicionar a uma carteira", "/importar"),
    ("control.importacao.confirmar-adicao", "Adicionar e abrir o estudo", "/importar"),
    ("control.carteira.executar", "Executar cenário atual", "/carteira/:id"),
    ("control.carteira.referencia", "Executar exemplo de referência", "/carteira"),
    ("control.composicao.editar", "Criar hipótese / alterar carteira", "/carteira/:id"),
    ("control.alavancas.criar", "Criar variação", "/carteira/:id"),
    ("control.diagnostico.rodar-todas", "Rodar todas", "/estudos/:studyId/diagnostico"),
    ("control.comparacao.comparar", "Comparar", "/comparar"),
    ("control.quadro.limpar", "Limpar quadro", "/quadro"),
    ("control.replay.proximo-fechamento", "Próximo fechamento", "/estudos/:studyId/replay"),
    ("control.apresentacao.pdf", "Salvar PDF", "/estudos/:studyId/apresentacao"),
    ("control.chat.enviar", "Enviar", "/:route"),
]


@pytest.mark.parametrize("help_id,label,route", INTERFACE_CONTROLS)
def test_controle_real_consultavel_sem_documento_financeiro(help_id, label, route):
    from servidor.catalogs.product_help import load_product_help_catalog
    from servidor.chat.tools import ReadOnlyTools
    from servidor.contracts.chat import ChatCitation, ChatRequestV1
    from tests.web_api.test_chat_contracts import payload

    registry = ReadOnlyTools(ChatRequestV1.model_validate(payload(False)), load_product_help_catalog())
    assert registry.study_document() is None
    result = registry.execute("consultar_interface", json.dumps({"helpId": help_id}))

    assert result["available"] is True
    assert result["data"]["label"] == label
    assert result["data"]["routePattern"] == route
    assert result["data"]["elementKind"] == "CONTROL"
    assert result["citations"] == [{"kind": "HELP", "id": help_id}]
    registry.validate_references([ChatCitation(kind="HELP", id=help_id)], [], served_only=True)


def test_ids_publicados_pelo_frontend_resolvem_no_catalogo_real(product_help_client):
    frontend = Path(__file__).resolve().parents[2] / "web/src/help/helpIds.ts"
    help_ids = re.findall(r"^\s+[A-Z_]+:\s*'([^']+)'", frontend.read_text(encoding="utf-8"), re.MULTILINE)
    items = product_help_client.get("/api/v1/catalogos/ajuda", headers=auth()).json()["items"]
    published = {item["id"] for item in items}

    assert len(help_ids) == len(set(help_ids))
    assert set(help_ids) == published
    assert {help_id for help_id, _, _ in INTERFACE_CONTROLS} <= set(help_ids)


def test_condicoes_de_bloqueio_nao_exigem_simulacao_para_ajuda(product_help_client):
    items = {item["id"]: item for item in product_help_client.get(
        "/api/v1/catalogos/ajuda", headers=auth(),
    ).json()["items"]}

    assert "arquivo" in " ".join(items["control.importacao.ler"]["disabledWhen"]).lower()
    assert "diagnóstico atual" in " ".join(items["control.diagnostico.rodar-todas"]["disabledWhen"])
    assert items["control.apresentacao.pdf"]["disabledWhen"] == []
    assert "impressão" in items["control.apresentacao.pdf"]["changes"]
    assert "desfaz" in items["control.chat.cancelar-envio"]["doesNotChange"]


def test_ajuda_do_front_atual_distingue_estudo_comum_combinacao_e_resultado(product_help_client):
    items = {item["id"]: item for item in product_help_client.get(
        "/api/v1/catalogos/ajuda", headers=auth(),
    ).json()["items"]}

    assert "escolha da origem" in items["control.estudos.novo"]["purpose"]
    assert "não cria" in items["control.estudos.novo"]["doesNotChange"].lower()
    assert "separado" in items["control.estudos.nova-combinacao"]["purpose"]
    assert "não gera nem diagnostica" in items["control.estudos.nova-combinacao"]["doesNotChange"].lower()
    assert "carteira-base" in items["control.alavancas.aplicar-carteira"]["changes"]
    assert "reaproveita" in items["control.diagnostico.combinacoes"]["changes"]
    assert "não executa" in items["control.diagnostico.cancelar-lote"]["doesNotChange"].lower()


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


def test_catalogo_com_mais_de_200_itens_preserva_ajuda_existente(tmp_path):
    from servidor.catalogs.product_help import load_product_help_catalog

    source = Path(__file__).resolve().parents[2] / "servidor/catalogs/product_help.v1.json"
    document = json.loads(source.read_text(encoding="utf-8"))
    document["items"] = document["items"][:200]
    document["items"].append({
        **document["items"][0], "id": "page.ajuda-adicional",
        "relatedConceptIds": [],
    })
    path = tmp_path / "extended-product-help.json"
    path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")

    catalog = load_product_help_catalog(path)

    assert len(catalog.items) == 201
    assert catalog.items[0].id == document["items"][0]["id"]


def test_ajuda_importacao_explica_finalidade_opcional_e_fallback(product_help_client):
    response = product_help_client.get("/api/v1/catalogos/ajuda", headers=auth())
    item = next(item for item in response.json()["items"] if item["id"] == "page.importacao")

    assert "finalidade_codigo é opcional" in item["purpose"]
    assert "IOF padrão por direção" in item["changes"]
    assert "combinação exata de finalidade e direção" in item["changes"]
    assert "não infere classificação" in item["doesNotChange"]
    assert all("finalidade" not in reason.lower() and "catálogo" not in reason.lower()
               for reason in item["disabledWhen"])


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


@pytest.mark.parametrize("missing_field", ["disabledWhen", "recovery", "relatedConceptIds"])
def test_loader_rejeita_campo_de_operacao_obrigatorio_ausente(tmp_path, missing_field):
    catalogs = importlib.import_module("servidor.catalogs.product_help")
    item = {
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
    }
    del item[missing_field]
    path = tmp_path / "product-help.json"
    path.write_text(
        json.dumps({"apiVersion": "1.0.0", "items": [item]}, ensure_ascii=False),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match=missing_field):
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
