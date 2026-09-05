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
from motor.dominio import Cenario, Ciclo, TipoAlocacao
from motor.netting import executar_p0


@dataclass(frozen=True)
class Resultado:
    ciclos: tuple[Ciclo, ...]
    baseline: Custos
    netado: Custos
    economia: Decimal
    # fração do volume bruto (as duas pernas) que nunca cruzou a fronteira: 2*casado/bruto.
    # Vale 1 quando o ciclo fecha sem resíduo. Ver tests/test_netabilidade.py.
    taxa_netabilidade: Decimal


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
    nao_cruzou = Decimal(0)
    total = Decimal(0)
    for ciclo in ciclos:
        for alocacao in ciclo.alocacoes:
            total += alocacao.valor_brl
            if alocacao.tipo is TipoAlocacao.CASADO:
                nao_cruzou += alocacao.valor_brl
    taxa_netabilidade = nao_cruzou / total if total else Decimal(0)

    return Resultado(
        ciclos=ciclos,
        baseline=baseline,
        netado=netado,
        economia=baseline.total - netado.total,
        taxa_netabilidade=taxa_netabilidade,
    )
