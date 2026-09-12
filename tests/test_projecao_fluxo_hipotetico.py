"""Testes da conversao da sensibilidade para fluxos anuais hipoteticos."""

from decimal import Decimal

import pytest

from scripts.projecao_fluxo_hipotetico import (
    CenarioFluxo,
    RESSALVAS,
    gerar_premissas_arquetipos,
    gerar_projecoes,
    projetar_linha,
)


def _produto() -> dict[str, object]:
    return {
        "nome_mix": "teste",
        "n_clientes": "8",
        "janela_dias": "7",
        "horizonte_dias": "365",
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
    assert Decimal("8619964") < remessa["fluxo_anual_assumido_brl"] < Decimal(
        "8619966"
    )
    assert "SUPOSICAO" in remessa["natureza_do_fluxo"]
    assert "SUPOSICOES" in RESSALVAS[0]


def test_rejeita_cenario_sem_linha_de_produto_correspondente():
    estresse = _estresse()
    estresse["seed_base"] = "2"

    with pytest.raises(ValueError, match="sem linha de produto"):
        gerar_projecoes([estresse], [_produto()])
