from decimal import Decimal
from pathlib import Path

import pytest

from motor.dominio import carregar_cenario
from motor.simulacao import simular

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"


def test_economia_exemplo_amanda_regressao():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))
    resultado = simular(cenario)

    ptax = cenario.custo.ptax
    baseline_usd = float(resultado.baseline.total / ptax)
    netado_usd = float(resultado.netado.total / ptax)
    economia_usd = float(resultado.economia / ptax)

    assert len(resultado.ciclos) == 1
    assert baseline_usd == pytest.approx(439_000, abs=1_000)
    assert netado_usd == pytest.approx(249_000, abs=1_000)
    assert economia_usd == pytest.approx(190_000, abs=1_000)


def test_taxa_netabilidade_entre_0_e_1():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))
    resultado = simular(cenario)

    assert Decimal("0") <= resultado.taxa_netabilidade <= Decimal("1")
