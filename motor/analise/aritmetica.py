"""Aritmética Decimal exata para invariantes da análise."""

from decimal import Decimal, localcontext
from typing import Iterable

_ZERO = Decimal(0)


def somar_exato(valores: Iterable[Decimal]) -> Decimal:
    """Soma coeficientes finitos sem depender da precisão global."""
    itens = tuple(valores)
    if not itens:
        return _ZERO
    menor_expoente = min(valor.as_tuple().exponent for valor in itens)
    maior_posicao = max(valor.adjusted() for valor in itens)
    with localcontext() as contexto:
        contexto.prec = max(
            contexto.prec,
            maior_posicao - menor_expoente + len(str(len(itens))) + 2,
        )
        return sum(itens, _ZERO)


def subtrair_exato(minuendo: Decimal, subtraendo: Decimal) -> Decimal:
    """Subtrai dois Decimals finitos sem arredondar o resultado."""
    return somar_exato((minuendo, subtraendo.copy_negate()))
