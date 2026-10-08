"""Testes da conversao da sensibilidade para fluxos anuais hipoteticos."""

from decimal import Decimal

import pytest

from scripts.projecao_fluxo_hipotetico import (
    CenarioFluxo,
    RESSALVAS,
    agregar_projecoes,
    gerar_premissas_arquetipos,
    gerar_projecoes,
    fluxo_anual_central,
    projetar_linha,
)
from motor.arquetipos import REMESSA_OUTBOUND_MASSIVA


def test_agregacao_usa_percentil_empirico_nearest_rank():
    cenario = CenarioFluxo("central", Decimal(1), "central")
    linhas = []
    for economia in ("10", "20", "30", "40"):
        estresse = _estresse(tarifa="0")
        estresse["economia_estressada_bps"] = economia
        linhas.append(projetar_linha(estresse, _produto(), cenario))

    resumo = agregar_projecoes(linhas)[0]

    assert resumo["economia_bps_escala_assumida_p50"] == Decimal("20")


def _produto() -> dict[str, object]:
    return {
        "nome_mix": "teste",
        "n_clientes": "8",
        "janela_dias": "7",
        "horizonte_dias": "365",
        "periodo_medicao_dias": "365",
        "seed_base": "1",
        "volume_bruto_brl": "1000",
        "fixo_evitado_bps": "10",
    }


def _estresse(tarifa: str = "40") -> dict[str, object]:
    return {
        "nome_mix": "teste",
        "n_clientes": "8",
        "janela_dias": "7",
        "horizonte_dias": "365",
        "periodo_medicao_dias": "365",
        "seed_base": "1",
        "cenario": "teste",
        "descricao": "teste",
        "tarifa_fixa_brl": tarifa,
        "economia_estressada_bps": "20",
    }


def test_dobrar_fluxo_reduz_fixo_em_bps_e_preserva_fixo_em_reais():
    resultado = projetar_linha(
        _estresse(),
        _produto(),
        CenarioFluxo("alto", Decimal(2), "alto"),
    )

    assert resultado["volume_anual_assumido_brl"] == Decimal(2000)
    assert resultado["economia_bps_escala_assumida"] == Decimal(15)
    assert resultado["economia_anual_assumida_brl"] == Decimal(3)


def test_tarifa_zerada_nao_precisa_de_ajuste_de_escala():
    resultado = projetar_linha(
        _estresse(tarifa="0"),
        _produto(),
        CenarioFluxo("baixo", Decimal("0.5"), "baixo"),
    )

    assert resultado["economia_bps_escala_assumida"] == Decimal(20)
    assert resultado["economia_anual_assumida_brl"] == Decimal(1)


def test_fluxo_central_e_formula_explicita_e_nao_dado_real():
    linhas = gerar_premissas_arquetipos()

    assert len(linhas) == 18
    remessa = next(
        linha
        for linha in linhas
        if linha["arquetipo"] == "remessa_outbound_massiva"
        and linha["cenario_fluxo"] == "central_1_0x"
    )
    assert Decimal("8739685") < remessa["fluxo_anual_assumido_brl"] < Decimal(
        "8739688"
    )
    assert "SUPOSICAO" in remessa["natureza_do_fluxo"]
    assert "SUPOSICOES" in RESSALVAS[0]


def test_fluxo_anual_central_usa_a_mesma_base_de_30_dias_do_gerador():
    arquetipo = REMESSA_OUTBOUND_MASSIVA
    media_ticket = Decimal(str(float(arquetipo.ticket_mediana_brl) * __import__("math").exp(
        arquetipo.ticket_sigma**2 / 2
    )))
    esperado = media_ticket * Decimal(str(arquetipo.cadencia_mensal)) * Decimal(365) / Decimal(30)
    assert fluxo_anual_central(arquetipo) == esperado


def test_periodo_de_30_dias_nao_publica_campos_anuais():
    produto = _produto()
    produto["horizonte_dias"] = "365"
    produto["periodo_medicao_dias"] = "30"
    estresse = _estresse()
    estresse["horizonte_dias"] = "365"
    estresse["periodo_medicao_dias"] = "30"

    resultado = projetar_linha(estresse, produto, CenarioFluxo("central", Decimal(1), "x"))

    assert resultado["volume_do_periodo_assumido_brl"] == Decimal(1000)
    assert resultado["economia_do_periodo_assumida_brl"] == Decimal(2)
    assert not any("anual" in chave for chave in resultado)
    agregado = agregar_projecoes([resultado])[0]
    assert agregado["volume_do_periodo_assumido_brl_p50"] == Decimal(1000)
    assert agregado["economia_do_periodo_assumida_brl_p50"] == Decimal(2)
    assert not any("anual" in chave for chave in agregado)


def test_medicao_de_365_dias_permanece_anual_com_liquidacao_posterior():
    produto = _produto()
    produto["horizonte_dias"] = "400"
    estresse = _estresse()
    estresse["horizonte_dias"] = "400"

    resultado = projetar_linha(estresse, produto, CenarioFluxo("central", Decimal(1), "x"))

    assert resultado["periodo_medicao_dias"] == 365
    assert resultado["horizonte_dias"] == "400"
    assert resultado["volume_anual_assumido_brl"] == Decimal(1000)
    assert "volume_do_periodo_assumido_brl" not in resultado


def test_rejeita_periodos_medidos_divergentes_entre_produto_e_estresse():
    produto = _produto()
    estresse = _estresse()
    estresse["periodo_medicao_dias"] = "30"

    with pytest.raises(ValueError, match="período medido diverge"):
        projetar_linha(estresse, produto, CenarioFluxo("central", Decimal(1), "x"))


def test_rejeita_cenario_sem_linha_de_produto_correspondente():
    estresse = _estresse()
    estresse["seed_base"] = "2"

    with pytest.raises(ValueError, match="sem linha de produto"):
        gerar_projecoes([estresse], [_produto()])
