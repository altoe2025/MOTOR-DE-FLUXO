"""Testes da reprecificacao de cenarios e dos limites de break-even."""

from decimal import Decimal

from scripts.estresse_sensibilidade import (
    CARRY_BASE_BPS,
    CHAVE_ATIVOS_VIRTUAIS,
    CHAVE_BENS_SERVICOS,
    CenarioEstresse,
    agregar_cenarios,
    gerar_limites,
    reprecificar_economia,
)


def _linha() -> dict[str, object]:
    return {
        "nome_mix": "teste",
        "n_clientes": "8",
        "janela_dias": "7",
        "horizonte_dias": "365",
        "seed_base": "1",
        "economia_produto_bps": "100",
        "delta_bps_por_1bp_spread": "0.5",
        "delta_bps_por_1real_fixo": "0.1",
        "delta_bps_por_1bp_carry": "-0.5",
    }


def _exposicoes() -> dict[tuple[str, str], Decimal]:
    return {
        CHAVE_BENS_SERVICOS: Decimal("0.2"),
        CHAVE_ATIVOS_VIRTUAIS: Decimal("0.1"),
    }


def test_reprecificacao_combina_todos_os_efeitos_lineares():
    cenario = CenarioEstresse(
        nome="teste",
        descricao="teste",
        spread_bps=Decimal(0),
        tarifa_fixa_brl=Decimal(0),
        carry_bps=Decimal(25),
        iof_bens_servicos_out_bps=Decimal(0),
        iof_ativos_virtuais_out_bps=Decimal(0),
    )

    resultado = reprecificar_economia(_linha(), _exposicoes(), cenario)

    esperado = (
        Decimal(100)
        - Decimal("12.5")
        - Decimal(4)
        - Decimal("10.5")
        - Decimal("7.6")
        - Decimal(35)
    )
    assert resultado["economia_estressada_bps"] == esperado
    assert resultado["economia_positiva"] is True


def test_base_nao_altera_a_economia_publicada():
    resultado = reprecificar_economia(
        _linha(),
        _exposicoes(),
        CenarioEstresse(nome="base", descricao="base"),
    )

    assert resultado["economia_estressada_bps"] == Decimal(100)


def test_limite_de_carry_zera_a_economia_na_base():
    linha = _linha()
    chave = tuple(
        linha[c]
        for c in (
            "nome_mix",
            "n_clientes",
            "janela_dias",
            "horizonte_dias",
            "seed_base",
        )
    )

    limite = gerar_limites([linha], {chave: _exposicoes()})[0]

    assert limite["carry_break_even_base_bps"] == Decimal(204)
    assert CARRY_BASE_BPS + Decimal(200) == limite["carry_break_even_base_bps"]


def test_agregacao_informa_fracao_de_carteiras_positivas():
    linhas = []
    for seed, economia in (("1", Decimal(-1)), ("2", Decimal(2))):
        linhas.append(
            {
                "cenario": "teste",
                "nome_mix": "mix",
                "n_clientes": "8",
                "janela_dias": "7",
                "horizonte_dias": "365",
                "seed_base": seed,
                "descricao": "teste",
                "spread_bps": Decimal(0),
                "tarifa_fixa_brl": Decimal(0),
                "carry_bps": Decimal(0),
                "iof_bens_servicos_out_bps": Decimal(0),
                "iof_ativos_virtuais_out_bps": Decimal(0),
                "economia_estressada_bps": economia,
            }
        )

    resumo = agregar_cenarios(linhas)[0]

    assert resumo["fracao_economia_positiva"] == Decimal("0.5")
    assert resumo["economia_estressada_bps_p50"] == Decimal(-1)
