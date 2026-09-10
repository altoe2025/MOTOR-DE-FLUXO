"""Convenções estatísticas compartilhadas por motor e scripts analíticos."""

from decimal import Decimal

import pytest

from motor.analise.estatistica import percentil_empirico, validar_seeds_unicas


@pytest.mark.parametrize(
    ("q", "esperado"),
    [
        (Decimal("0.10"), Decimal("10")),
        (Decimal("0.50"), Decimal("50")),
        (Decimal("0.90"), Decimal("90")),
    ],
)
def test_percentil_empirico_escolhe_resultado_real(q, esperado):
    valores = [Decimal(n) for n in range(10, 101, 10)]

    assert percentil_empirico(valores, q) == esperado


def test_percentil_empirico_rejeita_amostra_vazia():
    with pytest.raises(ValueError, match="percentil exige ao menos uma observação"):
        percentil_empirico((), Decimal("0.50"))


@pytest.mark.parametrize("q", [Decimal("-0.01"), Decimal("1.01")])
def test_percentil_empirico_rejeita_q_fora_do_intervalo(q):
    with pytest.raises(ValueError, match=r"q deve estar em \[0,1\]"):
        percentil_empirico((Decimal("10"),), q)


def test_seeds_unicas_sao_materializadas_sem_alterar_a_ordem():
    assert validar_seeds_unicas([3, 1, 2]) == (3, 1, 2)


def test_seeds_duplicadas_sao_rejeitadas():
    with pytest.raises(ValueError, match=r"seeds duplicadas: \[1\]"):
        validar_seeds_unicas((1, 1, 2))
