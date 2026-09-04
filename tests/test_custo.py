from decimal import Decimal
from pathlib import Path

import pytest

from motor.custo import custo_baseline, custo_netado
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto, carregar_cenario
from motor.netting import executar_p0

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"

# A regra de importação em CLAUDE.md proíbe `motor/custo.py` de importar
# `motor/netting.py` — ela não vale para os testes, que montam o Ciclo pelo caminho
# real em vez de reimplementar o netting à mão.


def test_numero_de_aceitacao_exemplo_amanda():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))
    ciclos = executar_p0(cenario)

    baseline = custo_baseline(cenario)
    netado = custo_netado(ciclos, cenario)

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
    ciclos = executar_p0(cenario)

    baseline = custo_baseline(cenario)
    netado = custo_netado(ciclos, cenario)

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
    ciclos = executar_p0(cenario)

    baseline = custo_baseline(cenario)
    netado = custo_netado(ciclos, cenario)

    assert (baseline.total - netado.total) == pytest.approx(Decimal("0"), abs=Decimal("0.01"))


def _custo(**overrides) -> ParametrosCusto:
    campos = dict(
        iof_out=Decimal("0"),
        iof_in=Decimal("0"),
        carry_cnr=Decimal("0"),
        spread_rail_bps=Decimal("0"),
        custo_fixo_remessa=Decimal("0"),
        custo_oportunidade_aa=Decimal("0"),
        ptax=Decimal("5.40"),
    )
    campos.update(overrides)
    return ParametrosCusto(**campos)


def test_espera_conta_cada_tranche_no_dia_em_que_ela_foi_resolvida():
    """Uma ordem coberta em duas tranches não tem `dia_executada` único: a espera
    é a soma de cada parcela pelo tempo que ELA ficou parada.

    Cenário A/B/C. A é coberta 6 no dia 5 e 4 no dia 8:
        A: 6*(5-0) + 4*(8-0) = 30 + 32 = 62
        B: 6*(5-3)           = 12
        C: 4*(8-6)           =  8
    Total 82. Com custo_oportunidade_aa = 365, o fator aa/365 vale 1.
    """
    ordens = (
        Ordem("a", "cliente-a", Direcao.OUT, Decimal("10"), 0, 8, False, "x"),
        Ordem("b", "cliente-b", Direcao.IN, Decimal("6"), 3, 5, False, "x"),
        Ordem("c", "cliente-c", Direcao.IN, Decimal("4"), 6, 20, False, "x"),
    )
    cenario = Cenario(
        ordens=ordens,
        janela_dias=100,
        horizonte_dias=20,
        custo=_custo(custo_oportunidade_aa=Decimal("365")),
    )

    netado = custo_netado(executar_p0(cenario), cenario)

    assert netado.espera == Decimal("82")


def test_carry_cobre_as_duas_pernas_do_que_ficou_na_cnr():
    """Carry incide sobre toda alocação CASADO — os dois lados, em todos os ciclos."""
    ordens = (
        Ordem("a", "cliente-a", Direcao.OUT, Decimal("10"), 0, 8, False, "x"),
        Ordem("b", "cliente-b", Direcao.IN, Decimal("6"), 3, 5, False, "x"),
        Ordem("c", "cliente-c", Direcao.IN, Decimal("4"), 6, 20, False, "x"),
    )
    cenario = Cenario(
        ordens=ordens,
        janela_dias=100,
        horizonte_dias=20,
        custo=_custo(carry_cnr=Decimal("0.001")),
    )

    netado = custo_netado(executar_p0(cenario), cenario)

    # 10 de A casados + 6 de B + 4 de C = 20 de volume dentro da CNR.
    assert netado.carry == Decimal("20") * Decimal("0.001")


def test_custos_total_e_soma_dos_componentes():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))
    ciclos = executar_p0(cenario)

    for custos in (custo_baseline(cenario), custo_netado(ciclos, cenario)):
        soma = custos.iof + custos.carry + custos.spread + custos.espera + custos.fixo
        assert custos.total == soma
