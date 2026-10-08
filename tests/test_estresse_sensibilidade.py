"""Testes da reprecificacao de cenarios e dos limites de break-even."""

from dataclasses import replace
from decimal import Decimal

import pytest

from motor.analise import ModoAnalise, criar_manifesto, escrever_json
from motor.varredura import PARAMETROS_VARREDURA

from scripts.estresse_sensibilidade import (
    CARRY_BASE_BPS,
    CHAVE_ATIVOS_VIRTUAIS,
    CHAVE_BENS_SERVICOS,
    CenarioEstresse,
    agregar_cenarios,
    gerar_limites,
    indexar_exposicoes_iof,
    main,
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
        "iof_evitado_bps": "42.6",
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


def test_limite_de_carry_usa_a_base_do_manifesto():
    linha = _linha()
    linha["carry_base_bps"] = "10"
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
    parametros_base = replace(PARAMETROS_VARREDURA, carry_cnr=Decimal("0.001"))

    limite = gerar_limites(
        [linha], {chave: _exposicoes()}, parametros_base=parametros_base
    )[0]

    assert limite["carry_break_even_base_bps"] == Decimal(210)


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


def test_exposicao_iof_duplicada_e_rejeitada():
    base = {
        "nome_mix": "teste",
        "n_clientes": "8",
        "janela_dias": "7",
        "horizonte_dias": "365",
        "seed_base": "1",
        "finalidade": "ANEXO_V_ATIVOS_VIRTUAIS",
        "direcao": "OUT",
    }
    linhas = [
        {**base, "delta_bps_por_1bp_aliquota": "1"},
        {**base, "delta_bps_por_1bp_aliquota": "2"},
    ]

    with pytest.raises(ValueError, match="exposicao IOF duplicada"):
        indexar_exposicoes_iof(linhas)


def _manifesto():
    return criar_manifesto(
        parametros_custo=PARAMETROS_VARREDURA,
        mixes=("teste",),
        arquetipos=(),
        horizonte_dias=365,
        periodo_medicao_dias=365,
        janela_dias=7,
        seeds=(1,),
        modo_analise=ModoAnalise.AGREGADO,
        custo_calibrado=False,
        metodo_percentil="nearest-rank",
        drenagem="FORCADA_LEGADA",
    )


def test_main_rejeita_produto_vazio_sem_criar_saida(tmp_path):
    produto = tmp_path / "produto.csv"
    produto.write_text("nome_mix\n", encoding="utf-8")
    iof = tmp_path / "iof.csv"
    iof.write_text("nome_mix\n", encoding="utf-8")
    manifesto = tmp_path / "manifesto.json"
    escrever_json(_manifesto(), manifesto)
    saida = tmp_path / "saida"

    with pytest.raises(ValueError, match="produto vazio"):
        main(
            [
                "--produto",
                str(produto),
                "--iof",
                str(iof),
                "--manifesto-produto",
                str(manifesto),
                "--manifesto-iof",
                str(manifesto),
                "--saida",
                str(saida),
            ]
        )

    assert not saida.exists()


def test_exposicoes_incompletas_nao_viram_zero_silenciosamente():
    exposicoes_sem_ativos = {CHAVE_BENS_SERVICOS: Decimal("0.2")}

    with pytest.raises(ValueError, match="exposicoes IOF nao reconciliam"):
        reprecificar_economia(
            _linha(),
            exposicoes_sem_ativos,
            CenarioEstresse(nome="base", descricao="base"),
        )


def test_reconciliacao_respeita_a_precisao_publicada_do_produto():
    linha = {**_linha(), "iof_evitado_bps": "102.840097"}
    exposicoes = {
        CHAVE_BENS_SERVICOS: Decimal("0.00000049"),
        CHAVE_ATIVOS_VIRTUAIS: Decimal("0.29382879"),
    }

    resultado = reprecificar_economia(
        linha,
        exposicoes,
        CenarioEstresse(nome="base", descricao="base"),
    )

    assert resultado["economia_estressada_bps"] == Decimal(100)


def test_reconciliacao_rejeita_diferenca_maior_que_a_quantizacao_publicada():
    linha = {**_linha(), "iof_evitado_bps": "102.840100"}
    exposicoes = {
        CHAVE_BENS_SERVICOS: Decimal("0.00000049"),
        CHAVE_ATIVOS_VIRTUAIS: Decimal("0.29382879"),
    }

    with pytest.raises(ValueError, match="exposicoes IOF nao reconciliam"):
        reprecificar_economia(
            linha,
            exposicoes,
            CenarioEstresse(nome="base", descricao="base"),
        )
