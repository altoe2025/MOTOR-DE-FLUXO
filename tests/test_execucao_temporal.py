from dataclasses import replace
from decimal import Decimal

import pytest

from motor.analise import (
    ConfiguracaoAnalise,
    ConfiguracaoTemporal,
    ManifestoExecucao,
    ModoAnalise,
    analisar,
    preparar_execucao_temporal,
    rotulo_periodo,
)
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto


D = Decimal


def _ordem(id_: str, cliente: str, direcao: Direcao, valor: str,
           conhecida: int, limite: int) -> Ordem:
    return Ordem(id_, cliente, direcao, D(valor), conhecida, limite, False, "x")


@pytest.fixture
def cenario_com_aquecimento() -> Cenario:
    return Cenario(
        ordens=(
            _ordem("aquecimento", "cliente-a", Direcao.OUT, "100", 2, 40),
            _ordem("medida-a", "cliente-a", Direcao.IN, "60", 5, 35),
            _ordem("medida-b", "cliente-b", Direcao.OUT, "25", 34, 42),
            _ordem("futura", "cliente-c", Direcao.IN, "999", 35, 50),
        ),
        janela_dias=3,
        horizonte_dias=50,
        custo=ParametrosCusto(D("0.035"), D("0.0038"), D("0.0004"),
                              D(25), D(40), D(0), D("5.4")),
    )


@pytest.fixture
def manifesto(cenario_com_aquecimento: Cenario) -> ManifestoExecucao:
    return ManifestoExecucao(
        run_id="run-temporal", schema_version="1", versao_motor="0.1.0",
        criado_em_utc="2026-09-09T00:00:00Z", hash_configuracao="abc",
        run_ids_origem=(), parametros_custo=cenario_com_aquecimento.custo,
        mixes=("teste",), arquetipos=("teste",), horizonte_dias=50,
        periodo_medicao_dias=50,
        janela_dias=3, seeds=(7,), modo_analise=ModoAnalise.POR_CLIENTE,
        custo_calibrado=False, metodo_percentil="linear", drenagem="legada",
        avisos=(),
    )


def test_liquidacao_estende_execucao_ate_o_ultimo_vencimento(
    cenario_com_aquecimento: Cenario,
):
    execucao = preparar_execucao_temporal(
        cenario_com_aquecimento,
        ConfiguracaoTemporal(dias_aquecimento=5, periodo_medicao_dias=30),
    )
    assert execucao.cenario.horizonte_dias == 42


def test_liquidacao_nao_admite_ordem_conhecida_depois_do_periodo_medido(
    cenario_com_aquecimento: Cenario,
):
    execucao = preparar_execucao_temporal(
        cenario_com_aquecimento,
        ConfiguracaoTemporal(dias_aquecimento=5, periodo_medicao_dias=30),
    )
    assert tuple(o.id for o in execucao.cenario.ordens) == (
        "aquecimento", "medida-a", "medida-b",
    )
    assert execucao.ids_ordens_aquecimento == ("aquecimento",)
    assert execucao.ids_ordens_medidas == ("medida-a", "medida-b")


@pytest.mark.parametrize("aquecimento,medicao", [(-1, 30), (0, 0), (0, -1)])
def test_configuracao_temporal_rejeita_periodos_invalidos(aquecimento, medicao):
    with pytest.raises(ValueError, match="aquecimento"):
        ConfiguracaoTemporal(aquecimento, medicao)


def test_periodo_de_30_dias_nao_e_rotulado_anual():
    assert rotulo_periodo(30) == "periodo"


def test_somente_365_dias_e_rotulado_anual():
    assert rotulo_periodo(365) == "anual"


def test_agregado_oficial_contem_somente_a_coorte_medida(
    cenario_com_aquecimento: Cenario, manifesto: ManifestoExecucao,
):
    resultado = analisar(
        cenario_com_aquecimento,
        ConfiguracaoAnalise(ModoAnalise.POR_CLIENTE),
        manifesto,
        configuracao_temporal=ConfiguracaoTemporal(5, 30),
    )
    assert set(resultado.agregado.ids_ordens_medidas) == {"medida-a", "medida-b"}
    assert {e.ordem_id for e in resultado.ledger_eventos} == {"medida-a", "medida-b"}
    assert sum((c.ganho_proprio_brl for c in resultado.clientes), D(0)) == (
        resultado.agregado.economia_periodo_brl
    )
    assert sum((c.baseline.total for c in resultado.clientes), D(0)) == (
        resultado.agregado.baseline_periodo.total
    )
    assert sum((c.netado.total for c in resultado.clientes), D(0)) == (
        resultado.agregado.netado_periodo.total
    )
    assert resultado.agregado.execucao_completa.ciclos[-1].dia == 42
    assert resultado.manifesto.drenagem == "NATURAL"
    assert resultado.manifesto.periodo_medicao_dias == 30
    assert resultado.manifesto.horizonte_dias == 42


def test_medicao_anual_preserva_rotulo_apesar_de_liquidacao_posterior(
    cenario_com_aquecimento: Cenario, manifesto: ManifestoExecucao,
):
    cenario = Cenario(
        ordens=(_ordem("anual", "cliente-a", Direcao.OUT, "100", 364, 400),),
        janela_dias=3, horizonte_dias=400, custo=cenario_com_aquecimento.custo,
    )
    resultado = analisar(
        cenario, ConfiguracaoAnalise(ModoAnalise.POR_CLIENTE),
        replace(manifesto, horizonte_dias=400, periodo_medicao_dias=400),
        configuracao_temporal=ConfiguracaoTemporal(0, 365),
    )
    assert resultado.manifesto.periodo_medicao_dias == 365
    assert resultado.manifesto.horizonte_dias == 400
