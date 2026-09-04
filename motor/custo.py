"""Custo de cada situação: baseline (sem netting) vs. netado (com a política P0).

Duas funções puras que, a partir de um Cenario e (para o caso netado) dos Ciclo já
fechados pelo netting, calculam IOF, carry de CNR, spread do rail, custo de
oportunidade da espera e custo fixo de remessa.

O IOF é por (finalidade do Anexo V, direção) — ver `aliquota_iof`. Câmbio de
importação e de exportação tem tratamento próprio, então duas alíquotas chapadas
por direção não bastam. Cenários que não declararem tabela caem em
`iof_out`/`iof_in` e se comportam como antes desse campo existir.

Regra de importação: este módulo importa apenas motor.dominio. Nunca motor.netting
— recebe Ciclo já pronto como argumento.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from motor.dominio import Cenario, Ciclo, Direcao, Ordem, ParametrosCusto

_DIAS_NO_ANO = Decimal(365)
_BPS = Decimal(10000)


@dataclass(frozen=True)
class Custos:
    iof: Decimal
    carry: Decimal
    spread: Decimal
    espera: Decimal
    fixo: Decimal
    total: Decimal


def aliquota_iof(custo: ParametrosCusto, finalidade: str, direcao: Direcao) -> Decimal:
    """Alíquota de IOF de uma operação, por (finalidade do Anexo V, direção).

    Cai em `iof_out`/`iof_in` quando a finalidade não tem regra própria, então um
    `ParametrosCusto` sem tabela se comporta como antes do campo existir.

    Função pura.
    """
    padrao = custo.iof_out if direcao is Direcao.OUT else custo.iof_in
    return custo.iof_por_finalidade.get((finalidade, direcao), padrao)


def _aliquota_media_do_lado(
    custo: ParametrosCusto, ordens: Iterable[Ordem], direcao: Direcao
) -> Decimal:
    """Alíquota média do lado `direcao` de um ciclo, ponderada por volume.

    O resíduo de um ciclo tem direção mas não tem finalidade única — ele é o
    excedente de um lado que mistura várias finalidades, e o P0 não diz quais
    ordens especificamente atravessaram a fronteira. Adotamos **pro-rata**: o
    resíduo é uma fatia proporcional do lado dominante, então paga a média desse
    lado.

    É a hipótese neutra, e isso é deliberado. Casar primeiro as ordens de alíquota
    alta e deixar as baratas cruzarem aumentaria a economia declarada, mas seria
    planejamento tributário embutido no motor — não entra sem parecer jurídico,
    mesmo espírito da regra do art. 22 gravada em netting.py.
    """
    do_lado = [ordem for ordem in ordens if ordem.direcao is direcao]
    volume = sum((ordem.valor_brl for ordem in do_lado), Decimal(0))
    if volume == 0:
        return custo.iof_out if direcao is Direcao.OUT else custo.iof_in

    ponderado = sum(
        (ordem.valor_brl * aliquota_iof(custo, ordem.finalidade, direcao) for ordem in do_lado),
        Decimal(0),
    )
    return ponderado / volume


def _custo_espera(
    ordens: Iterable[Ordem], dia_execucao: int, custo_oportunidade_aa: Decimal
) -> Decimal:
    if custo_oportunidade_aa == 0:
        return Decimal(0)
    total = Decimal(0)
    for ordem in ordens:
        dias_parado = Decimal(dia_execucao - ordem.dia_conhecida)
        total += ordem.valor_brl * dias_parado * custo_oportunidade_aa / _DIAS_NO_ANO
    return total


def custo_baseline(cenario: Cenario) -> Custos:
    """Cada ordem executa sozinha, no dia em que é conhecida. IOF cheio em tudo.

    Função pura.
    """
    custo = cenario.custo
    iof = Decimal(0)
    spread = Decimal(0)
    fixo = Decimal(0)
    espera = Decimal(0)

    for ordem in cenario.ordens:
        iof += ordem.valor_brl * aliquota_iof(custo, ordem.finalidade, ordem.direcao)
        spread += ordem.valor_brl * custo.spread_rail_bps / _BPS
        fixo += custo.custo_fixo_remessa
        espera += _custo_espera([ordem], ordem.dia_conhecida, custo.custo_oportunidade_aa)

    carry = Decimal(0)
    total = iof + carry + spread + espera + fixo
    return Custos(iof=iof, carry=carry, spread=spread, espera=espera, fixo=fixo, total=total)


def custo_netado(ciclos: tuple[Ciclo, ...], cenario: Cenario) -> Custos:
    """IOF só sobre o resíduo de cada ciclo; carry sobre as duas pernas do casado
    (o valor que ficou de cada lado dentro da CNR); espera de cada ordem até o dia
    em que o ciclo em que ela participou fechou.

    Função pura.
    """
    custo = cenario.custo
    iof = Decimal(0)
    carry = Decimal(0)
    spread = Decimal(0)
    fixo = Decimal(0)
    espera = Decimal(0)

    for ciclo in ciclos:
        if ciclo.residuo > 0:
            taxa_iof = _aliquota_media_do_lado(custo, ciclo.ordens, ciclo.direcao_residuo)
            iof += ciclo.residuo * taxa_iof
            spread += ciclo.residuo * custo.spread_rail_bps / _BPS
            fixo += custo.custo_fixo_remessa

        carry += ciclo.casado * 2 * custo.carry_cnr
        espera += _custo_espera(ciclo.ordens, ciclo.dia, custo.custo_oportunidade_aa)

    total = iof + carry + spread + espera + fixo
    return Custos(iof=iof, carry=carry, spread=spread, espera=espera, fixo=fixo, total=total)
