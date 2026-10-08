import json
from datetime import UTC, datetime
from decimal import Decimal
from importlib.metadata import PackageNotFoundError
from pathlib import Path
from uuid import UUID

import pytest

from motor.analise import (
    ConfiguracaoAnalise,
    ModoAnalise,
    analisar,
    criar_manifesto,
    resultado_para_json,
)
from servidor.contracts.input import PreviaRequest
from servidor.generate_reference_result import generate_reference_result
from servidor.motor_adapter import _versao_motor, construir_cenario, executar_previa
from servidor.publication import ResultadoInvalido

BUILD_SHA = "a" * 40
EXECUTION_ID = UUID("00000000-0000-4000-8000-000000000010")
NOW = datetime(2026, 9, 12, 20, 0, tzinfo=UTC)


@pytest.fixture
def reference_request(reference_payload) -> PreviaRequest:
    return PreviaRequest.model_validate(reference_payload)


@pytest.fixture
def fixed_ids(monkeypatch):
    monkeypatch.setattr("servidor.motor_adapter.uuid4", lambda: EXECUTION_ID)


def test_previa_equivale_a_chamada_publica_do_motor(reference_request, fixed_ids):
    envelope = executar_previa(reference_request, build_sha=BUILD_SHA, relogio=lambda: NOW)

    cenario = construir_cenario(reference_request.cenario)
    manifesto = criar_manifesto(
        parametros_custo=cenario.custo,
        mixes=(),
        arquetipos=(),
        horizonte_dias=cenario.horizonte_dias,
        periodo_medicao_dias=cenario.horizonte_dias + 1,
        janela_dias=cenario.janela_dias,
        seeds=(),
        modo_analise=ModoAnalise.AGREGADO,
        custo_calibrado=False,
        metodo_percentil="NAO_APLICAVEL",
        drenagem="LEGADO",
        relogio=lambda: NOW,
        versao_motor=_versao_motor(BUILD_SHA),
    )
    direto = analisar(cenario, ConfiguracaoAnalise(ModoAnalise.AGREGADO), manifesto)

    assert envelope.result.model_dump(mode="json") == json.loads(resultado_para_json(direto))
    assert envelope.execution_id == EXECUTION_ID
    assert envelope.statistics.repetition_id == EXECUTION_ID
    assert envelope.request_id == reference_request.request_id
    assert envelope.input_snapshot.cenario == reference_request.cenario


def test_previa_preserva_numero_de_aceitacao(reference_request, fixed_ids):
    envelope = executar_previa(reference_request, build_sha=BUILD_SHA, relogio=lambda: NOW)
    agregado = envelope.result.agregado

    assert agregado.baseline_periodo.total == Decimal(2370600)
    assert agregado.netado_periodo.total == Decimal(1344600)
    assert agregado.economia_periodo_brl == Decimal(1026000)
    assert agregado.economia_periodo_brl / Decimal("5.40") == Decimal(190000)
    assert agregado.volume_bruto_periodo_brl == Decimal(91800000)
    assert agregado.volume_casado_periodo_brl == Decimal(54000000)
    assert agregado.volume_remetido_periodo_brl == Decimal(37800000)
    assert agregado.taxa_netabilidade_periodo == Decimal("0.5882352941176470588235294118")


def test_periodo_natural_reidentifica_horizonte_e_coorte(reference_payload, fixed_ids):
    reference_payload["periodo"] = {
        "modo": "NATURAL",
        "dias_aquecimento": 0,
        "periodo_medicao_dias": 1,
    }
    request = PreviaRequest.model_validate(reference_payload)

    envelope = executar_previa(request, build_sha=BUILD_SHA, relogio=lambda: NOW)

    assert envelope.result.manifesto.drenagem == "NATURAL"
    assert envelope.result.manifesto.periodo_medicao_dias == 1
    assert envelope.result.agregado.ids_ordens_medidas == [
        "astropay-1", "nomad-1", "wise-1",
    ]


def test_previa_vazia_publica_taxa_zero(reference_payload, fixed_ids):
    reference_payload["cenario"]["ordens"] = []
    reference_payload["proveniencia"] = {
        path: origin
        for path, origin in reference_payload["proveniencia"].items()
        if not path.startswith("/ordens/")
    }
    request = PreviaRequest.model_validate(reference_payload)

    envelope = executar_previa(request, build_sha=BUILD_SHA, relogio=lambda: NOW)

    assert envelope.result.agregado.volume_bruto_periodo_brl == 0
    assert envelope.result.agregado.taxa_netabilidade_periodo == 0
    assert envelope.result.agregado.ids_ordens_medidas == []


def test_previa_de_uma_direcao_remete_todo_o_volume(reference_payload, fixed_ids):
    reference_payload["cenario"]["ordens"] = reference_payload["cenario"]["ordens"][:1]
    reference_payload["proveniencia"] = {
        path: origin
        for path, origin in reference_payload["proveniencia"].items()
        if not path.startswith("/ordens/1/") and not path.startswith("/ordens/2/")
    }
    request = PreviaRequest.model_validate(reference_payload)

    envelope = executar_previa(request, build_sha=BUILD_SHA, relogio=lambda: NOW)

    agregado = envelope.result.agregado
    assert agregado.volume_bruto_periodo_brl == Decimal(10800000)
    assert agregado.volume_casado_periodo_brl == 0
    assert agregado.volume_remetido_periodo_brl == Decimal(10800000)


def test_adapter_preserva_finalidade_nula_ate_a_execucao(reference_payload, fixed_ids):
    reference_payload["cenario"]["ordens"][0]["finalidade"] = None
    reference_payload["proveniencia"]["/ordens/0/finalidade"]["tipo"] = "NAO_COLETADO"
    request = PreviaRequest.model_validate(reference_payload)
    assert construir_cenario(request.cenario).ordens[0].finalidade is None
    envelope = executar_previa(request, build_sha=BUILD_SHA, relogio=lambda: NOW)
    assert envelope.input_snapshot.cenario.ordens[0].finalidade is None


def test_previa_balanceada_casa_as_duas_pernas(reference_payload, fixed_ids):
    ordens = reference_payload["cenario"]["ordens"][:2]
    ordens[1]["valor_brl"] = ordens[0]["valor_brl"]
    reference_payload["cenario"]["ordens"] = ordens
    reference_payload["proveniencia"] = {
        path: origin
        for path, origin in reference_payload["proveniencia"].items()
        if not path.startswith("/ordens/2/")
    }
    request = PreviaRequest.model_validate(reference_payload)

    envelope = executar_previa(request, build_sha=BUILD_SHA, relogio=lambda: NOW)

    agregado = envelope.result.agregado
    assert agregado.volume_casado_periodo_brl == Decimal(21600000)
    assert agregado.volume_remetido_periodo_brl == 0
    assert agregado.taxa_netabilidade_periodo == 1


def test_natural_separa_aquecimento_e_liquida_prazo_posterior(
    reference_payload, fixed_ids,
):
    reference_payload["cenario"]["horizonte_dias"] = 3
    ordem_medida = dict(reference_payload["cenario"]["ordens"][0])
    ordem_medida.update(
        id="medida-1",
        cliente_id="cliente-medida",
        dia_conhecida=1,
        dia_limite=3,
        valor_brl="100.00",
    )
    reference_payload["cenario"]["ordens"].append(ordem_medida)
    origem = reference_payload["proveniencia"]["/ordens/0/valor_brl"]
    for campo in ("valor_brl", "dia_conhecida", "dia_limite", "eh_efx", "finalidade"):
        reference_payload["proveniencia"][f"/ordens/3/{campo}"] = dict(origem)
    reference_payload["periodo"] = {
        "modo": "NATURAL",
        "dias_aquecimento": 1,
        "periodo_medicao_dias": 1,
    }
    request = PreviaRequest.model_validate(reference_payload)

    envelope = executar_previa(request, build_sha=BUILD_SHA, relogio=lambda: NOW)

    assert envelope.result.agregado.ids_ordens_medidas == ["medida-1"]
    assert envelope.result.agregado.volume_bruto_periodo_brl == Decimal(100)
    assert envelope.result.manifesto.horizonte_dias == 3


def test_fixture_de_resultado_e_reproduzivel(tmp_path: Path):
    primeira = tmp_path / "primeira.json"
    segunda = tmp_path / "segunda.json"

    generate_reference_result(primeira)
    generate_reference_result(segunda)

    assert primeira.read_bytes() == segunda.read_bytes()
    assert primeira.read_bytes() == Path(
        "contracts/fixtures/reference-result.json"
    ).read_bytes()
    documento = json.loads(primeira.read_text(encoding="utf-8"))
    assert documento["result"]["agregado"]["economia_periodo_brl"] == "1026000.000000"
    assert documento["execution_id"] == "00000000-0000-4000-8000-000000000010"


def test_fixture_independe_de_metadata_do_pacote_instalado(tmp_path: Path, monkeypatch):
    def pacote_ausente(*args, **kwargs):
        raise PackageNotFoundError

    monkeypatch.setattr("servidor.motor_adapter.version", pacote_ausente)

    gerada = generate_reference_result(tmp_path / "sem-metadata.json")

    assert gerada.read_bytes() == Path(
        "contracts/fixtures/reference-result.json"
    ).read_bytes()


def test_build_invalido_e_rejeitado_antes_de_executar(reference_request, monkeypatch):
    def nao_deveria_analisar(*args, **kwargs):
        raise AssertionError("análise não deveria ter começado")

    monkeypatch.setattr("servidor.motor_adapter.analisar", nao_deveria_analisar)

    with pytest.raises(ValueError, match="string_pattern_mismatch"):
        executar_previa(reference_request, build_sha="main", relogio=lambda: NOW)


def test_manifesto_executado_deve_corresponder_ao_periodo_solicitado(
    reference_request, fixed_ids, monkeypatch,
):
    criar_manifesto_real = criar_manifesto

    def criar_manifesto_incorreto(**campos):
        campos["periodo_medicao_dias"] = 999
        campos["drenagem"] = "NATURAL"
        return criar_manifesto_real(**campos)

    monkeypatch.setattr(
        "servidor.motor_adapter.criar_manifesto", criar_manifesto_incorreto
    )

    with pytest.raises(ResultadoInvalido, match="período executado"):
        executar_previa(reference_request, build_sha=BUILD_SHA, relogio=lambda: NOW)
