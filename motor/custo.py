"""Custo de cada situação: baseline (sem netting) vs. netado (com a política P0).

Duas funções puras que, a partir de um Cenario e (para o caso netado) dos Ciclo já
fechados pelo netting, calculam IOF, carry de CNR, spread do rail, custo de
oportunidade da espera e custo fixo de remessa.

O IOF é por (finalidade do Anexo V, direção) — ver `aliquota_iof`. Câmbio de
importação e de exportação tem tratamento próprio, então duas alíquotas chapadas
por direção não bastam. Cenários que não declararem tabela caem em
`iof_out`/`iof_in` e se comportam como antes desse campo existir.

## Quem paga o IOF do resíduo

Antes das `Alocacao` o resíduo tinha direção mas não dono: o P0 fechava o lote e
não dizia quais ordens especificamente atravessaram, então o resíduo pagava a
**média pro-rata** do seu lado. Agora o motor sabe — cada `Alocacao(REMETIDO)`
aponta para uma ordem — e cobra a alíquota daquela ordem.

Isso NÃO é planejamento tributário embutido: quem decide a ordem de cobertura é o
EDF, por `dia_limite`, um critério operacional. A alíquota nunca entra no
critério. Se algum dia entrar — casar primeiro as ordens caras para deixar as
baratas cruzarem — aí sim vira otimização fiscal, e não entra sem parecer
jurídico, mesmo espírito da regra do art. 22 gravada em netting.py.

Regra de importação: este módulo importa apenas motor.dominio. Nunca motor.netting
— recebe Ciclo já pronto como argumento.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from motor.dominio import Cenario, Ciclo, Direcao, Ordem, ParametrosCusto, TipoAlocacao

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
    """Preço de cada `Alocacao`: o que atravessou paga IOF, o que ficou na CNR paga
    carry, e toda parcela paga a espera do dia em que ELA foi resolvida.

    A espera é somada por alocação porque uma ordem coberta em tranches não tem um
    `dia_executada` único. Somar pelo dia do ciclo em que a ordem "participou"
    contaria a mesma ordem várias vezes agora que ela pode aparecer em vários.

    Função pura.
    """
    custo = cenario.custo
    ordem_por_id = {ordem.id: ordem for ordem in cenario.ordens}
    iof = Decimal(0)
    carry = Decimal(0)
    spread = Decimal(0)
    fixo = Decimal(0)
    espera = Decimal(0)

    for ciclo in ciclos:
        for alocacao in ciclo.alocacoes:
            ordem = ordem_por_id[alocacao.ordem_id]

            if alocacao.tipo is TipoAlocacao.REMETIDO:
                iof += alocacao.valor_brl * aliquota_iof(
                    custo, ordem.finalidade, ordem.direcao
                )
            else:
                carry += alocacao.valor_brl * custo.carry_cnr

            if custo.custo_oportunidade_aa != 0:
                dias_parado = Decimal(alocacao.dia - ordem.dia_conhecida)
                espera += (
                    alocacao.valor_brl
                    * dias_parado
                    * custo.custo_oportunidade_aa
                    / _DIAS_NO_ANO
                )

        # O resíduo de um ciclo sai numa remessa agregada só — daí um custo fixo
        # por ciclo, e não um por ordem que atravessou.
        if ciclo.residuo > 0:
            spread += ciclo.residuo * custo.spread_rail_bps / _BPS
            fixo += custo.custo_fixo_remessa

    total = iof + carry + spread + espera + fixo
    return Custos(iof=iof, carry=carry, spread=spread, espera=espera, fixo=fixo, total=total)
