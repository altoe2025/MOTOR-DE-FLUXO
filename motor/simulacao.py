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
from motor.dominio import Cenario, Ciclo
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

    # `casado` é grandeza de UMA perna (min(out, in): o tamanho do casamento, contado
    # uma vez), mas `bruto_out + bruto_in` conta as DUAS. O volume que deixou de cruzar
    # a fronteira são as duas pernas — os reais que ficaram no Brasil e a moeda que
    # ficou lá fora — daí o fator 2. `custo.py` já fazia essa conversão no carry
    # (`casado * 2 * carry_cnr`); era só aqui que ela faltava.
    #
    # A checagem que importa não é o valor e sim a partição:
    #     bruto_out + bruto_in == 2 * casado + residuo
    # ou seja, o que não cruzou mais o que cruzou tem que dar 100%. Ver
    # tests/test_netabilidade.py.
    soma_nao_cruzou = sum((ciclo.casado * 2 for ciclo in ciclos), Decimal(0))
    soma_bruto = sum((ciclo.bruto_out + ciclo.bruto_in for ciclo in ciclos), Decimal(0))
    taxa_netabilidade = soma_nao_cruzou / soma_bruto if soma_bruto else Decimal(0)

    return Resultado(
        ciclos=ciclos,
        baseline=baseline,
        netado=netado,
        economia=baseline.total - netado.total,
        taxa_netabilidade=taxa_netabilidade,
    )
