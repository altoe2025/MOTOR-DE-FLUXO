"""Sensibilidade de custo: contrafactual standalone e reprecificacao de bases."""

from __future__ import annotations

from decimal import Decimal

import pytest

from motor.custo import custo_netado
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.netting import executar_p0
from scripts.sensibilidade_custo import (
    agregar_por_celula,
    avaliar_produto,
    decompor_linha_grade,
    extrair_bases,
    main,
    precificar_bases,
)


def test_agregacao_usa_percentil_empirico_nearest_rank():
    linhas = [
        {
            "nome_mix": "teste",
            "n_clientes": 8,
            "janela_dias": 7,
            "horizonte_dias": 365,
            "metrica": Decimal(valor),
        }
        for valor in ("10", "20", "30", "40")
    ]

    assert agregar_por_celula(linhas, ("metrica",))[0]["metrica_p50"] == Decimal("20")


def test_cli_rejeita_sementes_duplicadas_antes_de_ler_a_grade(tmp_path):
    grade_inexistente = tmp_path / "grade-inexistente.csv"

    with pytest.raises(ValueError, match=r"seeds duplicadas: \[1\]"):
        main(["--grade", str(grade_inexistente), "--sementes", "1,1"])


def _custo() -> ParametrosCusto:
    return ParametrosCusto(
        iof_out=Decimal("0.01"),
        iof_in=Decimal("0.01"),
        carry_cnr=Decimal("0.0002"),
        spread_rail_bps=Decimal("10"),
        custo_fixo_remessa=Decimal("5"),
        custo_oportunidade_aa=Decimal("0"),
        ptax=Decimal("5.40"),
    )


def _ordem(id_: str, cliente: str, direcao: Direcao, valor: str) -> Ordem:
    return Ordem(
        id=id_,
        cliente_id=cliente,
        direcao=direcao,
        valor_brl=Decimal(valor),
        dia_conhecida=0,
        dia_limite=0,
        eh_efx=False,
        finalidade="teste",
    )


def test_bases_reproduzem_exatamente_o_custo_netado():
    ordens = (
        _ordem("out", "a", Direcao.OUT, "100"),
        _ordem("in", "b", Direcao.IN, "60"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=1, horizonte_dias=0, custo=_custo())
    ciclos = executar_p0(cenario)

    assert precificar_bases(extrair_bases(ciclos, ordens), cenario.custo) == custo_netado(
        ciclos, cenario
    )


def test_uma_posicao_liquida_sem_contraparte_tem_valor_zero(monkeypatch):
    ordem = _ordem("unica", "a", Direcao.OUT, "100")
    monkeypatch.setattr(
        "scripts.sensibilidade_custo.montar_pool_do_ponto",
        lambda *_args, **_kwargs: (ordem,),
    )

    linhas, _ = avaliar_produto("equilibrado", 1, 1, (1,), horizonte=0)

    assert linhas[0]["economia_produto_brl"] == Decimal(0)
    assert linhas[0]["economia_produto_bps"] == Decimal(0)
    assert linhas[0]["taxa_netabilidade_pool"] == Decimal(0)


def test_dois_clientes_opostos_medem_valor_criado_pela_pool(monkeypatch):
    ordens = (
        _ordem("out", "a", Direcao.OUT, "100"),
        _ordem("in", "b", Direcao.IN, "100"),
    )
    monkeypatch.setattr(
        "scripts.sensibilidade_custo.montar_pool_do_ponto",
        lambda *_args, **_kwargs: ordens,
    )

    # avaliar_incremental usa os parametros oficiais. O teste trava identidades e
    # derivadas, sem duplicar os valores desses parametros aqui.
    linhas, iof = avaliar_produto("equilibrado", 2, 1, (1,), horizonte=0)
    linha = linhas[0]

    assert linha["taxa_netabilidade_pool"] == Decimal(1)
    assert linha["delta_bps_por_1bp_spread"] == Decimal(1)
    assert linha["delta_bps_por_1bp_carry"] == Decimal(-1)
    assert linha["delta_remessas"] == 2
    assert linha["economia_produto_brl"] == sum(
        (
            linha["iof_evitado_brl"],
            linha["spread_evitado_brl"],
            linha["fixo_evitado_brl"],
            linha["carry_criado_brl"],
            linha["espera_criada_brl"],
        ),
        Decimal(0),
    )
    assert sum(item["iof_evitado_brl_base"] for item in iof) == linha[
        "iof_evitado_brl"
    ]


def test_decomposicao_da_grade_fecha_com_arredondamento_do_csv():
    registro = {
        "nome_mix": "teste",
        "n_clientes": "2",
        "janela_dias": "1",
        "horizonte_dias": "365",
        "seed_base": "1",
        "volume_bruto_brl": "1000.00",
        "economia_brl": "17.00",
        "baseline_iof_brl": "20.00",
        "netado_iof_brl": "10.00",
        "baseline_spread_brl": "5.00",
        "netado_spread_brl": "2.00",
        "baseline_fixo_brl": "8.00",
        "netado_fixo_brl": "4.00",
        "baseline_carry_brl": "0.00",
        "netado_carry_brl": "1.00",
        "baseline_espera_brl": "2.00",
        "netado_espera_brl": "1.00",
    }

    linha = decompor_linha_grade(registro)

    assert linha["economia_produto_bps"] == Decimal("170")
    assert linha["iof_evitado_bps"] == Decimal("100")
    assert linha["spread_evitado_bps"] == Decimal("30")
    assert linha["fixo_evitado_bps"] == Decimal("40")
    assert linha["carry_criado_bps"] == Decimal("-10")
    assert linha["espera_criada_bps"] == Decimal("10")
    assert linha["participacao_iof"] == Decimal("10") / Decimal("17")
    assert linha["participacao_carry"] == Decimal("-1") / Decimal("17")
