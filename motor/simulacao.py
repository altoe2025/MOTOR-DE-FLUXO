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
    taxa_netabilidade: Decimal  # fração do volume bruto que nunca cruzou a fronteira


def simular(cenario: Cenario) -> Resultado:
    """Junta netting e custo num Resultado. Função pura (sem I/O)."""
    ciclos = executar_p0(cenario)
    baseline = custo_baseline(cenario)
    netado = custo_netado(ciclos, cenario)

    soma_casado = sum((ciclo.casado for ciclo in ciclos), Decimal(0))
    soma_bruto = sum((ciclo.bruto_out + ciclo.bruto_in for ciclo in ciclos), Decimal(0))
    taxa_netabilidade = soma_casado / soma_bruto if soma_bruto else Decimal(0)

    return Resultado(
        ciclos=ciclos,
        baseline=baseline,
        netado=netado,
        economia=baseline.total - netado.total,
        taxa_netabilidade=taxa_netabilidade,
    )
