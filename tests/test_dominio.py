from decimal import Decimal
from pathlib import Path

import pytest

from motor.dominio import Direcao, Ordem, carregar_cenario

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"


def test_carregar_cenario_exemplo_amanda():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))

    assert len(cenario.ordens) == 3
    assert cenario.janela_dias == 1
    assert cenario.horizonte_dias == 1
    assert cenario.custo.ptax == Decimal("5.40")

    bruto_out = sum(
        (o.valor_brl for o in cenario.ordens if o.direcao is Direcao.OUT), Decimal(0)
    )
    bruto_in = sum(
        (o.valor_brl for o in cenario.ordens if o.direcao is Direcao.IN), Decimal(0)
    )

    assert bruto_out == Decimal("64800000.00")
    assert bruto_in == Decimal("27000000.00")


def test_ordem_rejeita_valor_nao_positivo():
    with pytest.raises(ValueError):
        Ordem(
            id="x",
            cliente_id="cliente",
            direcao=Direcao.OUT,
            valor_brl=Decimal("0"),
            dia_conhecida=0,
            dia_limite=0,
            eh_efx=False,
            finalidade="TODO",
        )


def test_ordem_rejeita_dia_limite_anterior_a_dia_conhecida():
    with pytest.raises(ValueError):
        Ordem(
            id="x",
            cliente_id="cliente",
            direcao=Direcao.OUT,
            valor_brl=Decimal("100"),
            dia_conhecida=5,
            dia_limite=2,
            eh_efx=False,
            finalidade="TODO",
        )
