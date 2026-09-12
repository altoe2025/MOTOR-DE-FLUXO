"""Convenções estatísticas compartilhadas pelas análises do motor."""

from __future__ import annotations

from collections import Counter
from decimal import ROUND_CEILING, Decimal
from typing import Iterable, Sequence


def percentil_empirico(valores: Iterable[Decimal], q: Decimal) -> Decimal:
    """Devolve a observação no posto ``max(1, ceil(q * n))``."""

    ordenados = tuple(sorted(valores))
    if not ordenados:
        raise ValueError("percentil exige ao menos uma observação")
    if not q.is_finite() or not Decimal(0) <= q <= Decimal(1):
        raise ValueError(f"q deve estar em [0,1], recebeu {q}")

    posto = max(
        1,
        int((q * len(ordenados)).to_integral_value(rounding=ROUND_CEILING)),
    )
    return ordenados[posto - 1]


def validar_seeds_unicas(seeds: Sequence[int]) -> tuple[int, ...]:
    """Materializa as seeds e rejeita repetições de forma determinística."""

    materializadas = tuple(seeds)
    duplicadas = sorted(
        seed
        for seed, quantidade in Counter(materializadas).items()
        if quantidade > 1
    )
    if duplicadas:
        raise ValueError(f"seeds duplicadas: {duplicadas}")
    return materializadas
