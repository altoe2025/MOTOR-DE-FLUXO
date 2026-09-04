"""CLI do motor de fluxo: `python -m motor <cenario.yaml>`."""

from __future__ import annotations

import sys

from motor.dominio import carregar_cenario
from motor.simulacao import simular


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("uso: python -m motor <cenario.yaml>", file=sys.stderr)
        return 1

    cenario = carregar_cenario(argv[1])
    resultado = simular(cenario)
    ptax = cenario.custo.ptax

    for ciclo in resultado.ciclos:
        print(
            f"dia {ciclo.dia}: bruto OUT {ciclo.bruto_out} | bruto IN {ciclo.bruto_in} "
            f"| casado {ciclo.casado} | resíduo {ciclo.residuo} {ciclo.direcao_residuo.value}"
        )

    print()
    print(f"baseline: {resultado.baseline.total} BRL (~ US$ {resultado.baseline.total / ptax:,.0f})")
    print(f"netado:   {resultado.netado.total} BRL (~ US$ {resultado.netado.total / ptax:,.0f})")
    print(f"economia: {resultado.economia} BRL (~ US$ {resultado.economia / ptax:,.0f})")
    print(f"taxa de netabilidade: {resultado.taxa_netabilidade:.2%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
