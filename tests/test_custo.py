from decimal import Decimal
from pathlib import Path

import pytest

from motor.custo import custo_baseline, custo_netado
from motor.dominio import Cenario, Ciclo, Direcao, Ordem, ParametrosCusto, carregar_cenario

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"


def _ciclo_unico(cenario: Cenario, dia: int = 0) -> Ciclo:
    """Constrói o Ciclo único de uma janela P0 direto das ordens do cenário.

    custo.py não importa netting.py (regra de importação em CLAUDE.md), então os
    testes montam o Ciclo à mão em vez de chamar executar_p0.
    """
    bruto_out = sum(
        (o.valor_brl for o in cenario.ordens if o.direcao is Direcao.OUT), Decimal(0)
    )
    bruto_in = sum(
        (o.valor_brl for o in cenario.ordens if o.direcao is Direcao.IN), Decimal(0)
    )
    casado = min(bruto_out, bruto_in)
    residuo = abs(bruto_out - bruto_in)
    direcao_residuo = Direcao.OUT if bruto_out >= bruto_in else Direcao.IN
    return Ciclo(
        dia=dia,
        ordens=tuple(cenario.ordens),
        bruto_out=bruto_out,
        bruto_in=bruto_in,
        casado=casado,
        residuo=residuo,
        direcao_residuo=direcao_residuo,
    )


def test_numero_de_aceitacao_exemplo_amanda():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))
    ciclo = _ciclo_unico(cenario)

    baseline = custo_baseline(cenario)
    netado = custo_netado((ciclo,), cenario)

    ptax = cenario.custo.ptax
    baseline_usd = float(baseline.total / ptax)
    netado_usd = float(netado.total / ptax)
    economia_usd = baseline_usd - netado_usd

    assert baseline_usd == pytest.approx(439_000, abs=1_000)
    assert netado_usd == pytest.approx(249_000, abs=1_000)
    assert economia_usd == pytest.approx(190_000, abs=1_000)


def test_custo_oportunidade_alto_torna_economia_negativa():
    custo = ParametrosCusto(
        iof_out=Decimal("0.035"),
        iof_in=Decimal("0.0038"),
        carry_cnr=Decimal("0.0004"),
        spread_rail_bps=Decimal("0"),
        custo_fixo_remessa=Decimal("0"),
        custo_oportunidade_aa=Decimal("50"),
        ptax=Decimal("5.40"),
    )
    ordens = (
        Ordem("o1", "cliente-out", Direcao.OUT, Decimal("100"), 0, 5, False, "x"),
        Ordem("o2", "cliente-in", Direcao.IN, Decimal("100"), 0, 5, False, "x"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=5, horizonte_dias=5, custo=custo)
    ciclo = _ciclo_unico(cenario, dia=5)

    baseline = custo_baseline(cenario)
    netado = custo_netado((ciclo,), cenario)

    assert (baseline.total - netado.total) < 0


def test_cenario_so_com_ordens_in_tem_economia_proxima_de_zero():
    custo = ParametrosCusto(
        iof_out=Decimal("0.035"),
        iof_in=Decimal("0.0038"),
        carry_cnr=Decimal("0.0004"),
        spread_rail_bps=Decimal("0"),
        custo_fixo_remessa=Decimal("0"),
        custo_oportunidade_aa=Decimal("0"),
        ptax=Decimal("5.40"),
    )
    ordens = (
        Ordem("o1", "nomad", Direcao.IN, Decimal("1000000"), 0, 0, False, "x"),
        Ordem("o2", "wise", Direcao.IN, Decimal("2000000"), 0, 0, False, "x"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=1, horizonte_dias=1, custo=custo)
    ciclo = _ciclo_unico(cenario)

    baseline = custo_baseline(cenario)
    netado = custo_netado((ciclo,), cenario)

    assert (baseline.total - netado.total) == pytest.approx(Decimal("0"), abs=Decimal("0.01"))


def test_custos_total_e_soma_dos_componentes():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))
    ciclo = _ciclo_unico(cenario)

    for custos in (custo_baseline(cenario), custo_netado((ciclo,), cenario)):
        soma = custos.iof + custos.carry + custos.spread + custos.espera + custos.fixo
        assert custos.total == soma
