from decimal import Decimal
from pathlib import Path

import pytest

from motor.dominio import Arquetipo, Direcao, Ordem, carregar_cenario

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


def _arquetipo_valido(**overrides) -> Arquetipo:
    campos = dict(
        nome="teste",
        p_out=0.5,
        ticket_mediana_brl=Decimal("1000"),
        ticket_sigma=0.5,
        cadencia_mensal=10,
        buffer_dias_min=1,
        buffer_dias_max=5,
        visibilidade_dias_min=0,
        visibilidade_dias_max=3,
        eh_efx=True,
        finalidade_out="ANEXO_V_TESTE_SAIDA",
        finalidade_in="ANEXO_V_TESTE_ENTRADA",
    )
    campos.update(overrides)
    return Arquetipo(**campos)


def test_arquetipo_aceita_parametros_validos():
    arquetipo = _arquetipo_valido()
    assert arquetipo.nome == "teste"
    assert arquetipo.p_out == 0.5


def test_arquetipo_rejeita_p_out_fora_de_0_1():
    with pytest.raises(AssertionError):
        _arquetipo_valido(p_out=1.5)


def test_arquetipo_rejeita_ticket_mediana_nao_positivo():
    with pytest.raises(AssertionError):
        _arquetipo_valido(ticket_mediana_brl=Decimal("0"))


def test_arquetipo_rejeita_cadencia_nao_positiva():
    with pytest.raises(AssertionError):
        _arquetipo_valido(cadencia_mensal=0)


def test_arquetipo_rejeita_buffer_max_menor_que_min():
    with pytest.raises(AssertionError):
        _arquetipo_valido(buffer_dias_min=10, buffer_dias_max=5)


def test_arquetipo_rejeita_visibilidade_max_menor_que_min():
    with pytest.raises(AssertionError):
        _arquetipo_valido(visibilidade_dias_min=10, visibilidade_dias_max=5)
