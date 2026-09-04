"""Varredura em grade: (mix de arquétipos × N de clientes × W de janela) -> CSV.

O invariante que dá sentido a esta etapa inteira está em
`test_baseline_identico_entre_janelas_do_mesmo_ponto` e em
`test_pool_e_gerada_uma_unica_vez_por_mix_e_n`: a pool de ordens de um (mix, N)
é gerada UMA vez e reusada em todos os W. Se ela for regerada por W com seed
diferente, o ruído amostral de `gerar_ordens` entra somado ao efeito da janela
e a varredura passa a medir sorte de seed, não janela.
"""

import csv
import dataclasses
import inspect
from decimal import Decimal
from pathlib import Path

import pytest

from motor import arquetipos, mixes
from motor.dominio import Cenario, carregar_cenario
from motor.simulacao import simular
from motor.varredura import (
    PARAMETROS_VARREDURA,
    PontoVarredura,
    escrever_csv,
    montar_especificacao_pool,
    montar_ponto,
    montar_pool_do_ponto,
    rodar_varredura,
)

CENARIO_AMANDA = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"
HORIZONTE_CURTO = 90
MIXES_DE_TESTE = {"equilibrado": mixes.EQUILIBRADO, "retail_pesado": mixes.RETAIL_PESADO}
VALORES_N = (3, 7)
VALORES_W = (1, 5, 14)
VALORES_SEED = (1, 2)


def _varredura_pequena():
    return rodar_varredura(
        mixes=MIXES_DE_TESTE,
        valores_n=VALORES_N,
        valores_w=VALORES_W,
        valores_seed=VALORES_SEED,
        horizonte_dias=HORIZONTE_CURTO,
        custo=PARAMETROS_VARREDURA,
    )


# ---------------------------------------------------------------- especificação


def test_especificacao_tem_exatamente_n_clientes():
    spec = montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=17, seed_base=1)
    assert len(spec) == 17


def test_especificacao_so_cita_arquetipos_existentes():
    spec = montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=17, seed_base=1)
    for nome_arquetipo, _seed in spec.values():
        assert nome_arquetipo in arquetipos.TODOS


def test_especificacao_da_uma_seed_distinta_a_cada_cliente():
    spec = montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=200, seed_base=1)
    seeds = [seed for _arq, seed in spec.values()]
    assert len(set(seeds)) == len(seeds)


def test_especificacao_e_determinista():
    a = montar_especificacao_pool(mixes.RETAIL_PESADO, n_clientes=40, seed_base=1)
    b = montar_especificacao_pool(mixes.RETAIL_PESADO, n_clientes=40, seed_base=1)
    assert a == b


def test_seed_base_diferente_muda_as_seeds_mas_nao_a_composicao():
    a = montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=30, seed_base=1)
    b = montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=30, seed_base=2)
    assert set(a.keys()) == set(b.keys())
    assert {c: arq for c, (arq, _) in a.items()} == {c: arq for c, (arq, _) in b.items()}
    assert [s for _arq, s in a.values()] != [s for _arq, s in b.values()]


def test_composicao_segue_os_pesos_normalizados_do_mix():
    n = 600
    spec = montar_especificacao_pool(mixes.RETAIL_PESADO, n_clientes=n, seed_base=1)
    esperado = mixes.normalizar(mixes.RETAIL_PESADO)
    for nome_arquetipo, peso in esperado.items():
        obtido = sum(1 for arq, _ in spec.values() if arq == nome_arquetipo) / n
        assert obtido == pytest.approx(peso, abs=0.02), nome_arquetipo


def test_arquetipo_com_peso_zero_nao_recebe_cliente():
    mix = dict.fromkeys(arquetipos.TODOS, 1.0)
    mix["exportador"] = 0.0
    spec = montar_especificacao_pool(mix, n_clientes=100, seed_base=1)
    assert all(arq != "exportador" for arq, _ in spec.values())


def test_aumentar_n_apenas_acrescenta_clientes():
    """Alocação house-monotone: a pool de N=10 é subconjunto da de N=50, então o
    eixo N da varredura mede efeito de escala, não reamostragem."""
    pequena = montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=10, seed_base=1)
    grande = montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=50, seed_base=1)
    assert pequena.items() <= grande.items()


def test_n_clientes_zero_produz_especificacao_vazia():
    assert montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=0, seed_base=1) == {}


def test_n_clientes_negativo_e_rejeitado():
    with pytest.raises(ValueError):
        montar_especificacao_pool(mixes.EQUILIBRADO, n_clientes=-1, seed_base=1)


def test_mix_invalido_e_rejeitado_na_montagem_da_especificacao():
    mix = dict.fromkeys(arquetipos.TODOS, 1.0)
    del mix["exportador"]
    with pytest.raises(ValueError, match="exportador"):
        montar_especificacao_pool(mix, n_clientes=10, seed_base=1)


# ------------------------------------------------------------------------ pool


def test_pool_do_ponto_e_determinista():
    a = montar_pool_do_ponto(mixes.EQUILIBRADO, 5, HORIZONTE_CURTO, seed_base=1)
    b = montar_pool_do_ponto(mixes.EQUILIBRADO, 5, HORIZONTE_CURTO, seed_base=1)
    assert a == b


def test_pool_do_ponto_so_tem_clientes_da_especificacao():
    spec = montar_especificacao_pool(mixes.EQUILIBRADO, 6, seed_base=1)
    pool = montar_pool_do_ponto(mixes.EQUILIBRADO, 6, HORIZONTE_CURTO, seed_base=1)
    assert {o.cliente_id for o in pool} <= set(spec.keys())


def test_pool_do_ponto_cresce_com_n():
    pequena = montar_pool_do_ponto(mixes.EQUILIBRADO, 3, HORIZONTE_CURTO, seed_base=1)
    grande = montar_pool_do_ponto(mixes.EQUILIBRADO, 12, HORIZONTE_CURTO, seed_base=1)
    assert len(grande) > len(pequena)


def test_pool_do_ponto_nao_recebe_janela_como_argumento():
    """A pool não pode nem ver W. Se um dia a assinatura aceitar janela, este teste
    quebra e o revisor é obrigado a olhar o porquê."""
    parametros = inspect.signature(montar_pool_do_ponto).parameters
    assert not any("janela" in nome for nome in parametros)


# -------------------------------------------------------------------- varredura


def test_varredura_cobre_todo_o_produto_cartesiano():
    pontos = _varredura_pequena()
    assert len(pontos) == len(MIXES_DE_TESTE) * len(VALORES_N) * len(VALORES_W) * len(VALORES_SEED)
    combinacoes = {(p.nome_mix, p.n_clientes, p.janela_dias, p.seed_base) for p in pontos}
    esperado = {
        (nome, n, w, s)
        for nome in MIXES_DE_TESTE
        for n in VALORES_N
        for w in VALORES_W
        for s in VALORES_SEED
    }
    assert combinacoes == esperado


def test_seeds_diferentes_dao_pools_diferentes():
    """Se as seeds não mudassem nada, o eixo seria decorativo e a barra de erro,
    mentira."""
    pontos = _varredura_pequena()
    do_ponto = [p for p in pontos if p.nome_mix == "equilibrado" and p.n_clientes == 7]
    assert len({p.n_ordens for p in do_ponto}) > 1


def test_uma_seed_so_reproduz_a_varredura_de_seed_unica():
    """Compatibilidade de leitura: com `valores_seed=(1,)` a grade é a de antes."""
    pontos = rodar_varredura(
        mixes={"equilibrado": mixes.EQUILIBRADO},
        valores_n=(5,),
        valores_w=(7,),
        valores_seed=(1,),
        horizonte_dias=HORIZONTE_CURTO,
        custo=PARAMETROS_VARREDURA,
    )
    pool = montar_pool_do_ponto(mixes.EQUILIBRADO, 5, HORIZONTE_CURTO, seed_base=1)
    assert len(pontos) == 1
    assert pontos[0].n_ordens == len(pool)
    assert pontos[0].seed_base == 1


def test_varredura_e_determinista():
    assert _varredura_pequena() == _varredura_pequena()


def test_baseline_identico_entre_janelas_do_mesmo_ponto():
    """O teste que prova que a pool não foi regerada por W: baseline, nº de ordens
    e volume bruto não dependem de W — dependem só da pool."""
    pontos = _varredura_pequena()
    for nome_mix in MIXES_DE_TESTE:
        for n in VALORES_N:
            for seed in VALORES_SEED:
                do_ponto = [
                    p
                    for p in pontos
                    if p.nome_mix == nome_mix and p.n_clientes == n and p.seed_base == seed
                ]
                assert len(do_ponto) == len(VALORES_W)
                assert len({p.baseline_total_brl for p in do_ponto}) == 1
                assert len({p.n_ordens for p in do_ponto}) == 1
                assert len({p.volume_bruto_brl for p in do_ponto}) == 1


def test_pool_e_gerada_uma_unica_vez_por_mix_e_n(monkeypatch):
    import motor.varredura as mod

    original = mod.montar_pool_do_ponto
    chamadas: list[tuple] = []

    def espiao(mix, n_clientes, horizonte_dias, seed_base):
        chamadas.append((n_clientes, horizonte_dias, seed_base))
        return original(mix, n_clientes, horizonte_dias, seed_base)

    monkeypatch.setattr(mod, "montar_pool_do_ponto", espiao)
    _varredura_pequena()

    # uma pool por (mix, N, seed) — nunca multiplicada por len(VALORES_W)
    assert len(chamadas) == len(MIXES_DE_TESTE) * len(VALORES_N) * len(VALORES_SEED)


def test_janela_altera_o_custo_netado():
    pontos = [
        p
        for p in _varredura_pequena()
        if p.nome_mix == "equilibrado" and p.n_clientes == 7 and p.seed_base == 1
    ]
    assert len({p.netado_total_brl for p in pontos}) > 1


def test_economia_e_a_diferenca_entre_baseline_e_netado():
    for p in _varredura_pequena():
        assert p.economia_brl == p.baseline_total_brl - p.netado_total_brl


def test_componentes_somam_o_total_em_cada_ponto():
    for p in _varredura_pequena():
        assert (
            p.baseline_iof_brl
            + p.baseline_carry_brl
            + p.baseline_spread_brl
            + p.baseline_espera_brl
            + p.baseline_fixo_brl
        ) == p.baseline_total_brl
        assert (
            p.netado_iof_brl
            + p.netado_carry_brl
            + p.netado_spread_brl
            + p.netado_espera_brl
            + p.netado_fixo_brl
        ) == p.netado_total_brl


def test_cada_ponto_bate_com_um_simular_independente():
    pontos = _varredura_pequena()
    alvo = next(
        p
        for p in pontos
        if p.nome_mix == "equilibrado" and p.n_clientes == 3 and p.seed_base == 1
    )
    pool = montar_pool_do_ponto(mixes.EQUILIBRADO, 3, HORIZONTE_CURTO, seed_base=1)
    cenario = Cenario(
        ordens=pool,
        janela_dias=alvo.janela_dias,
        horizonte_dias=HORIZONTE_CURTO,
        custo=PARAMETROS_VARREDURA,
    )
    resultado = simular(cenario)

    assert alvo.n_ordens == len(pool)
    assert alvo.n_ciclos == len(resultado.ciclos)
    assert alvo.baseline_total_brl == resultado.baseline.total
    assert alvo.netado_total_brl == resultado.netado.total
    assert alvo.economia_brl == resultado.economia
    assert alvo.taxa_netabilidade == resultado.taxa_netabilidade


def test_taxa_de_netabilidade_fica_entre_zero_e_um():
    for p in _varredura_pequena():
        assert Decimal(0) <= p.taxa_netabilidade <= Decimal(1)


def test_ponto_sem_cliente_nenhum_nao_divide_por_zero():
    pontos = rodar_varredura(
        mixes={"equilibrado": mixes.EQUILIBRADO},
        valores_n=(0,),
        valores_w=(1,),
        valores_seed=(1,),
        horizonte_dias=HORIZONTE_CURTO,
        custo=PARAMETROS_VARREDURA,
    )
    assert pontos[0].n_ordens == 0
    assert pontos[0].economia_por_ordem_brl == Decimal(0)
    assert pontos[0].economia_pct == Decimal(0)


def test_celula_do_grid_reproduz_o_numero_de_aceitacao_da_amanda():
    """Alimentada com o cenário da Amanda, uma célula tem que devolver o número de
    aceitação do CLAUDE.md (baseline ~US$ 439k, netado ~US$ 249k, economia ~US$ 190k).

    É o teste que prova que a varredura não recalcula custo por fora: ela monta o
    ponto pelo mesmo `simular()` que `test_integracao.py` ancora. Se um dia alguém
    "otimizar" a varredura somando colunas à mão, este teste cai junto."""
    cenario = carregar_cenario(str(CENARIO_AMANDA))
    ponto = montar_ponto(nome_mix="exemplo_amanda", n_clientes=3, cenario=cenario, seed_base=0)
    ptax = cenario.custo.ptax

    assert ponto.n_ordens == 3
    assert ponto.n_ciclos == 1
    assert ponto.janela_dias == cenario.janela_dias
    assert ponto.horizonte_dias == cenario.horizonte_dias
    assert float(ponto.baseline_total_brl / ptax) == pytest.approx(439_000, abs=1_000)
    assert float(ponto.netado_total_brl / ptax) == pytest.approx(249_000, abs=1_000)
    assert float(ponto.economia_brl / ptax) == pytest.approx(190_000, abs=1_000)


def test_montar_ponto_deriva_o_volume_bruto_do_cenario():
    cenario = carregar_cenario(str(CENARIO_AMANDA))
    ponto = montar_ponto(nome_mix="exemplo_amanda", n_clientes=3, cenario=cenario, seed_base=0)
    assert ponto.volume_bruto_brl == sum(ordem.valor_brl for ordem in cenario.ordens)


def test_varredura_registra_os_parametros_do_ponto():
    p = _varredura_pequena()[0]
    assert p.horizonte_dias == HORIZONTE_CURTO
    assert p.seed_base == 1


# -------------------------------------------------------------------------- csv


def test_csv_tem_uma_linha_por_ponto_mais_o_cabecalho(tmp_path):
    pontos = _varredura_pequena()
    destino = tmp_path / "varredura.csv"
    escrever_csv(pontos, str(destino))
    linhas = destino.read_text(encoding="utf-8").strip().splitlines()
    assert len(linhas) == len(pontos) + 1


def test_cabecalho_do_csv_sao_os_campos_do_ponto(tmp_path):
    destino = tmp_path / "varredura.csv"
    escrever_csv(_varredura_pequena(), str(destino))
    with destino.open(encoding="utf-8", newline="") as f:
        cabecalho = next(csv.reader(f))
    assert cabecalho == [campo.name for campo in dataclasses.fields(PontoVarredura)]


def test_csv_preserva_a_ordem_e_os_valores_dos_pontos(tmp_path):
    pontos = _varredura_pequena()
    destino = tmp_path / "varredura.csv"
    escrever_csv(pontos, str(destino))
    with destino.open(encoding="utf-8", newline="") as f:
        linhas = list(csv.DictReader(f))

    for ponto, linha in zip(pontos, linhas, strict=True):
        assert linha["nome_mix"] == ponto.nome_mix
        assert int(linha["n_clientes"]) == ponto.n_clientes
        assert int(linha["janela_dias"]) == ponto.janela_dias
        assert Decimal(linha["economia_brl"]) == ponto.economia_brl.quantize(Decimal("0.01"))


def test_csv_arredonda_decimais_para_nao_vazar_28_digitos(tmp_path):
    destino = tmp_path / "varredura.csv"
    escrever_csv(_varredura_pequena(), str(destino))
    with destino.open(encoding="utf-8", newline="") as f:
        for linha in csv.DictReader(f):
            assert len(linha["economia_brl"].split(".")[-1]) == 2
            assert len(linha["taxa_netabilidade"].split(".")[-1]) == 6


def test_csv_sem_ponto_nenhum_ainda_escreve_o_cabecalho(tmp_path):
    destino = tmp_path / "vazio.csv"
    escrever_csv((), str(destino))
    linhas = destino.read_text(encoding="utf-8").strip().splitlines()
    assert len(linhas) == 1
