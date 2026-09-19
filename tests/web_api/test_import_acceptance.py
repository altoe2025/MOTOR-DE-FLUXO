from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from servidor.catalogs.importacao import load_import_catalog
from servidor.contracts.input import PreviaRequest
from servidor.motor_adapter import executar_previa

ROOT = Path(__file__).resolve().parents[2]
BUILD_SHA = "a" * 40
NOW = datetime(2026, 9, 19, 0, 0, tzinfo=UTC)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _observed() -> dict[str, str]:
    return {
        "tipo": "DADO_OBSERVADO",
        "fonte": "TESTE_FICTICIO: fixture XLSX de aceitação",
        "registrado_em_utc": "2026-09-19T00:00:00Z",
    }


def _balanced_request(reference_payload: dict[str, Any]) -> PreviaRequest:
    payload = deepcopy(reference_payload)
    first = deepcopy(payload["cenario"]["ordens"][0])
    second = deepcopy(payload["cenario"]["ordens"][1])
    client_id = "00000000-0000-4000-8000-000000000304"
    first.update(id="TESTE-OUT", cliente_id=client_id, direcao="OUT", valor_brl="100.00", dia_conhecida=0, dia_limite=0, eh_efx=False)
    second.update(id="TESTE-IN", cliente_id=client_id, direcao="IN", valor_brl="100.00", dia_conhecida=0, dia_limite=0, eh_efx=False)
    payload["cenario"]["ordens"] = [first, second]
    payload["cenario"]["horizonte_dias"] = 1
    payload["periodo"] = {"modo": "NATURAL", "dias_aquecimento": 0, "periodo_medicao_dias": 1}
    provenance = {key: value for key, value in payload["proveniencia"].items() if not key.startswith("/ordens/")}
    for index in range(2):
        for field in ("direcao", "dia_conhecida", "dia_limite", "valor_brl", "eh_efx", "finalidade"):
            provenance[f"/ordens/{index}/{field}"] = _observed()
    payload["proveniencia"] = provenance
    return PreviaRequest.model_validate(payload)


def test_catalogo_e2e_e_ficticio_e_producao_segue_bloqueado() -> None:
    fixture = load_import_catalog(ROOT / "web/e2e/fixtures/import-catalog.json")
    production = load_import_catalog()
    require(fixture.status == "CONFIGURADO", "fixture E2E deve habilitar somente a aceitação")
    require(all("TESTE_FICTICIO" in item.descricao for item in fixture.finalidades), "finalidades E2E devem declarar TESTE_FICTICIO")
    require(production.status == "NAO_CONFIGURADO", "catálogo de produção deve continuar bloqueado")
    require(production.finalidades == [], "produção não pode ganhar finalidade pelo teste")


def test_importacao_balanceada_publica_volume_intracliente_e_conserva_valor(reference_payload: dict[str, Any]) -> None:
    request = _balanced_request(reference_payload)
    envelope = executar_previa(request, build_sha=BUILD_SHA, relogio=lambda: NOW)
    aggregate = envelope.result.agregado
    mechanisms = {item.destino: item for item in aggregate.mecanismos}
    require(envelope.result.manifesto.schema_version == "2.0.0", "schema do motor deve permanecer 2.0.0")
    require(aggregate.volume_bruto_periodo_brl == Decimal(200), "duas pontas de 100 devem produzir bruto 200")
    require(aggregate.volume_autonetting_periodo_brl == Decimal(200), "mesmo cliente deve produzir INTRA_CLIENTE 200")
    require(mechanisms["INTRA_CLIENTE"].volume_brl == Decimal(200), "decomposição intracliente deve reconciliar")
    require(aggregate.volume_remetido_periodo_brl == Decimal(0), "carteira balanceada não deve remeter")
    require(aggregate.volume_casado_periodo_brl + aggregate.volume_remetido_periodo_brl == aggregate.volume_bruto_periodo_brl, "volumes publicados devem conservar o bruto")
