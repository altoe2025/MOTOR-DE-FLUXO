"""Agregação da grade por célula: mediana e faixa entre seeds, não ponto solto.

Uma célula (mix, N, W) rodada com uma seed só é UMA amostra. Em N baixo isso é
ruído: em `corporativo_pesado` com N=3, vinte seeds dão de +12% a +36% de
economia. Ler qualquer uma delas como "o" resultado é ler sorte.

`resumir` colapsa as seeds de cada célula em mediana + faixa + fração de seeds
com economia positiva. Quem comparar dois mixes passa a ver se as faixas se
sobrepõem antes de afirmar que um é melhor.

Isso NÃO corrige viés: barra de erro estreita num estimador enviesado continua
enviesada. Só impede confundir ruído com sinal.
"""

from decimal import Decimal

from motor import mixes
from motor.varredura import (
    PARAMETROS_VARREDURA,
    PontoVarredura,
    ResumoCelula,
    escrever_csv,
    resumir,
    rodar_varredura,
)

HORIZONTE = 90
VALORES_SEED = (1, 2, 3, 4)


def _grade():
    return rodar_varredura(
        mixes={"equilibrado": mixes.EQUILIBRADO, "retail_pesado": mixes.RETAIL_PESADO},
        valores_n=(4,),
        valores_w=(1, 7),
        valores_seed=VALORES_SEED,
        horizonte_dias=HORIZONTE,
        custo=PARAMETROS_VARREDURA,
    )


def _ponto_falso(nome_mix: str, economia_pct: str) -> PontoVarredura:
    """Ponto sintético só para exercitar a agregação com valores escolhidos."""
    zero = Decimal(0)
    return PontoVarredura(
        nome_mix=nome_mix,
        n_clientes=1,
        janela_dias=1,
        horizonte_dias=HORIZONTE,
        seed_base=0,
        n_ordens=10,
        n_ciclos=1,
        volume_bruto_brl=Decimal(100),
        volume_casado_brl=zero,
        volume_residuo_brl=zero,
        taxa_netabilidade=zero,
        baseline_total_brl=Decimal(100),
        baseline_iof_brl=zero,
        baseline_carry_brl=zero,
        baseline_spread_brl=zero,
        baseline_espera_brl=zero,
        baseline_fixo_brl=zero,
        netado_total_brl=zero,
        netado_iof_brl=zero,
        netado_carry_brl=zero,
        netado_spread_brl=zero,
        netado_espera_brl=zero,
        netado_fixo_brl=zero,
        economia_brl=Decimal(economia_pct) * Decimal(100),
        economia_pct=Decimal(economia_pct),
        economia_por_ordem_brl=zero,
    )


def test_uma_linha_por_celula_independente_do_numero_de_seeds():
    resumos = resumir(_grade())
    assert len(resumos) == 2 * 1 * 2  # mixes x N x W, sem o eixo de seed


def test_registra_quantas_seeds_entraram_na_celula():
    for resumo in resumir(_grade()):
        assert resumo.n_seeds == len(VALORES_SEED)


def test_nao_mistura_celulas_diferentes():
    chaves = {(r.nome_mix, r.n_clientes, r.janela_dias) for r in resumir(_grade())}
    assert len(chaves) == len(resumir(_grade()))


def test_com_uma_seed_so_a_faixa_colapsa_no_proprio_valor():
    grade = rodar_varredura(
        mixes={"equilibrado": mixes.EQUILIBRADO},
        valores_n=(4,),
        valores_w=(7,),
        valores_seed=(1,),
        horizonte_dias=HORIZONTE,
        custo=PARAMETROS_VARREDURA,
    )
    resumo = resumir(grade)[0]
    assert resumo.n_seeds == 1
    assert resumo.economia_pct_min == resumo.economia_pct_p50 == resumo.economia_pct_max
    assert resumo.economia_pct_p50 == grade[0].economia_pct


def test_a_mediana_fica_dentro_da_faixa():
    for r in resumir(_grade()):
        assert r.economia_pct_min <= r.economia_pct_p25 <= r.economia_pct_p50
        assert r.economia_pct_p50 <= r.economia_pct_p75 <= r.economia_pct_max


def test_faixa_de_seeds_e_realmente_larga_em_n_pequeno():
    """Se min == max, o eixo de seeds não estaria fazendo nada."""
    resumos = resumir(_grade())
    assert any(r.economia_pct_max > r.economia_pct_min for r in resumos)


def test_fracao_positiva_e_um_quando_todas_as_seeds_economizam():
    resumo = resumir([_ponto_falso("m", "0.10"), _ponto_falso("m", "0.30")])[0]
    assert resumo.frac_seeds_positiva == Decimal(1)


def test_fracao_positiva_conta_as_seeds_que_deram_prejuizo():
    pontos = [_ponto_falso("m", v) for v in ["-0.10", "0.10", "0.30", "0.50"]]
    resumo = resumir(pontos)[0]
    assert resumo.frac_seeds_positiva == Decimal("0.75")
    assert resumo.economia_pct_min == Decimal("-0.10")


def test_mediana_de_numero_par_de_seeds():
    pontos = [_ponto_falso("m", v) for v in ["0.10", "0.20", "0.30", "0.40"]]
    assert resumir(pontos)[0].economia_pct_p50 == Decimal("0.25")


def test_resumir_grade_vazia_devolve_nada():
    assert resumir([]) == ()


def test_resumo_vai_para_csv(tmp_path):
    destino = tmp_path / "resumo.csv"
    resumos = resumir(_grade())
    escrever_csv(resumos, str(destino), tipo=ResumoCelula)
    linhas = destino.read_text(encoding="utf-8").strip().splitlines()
    assert len(linhas) == len(resumos) + 1
    assert linhas[0].startswith("nome_mix,n_clientes,janela_dias")
