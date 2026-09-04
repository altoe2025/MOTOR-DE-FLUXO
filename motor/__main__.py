"""CLI do motor de fluxo: `python -m motor <cenario.yaml>`."""

from __future__ import annotations

import sys
from decimal import Decimal

from motor.dominio import Direcao, carregar_cenario


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("uso: python -m motor <cenario.yaml>", file=sys.stderr)
        return 1

    cenario = carregar_cenario(argv[1])
    bruto_out = sum(
        (o.valor_brl for o in cenario.ordens if o.direcao is Direcao.OUT), Decimal(0)
    )
    bruto_in = sum(
        (o.valor_brl for o in cenario.ordens if o.direcao is Direcao.IN), Decimal(0)
    )

    print(f"ordens carregadas: {len(cenario.ordens)}")
    print(f"bruto OUT (BRL): {bruto_out}")
    print(f"bruto IN  (BRL): {bruto_in}")
    print("netting e custo ainda não implementados (ver netting.py / custo.py).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
