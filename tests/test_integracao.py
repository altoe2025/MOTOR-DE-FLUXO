from decimal import Decimal
from pathlib import Path

import pytest

from motor.dominio import (
    Cenario,
    Direcao,
    Ordem,
    OrigemCasamento,
    ParametrosCusto,
    TipoAlocacao,
    carregar_cenario,
)
from motor.simulacao import simular

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"


def test_economia_exemplo_amanda_regressao():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))
    resultado = simular(cenario)

    ptax = cenario.custo.ptax
    baseline_usd = float(resultado.baseline.total / ptax)
    netado_usd = float(resultado.netado.total / ptax)
    economia_usd = float(resultado.economia / ptax)

    assert len(resultado.ciclos) == 1
    assert baseline_usd == pytest.approx(439_000, abs=1_000)
    assert netado_usd == pytest.approx(249_000, abs=1_000)
    assert economia_usd == pytest.approx(190_000, abs=1_000)


def test_taxa_netabilidade_entre_0_e_1():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))
    resultado = simular(cenario)

    assert Decimal("0") <= resultado.taxa_netabilidade <= Decimal("1")


def test_simulacao_executa_autonetting_antes_do_multilateral():
    custo = ParametrosCusto(
        iof_out=Decimal("0"),
        iof_in=Decimal("0"),
        carry_cnr=Decimal("0"),
        spread_rail_bps=Decimal("0"),
        custo_fixo_remessa=Decimal("0"),
        custo_oportunidade_aa=Decimal("0"),
        ptax=Decimal("1"),
    )
    ordens = (
        Ordem("a-out", "a", Direcao.OUT, Decimal("100"), 0, 5, False, "x"),
        Ordem("a-in", "a", Direcao.IN, Decimal("70"), 0, 5, False, "x"),
        Ordem("b-in", "b", Direcao.IN, Decimal("50"), 0, 5, False, "x"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=100, horizonte_dias=5, custo=custo)

    resultado = simular(cenario)

    alocacoes = [
        alocacao for ciclo in resultado.ciclos for alocacao in ciclo.alocacoes
    ]
    volume_intra = sum(
        (
            alocacao.valor_brl
            for alocacao in alocacoes
            if alocacao.origem_casamento is OrigemCasamento.INTRA_CLIENTE
        ),
        Decimal(0),
    )
    volume_inter = sum(
        (
            alocacao.valor_brl
            for alocacao in alocacoes
            if alocacao.origem_casamento is OrigemCasamento.INTER_CLIENTE
        ),
        Decimal(0),
    )
    volume_casado = sum(
        (
            alocacao.valor_brl
            for alocacao in alocacoes
            if alocacao.tipo is TipoAlocacao.CASADO
        ),
        Decimal(0),
    )
    assert volume_intra == Decimal("140")
    assert volume_inter == Decimal("60")
    assert volume_intra + volume_inter == volume_casado == Decimal("200")
    assert resultado.taxa_netabilidade == Decimal("200") / Decimal("220")
