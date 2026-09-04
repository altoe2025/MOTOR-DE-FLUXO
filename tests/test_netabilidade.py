r"""A taxa de netabilidade é uma FRAÇÃO DE VOLUME, e por isso tem que particionar.

O volume bruto de um ciclo (`bruto_out + bruto_in`) se parte em exatamente duas
fatias, sem sobra:

    bruto_out + bruto_in  ==  2 * casado  +  residuo
                              \_______/     \_____/
                              não cruzou     cruzou

`casado` é grandeza de UMA perna (é `min(out, in)` — o tamanho do casamento,
contado uma vez). O volume que deixou de cruzar a fronteira são as DUAS pernas:
os reais que ficaram no Brasil e a moeda que ficou lá fora.

Os testes abaixo travam a partição, não o valor. Fixar "58,042%" pegaria uma
regressão específica; exigir que as duas fatias somem 100% pega a classe inteira
do erro — que foi exatamente o que aconteceu: numerador de uma perna dividido por
denominador de duas.
"""

from decimal import Decimal

import pytest

from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.simulacao import simular

CUSTO = ParametrosCusto(
    iof_out=Decimal("0.035"),
    iof_in=Decimal("0.0038"),
    carry_cnr=Decimal("0.0004"),
    spread_rail_bps=Decimal("25"),
    custo_fixo_remessa=Decimal("40"),
    custo_oportunidade_aa=Decimal("0"),
    ptax=Decimal("5.40"),
)


def _ordem(id_: str, direcao: Direcao, valor: str) -> Ordem:
    return Ordem(id_, f"c-{id_}", direcao, Decimal(valor), 0, 0, True, "ANEXO_V_DISPONIBILIDADE")


def _simular(*ordens: Ordem):
    return simular(Cenario(ordens=ordens, janela_dias=1, horizonte_dias=1, custo=CUSTO))


def test_netting_perfeito_e_cem_por_cento_netado():
    """OUT 100 casa com IN 100: nada cruza a fronteira. Isso é 100%, não 50%."""
    r = _simular(_ordem("a", Direcao.OUT, "100"), _ordem("b", Direcao.IN, "100"))
    assert r.ciclos[0].residuo == 0
    assert r.taxa_netabilidade == Decimal(1)


def test_sem_contraparte_nenhuma_e_zero_por_cento_netado():
    r = _simular(_ordem("a", Direcao.OUT, "100"), _ordem("b", Direcao.OUT, "50"))
    assert r.ciclos[0].casado == 0
    assert r.taxa_netabilidade == Decimal(0)


def test_casamento_parcial_conta_as_duas_pernas():
    """OUT 120 x IN 80: casa 80 de cada lado (160 de 200 não cruzam), sobram 40."""
    r = _simular(_ordem("a", Direcao.OUT, "120"), _ordem("b", Direcao.IN, "80"))
    assert r.ciclos[0].casado == Decimal("80")
    assert r.ciclos[0].residuo == Decimal("40")
    assert r.taxa_netabilidade == Decimal("0.8")


@pytest.mark.parametrize(
    "valor_out,valor_in",
    [("100", "100"), ("120", "80"), ("1", "999"), ("500", "0.01"), ("7", "7")],
)
def test_as_duas_fatias_somam_o_volume_bruto(valor_out, valor_in):
    """O invariante de partição: o que não cruzou + o que cruzou == 100%."""
    r = _simular(_ordem("a", Direcao.OUT, valor_out), _ordem("b", Direcao.IN, valor_in))
    ciclo = r.ciclos[0]
    bruto = ciclo.bruto_out + ciclo.bruto_in
    fracao_que_cruzou = ciclo.residuo / bruto
    assert r.taxa_netabilidade + fracao_que_cruzou == Decimal(1)


def test_identidade_de_volume_em_todo_ciclo():
    """bruto_out + bruto_in == 2*casado + residuo — a base algébrica da partição."""
    r = _simular(
        _ordem("a", Direcao.OUT, "100"),
        _ordem("b", Direcao.IN, "30"),
        _ordem("c", Direcao.IN, "25"),
    )
    for ciclo in r.ciclos:
        assert ciclo.bruto_out + ciclo.bruto_in == 2 * ciclo.casado + ciclo.residuo


def test_taxa_continua_entre_zero_e_um():
    r = _simular(_ordem("a", Direcao.OUT, "1000000"), _ordem("b", Direcao.IN, "3"))
    assert Decimal(0) <= r.taxa_netabilidade <= Decimal(1)
