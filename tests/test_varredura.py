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
from motor.dominio import Cenario, Direcao, Ordem, carregar_cenario
from motor.simulacao import simular
from motor.varredura import (
    PARAMETROS_VARREDURA,
    PontoVarredura,
    _percentil,
    escrever_csv,
    montar_especificacao_pool,
    montar_ponto,
    montar_pool_do_ponto,
    resumir,
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


def _pontos_com_pool():
    """Os mesmos pontos de `_varredura_pequena`, cada um com a pool que o gerou.

    `rodar_varredura` não devolve a pool, e o teto é propriedade da pool — então
    aqui a grade é remontada com as mesmas chamadas puras que ela usa.
    """
    for nome_mix, mix in MIXES_DE_TESTE.items():
        for n in VALORES_N:
            for seed in VALORES_SEED:
                pool = montar_pool_do_ponto(mix, n, HORIZONTE_CURTO, seed_base=seed)
                if not pool:
                    continue
                for w in VALORES_W:
                    cenario = Cenario(
                        ordens=pool,
                        janela_dias=w,
                        horizonte_dias=HORIZONTE_CURTO,
                        custo=PARAMETROS_VARREDURA,
                    )
                    yield montar_ponto(
                        nome_mix=nome_mix,
                        n_clientes=n,
                        cenario=cenario,
                        seed_base=seed,
                    ), pool


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


def test_as_colunas_de_volume_do_ponto_fecham_entre_si():
    """`volume_casado_brl + volume_residuo_brl == volume_bruto_brl`, em toda célula.

    As três colunas precisam estar na MESMA unidade. `ciclo.casado` é grandeza de
    uma perna (o mínimo entre os dois lados), mas o que deixou de atravessar são as
    DUAS pernas — os reais que ficaram no Brasil e a moeda que ficou lá fora. O
    bruto conta as duas, então o casado também tem que contar.

    Sem isso, quem calcula a taxa de netting a partir do CSV
    (`volume_casado_brl / volume_bruto_brl`) obtém metade do que a coluna
    `taxa_netabilidade` da mesma linha informa.
    """
    for ponto in _varredura_pequena():
        assert ponto.volume_casado_brl + ponto.volume_residuo_brl == ponto.volume_bruto_brl
        if ponto.volume_bruto_brl:
            assert ponto.volume_casado_brl / ponto.volume_bruto_brl == ponto.taxa_netabilidade


def test_teto_e_a_netabilidade_maxima_que_a_pool_permite():
    """`teto_netabilidade == 1 − |OUT−IN| / (OUT+IN)`, sobre os valores das ordens.

    É o melhor que QUALQUER política poderia fazer nesta pool, porque a soma dos
    resíduos nunca fica abaixo do desbalanço total entre os dois lados. Vários
    ciclos só podem piorar em relação a um ciclo único que visse a pool inteira.
    """
    for ponto, pool in _pontos_com_pool():
        bruto_out = sum(
            (o.valor_brl for o in pool if o.direcao is Direcao.OUT), Decimal(0)
        )
        bruto_in = sum((o.valor_brl for o in pool if o.direcao is Direcao.IN), Decimal(0))
        total = bruto_out + bruto_in
        esperado = 1 - abs(bruto_out - bruto_in) / total if total else Decimal(0)
        assert ponto.teto_netabilidade == esperado


def test_netabilidade_nunca_ultrapassa_o_teto_da_pool():
    """Se isto quebrar, o motor está contando volume casado que não existe."""
    for ponto, _pool in _pontos_com_pool():
        assert ponto.taxa_netabilidade <= ponto.teto_netabilidade


def test_eficiencia_e_quanto_da_netabilidade_possivel_a_politica_extraiu():
    """A coluna que separa "a carteira é boa" de "a política é boa".

    Sem ela, uma célula com netabilidade alta é ambígua: pode ser uma carteira
    naturalmente equilibrada, ou uma política que aproveitou bem uma carteira
    ruim. São conclusões opostas para o produto.
    """
    for ponto, _pool in _pontos_com_pool():
        if ponto.teto_netabilidade:
            assert ponto.eficiencia_vs_teto == (
                ponto.taxa_netabilidade / ponto.teto_netabilidade
            )
        else:
            assert ponto.eficiencia_vs_teto == Decimal(0)


def test_pool_perfeitamente_equilibrada_tem_teto_um():
    cenario = carregar_cenario(str(CENARIO_AMANDA))
    equilibrada = tuple(
        o for o in cenario.ordens if o.direcao is Direcao.OUT
    ) + tuple(o for o in cenario.ordens if o.direcao is Direcao.IN)
    bruto_out = sum(
        (o.valor_brl for o in equilibrada if o.direcao is Direcao.OUT), Decimal(0)
    )
    bruto_in = sum(
        (o.valor_brl for o in equilibrada if o.direcao is Direcao.IN), Decimal(0)
    )
    # o exemplo da Amanda é desbalanceado de propósito; construo o espelho
    espelho = Ordem(
        id="espelho",
        cliente_id="espelho",
        direcao=Direcao.IN,
        valor_brl=bruto_out - bruto_in,
        dia_conhecida=0,
        dia_limite=0,
        eh_efx=False,
        finalidade="x",
    )
    balanceado = dataclasses.replace(cenario, ordens=equilibrada + (espelho,))
    ponto = montar_ponto(
        nome_mix="balanceado", n_clientes=1, cenario=balanceado, seed_base=0
    )
    assert ponto.teto_netabilidade == Decimal(1)
    assert ponto.taxa_netabilidade == Decimal(1)
    assert ponto.eficiencia_vs_teto == Decimal(1)


def _ordem(id_, cliente, direcao, valor, conhecida=0, limite=0):
    return Ordem(
        id=id_,
        cliente_id=cliente,
        direcao=direcao,
        valor_brl=Decimal(valor),
        dia_conhecida=conhecida,
        dia_limite=limite,
        eh_efx=False,
        finalidade="x",
    )


def _cenario_de(ordens, horizonte=0):
    return Cenario(
        ordens=tuple(ordens),
        janela_dias=1,
        horizonte_dias=horizonte,
        custo=PARAMETROS_VARREDURA,
    )


def test_limite_intra_cliente_e_o_que_cada_cliente_casaria_sozinho():
    """Para cada cliente, `2 × min(o que ele manda, o que ele recebe)`.

    É o teto do que a tesouraria DELE resolveria sem contraparte externa — e
    portanto não é valor que o produto cria.
    """
    for ponto, pool in _pontos_com_pool():
        por_cliente = {}
        for o in pool:
            lados = por_cliente.setdefault(o.cliente_id, [Decimal(0), Decimal(0)])
            lados[0 if o.direcao is Direcao.OUT else 1] += o.valor_brl
        esperado = sum((2 * min(out, ent) for out, ent in por_cliente.values()), Decimal(0))
        assert ponto.limite_intra_cliente_brl == esperado


def test_cliente_de_uma_direcao_so_nao_tem_nada_a_casar_sozinho():
    """Dois clientes opostos: tudo que casa só casou porque um achou o outro."""
    cenario = _cenario_de(
        [
            _ordem("a", "cliente-a", Direcao.OUT, 100),
            _ordem("b", "cliente-b", Direcao.IN, 100),
        ]
    )
    ponto = montar_ponto(nome_mix="t", n_clientes=2, cenario=cenario, seed_base=0)

    assert ponto.limite_intra_cliente_brl == Decimal(0)
    assert ponto.volume_casado_incremental_brl == ponto.volume_casado_brl
    assert ponto.taxa_netabilidade_incremental == ponto.taxa_netabilidade


def test_cliente_que_se_basta_nao_gera_netting_incremental():
    """Um cliente só, com os dois lados iguais. O motor casa 100% — e o valor que
    ele adiciona é ZERO: essa pessoa faria isso sozinha na própria tesouraria."""
    cenario = _cenario_de(
        [
            _ordem("a", "cliente-unico", Direcao.OUT, 100),
            _ordem("b", "cliente-unico", Direcao.IN, 100),
        ]
    )
    ponto = montar_ponto(nome_mix="t", n_clientes=1, cenario=cenario, seed_base=0)

    assert ponto.taxa_netabilidade == Decimal(1)  # o motor neta tudo...
    assert ponto.volume_casado_incremental_brl == Decimal(0)  # ...e não serve de nada
    assert ponto.taxa_netabilidade_incremental == Decimal(0)


def test_incremental_nunca_e_negativo():
    """Quando o tempo impede um cliente de casar o próprio fluxo, o motor casa
    MENOS que o limite intra. A medida é um piso do valor criado, então o chão
    é zero — nunca um número negativo, que não significaria nada."""
    for ponto, _pool in _pontos_com_pool():
        assert ponto.volume_casado_incremental_brl >= Decimal(0)
        assert ponto.taxa_netabilidade_incremental >= Decimal(0)
        assert ponto.taxa_netabilidade_incremental <= ponto.taxa_netabilidade


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


def test_percentil_usa_o_posto_mais_proximo_e_nao_o_piso():
    """O docstring promete "posto mais próximo"; truncar dá o posto de baixo.

    Com 4 amostras e q=0.25 o posto exato é 0,75 — o vizinho é o índice 1, não o 0.
    """
    amostras = [Decimal("10"), Decimal("20"), Decimal("30"), Decimal("40")]

    assert _percentil(amostras, Decimal("0.25")) == Decimal("20")


def test_resumir_nao_mistura_horizontes_diferentes():
    """(mix, N, W) não identifica uma célula: dois horizontes diferentes com a mesma
    chave eram colapsados num resumo só, que reportava o horizonte do primeiro ponto
    e a mediana dos dois misturados."""
    base = {
        campo.name: (Decimal("1") if campo.type == "Decimal" else 1)
        for campo in dataclasses.fields(PontoVarredura)
    }
    base.update(nome_mix="equilibrado", n_clientes=2, janela_dias=1)
    base.pop("horizonte_dias")

    pontos = (
        PontoVarredura(horizonte_dias=60, **base),
        PontoVarredura(horizonte_dias=365, **base),
    )

    resumos = resumir(pontos)

    assert len(resumos) == 2
    assert {resumo.horizonte_dias for resumo in resumos} == {60, 365}
