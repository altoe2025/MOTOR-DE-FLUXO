"""Orquestração de netting + custo: o único lugar do projeto onde as duas camadas
que evoluíram em branches separadas (netting e custo) se encontram.

Se a integração doer aqui, o contrato de `Ciclo` estava errado — e o conserto é
em `dominio.py`, na `main`, com os dois presentes (ver CLAUDE.md).

`simular` é pura (sem I/O), para poder ser paralelizada depois pela varredura
de cenários — a única função deste projeto autorizada a escrever arquivo.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from motor.custo import Custos, custo_baseline, custo_netado
from motor.dominio import Cenario, Ciclo, OrigemCasamento, TipoAlocacao
from motor.netting import executar_p0


@dataclass(frozen=True)
class Resultado:
    ciclos: tuple[Ciclo, ...]
    baseline: Custos
    netado: Custos
    economia: Decimal
    volume_casado_brl: Decimal
    volume_autonetting_brl: Decimal
    volume_netting_multilateral_brl: Decimal
    # fração do volume bruto (as duas pernas) que nunca cruzou a fronteira: 2*casado/bruto.
    # Vale 1 quando o ciclo fecha sem resíduo. Ver tests/test_netabilidade.py.
    taxa_netabilidade: Decimal
    taxa_autonetting: Decimal
    taxa_netting_multilateral: Decimal


def simular(cenario: Cenario) -> Resultado:
    """Junta netting e custo num Resultado. Função pura (sem I/O)."""
    ciclos = executar_p0(cenario)
    baseline = custo_baseline(cenario)
    netado = custo_netado(ciclos, cenario)

    # A partição vive nas ALOCAÇÕES, não nos brutos dos ciclos. Desde que uma ordem
    # pode ficar aberta em vários ciclos, `bruto_out + bruto_in` conta o mesmo saldo
    # pendente uma vez por ciclo e infla o denominador — no caso A/B/C isso dava 83%
    # onde a resposta é 100%. Ver tests/test_netabilidade.py.
    #
    # Somar as alocações resolve porque elas particionam exatamente o volume criado:
    #     Σ CASADO + Σ REMETIDO == Σ valor_brl
    #     \______/   \________/
    #     não cruzou    cruzou
    #
    # `casado` é grandeza de UMA perna, mas as alocações CASADO existem nos DOIS
    # lados — os reais que ficaram no Brasil e a moeda que ficou lá fora — então o
    # fator 2 já está embutido e não se aplica de novo aqui.
    volume_autonetting = Decimal(0)
    volume_netting_multilateral = Decimal(0)
    total = Decimal(0)
    for ciclo in ciclos:
        for alocacao in ciclo.alocacoes:
            total += alocacao.valor_brl
            if alocacao.origem_casamento is OrigemCasamento.INTRA_CLIENTE:
                volume_autonetting += alocacao.valor_brl
            elif alocacao.origem_casamento is OrigemCasamento.INTER_CLIENTE:
                volume_netting_multilateral += alocacao.valor_brl
    volume_casado = volume_autonetting + volume_netting_multilateral
    taxa_autonetting = volume_autonetting / total if total else Decimal(0)
    taxa_netting_multilateral = (
        volume_netting_multilateral / total if total else Decimal(0)
    )
    taxa_netabilidade = taxa_autonetting + taxa_netting_multilateral

    return Resultado(
        ciclos=ciclos,
        baseline=baseline,
        netado=netado,
        economia=baseline.total - netado.total,
        volume_casado_brl=volume_casado,
        volume_autonetting_brl=volume_autonetting,
        volume_netting_multilateral_brl=volume_netting_multilateral,
        taxa_netabilidade=taxa_netabilidade,
        taxa_autonetting=taxa_autonetting,
        taxa_netting_multilateral=taxa_netting_multilateral,
    )
