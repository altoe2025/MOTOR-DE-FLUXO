"""Confirma que CADA um dos seis geradores é confiável sozinho, não só os dois
usados como exemplo em test_geracao.py (psp_inbound e payroll_fornecedor).

Roda cada arquétipo isolado num horizonte longo (10 anos) e verifica que
direção, cadência, buffer e mediana de ticket batem com o que está declarado
em motor/arquetipos.py. Não mistura arquétipos nem passa por simular(): isso
é a Etapa 3 (varredura), fora de escopo aqui.

As checagens estatísticas (direção, cadência, mediana) agregam várias seeds
independentes antes de comparar com o declarado — uma seed só não é
confiável para arquétipos de cadência baixa: para tesouraria_corporativa
(~182 ordens/10 anos), o desvio padrão de Poisson é ~13.5, então uma
tolerância de 10% (±18) é só ~1.3 sigma, e ~18% das tiragens individuais
caem fora disso por acaso, sem nenhum bug no gerador. Agregar N seeds reduz
o ruído por sqrt(N), como qualquer estimativa por Monte Carlo. O teste de
buffer continua por seed individual porque é invariante estrutural do
código (rng.integers dentro dos limites), não uma medida estatística — não
tem ruído para agregar.
"""

import itertools
import statistics

import pytest

from motor.arquetipos import TODOS
from motor.dominio import Direcao
from motor.geracao import gerar_ordens

HORIZONTE_LONGO = 3650  # 10 anos
NOMES_ORDENADOS = sorted(TODOS.keys())
SEEDS = [1, 2, 3, 4, 5]


def _pool_multi_seed(arquetipo):
    """Concatena as ordens de várias seeds independentes do mesmo arquétipo,
    só para reduzir ruído amostral nas checagens estatísticas abaixo. Cada
    seed continua sendo gerada por uma chamada separada e determinista de
    gerar_ordens — isso nunca é usado como pool real de simulação."""
    ordens = []
    for seed in SEEDS:
        ordens.extend(gerar_ordens(arquetipo, "x", seed=seed, horizonte_dias=HORIZONTE_LONGO))
    return ordens


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_direcao_bate_com_p_out(nome_arquetipo):
    arquetipo = TODOS[nome_arquetipo]
    ordens = _pool_multi_seed(arquetipo)
    frac_out = sum(1 for o in ordens if o.direcao == Direcao.OUT) / len(ordens)
    assert abs(frac_out - arquetipo.p_out) < 0.05


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_cadencia_bate_com_o_esperado(nome_arquetipo):
    arquetipo = TODOS[nome_arquetipo]
    ordens = _pool_multi_seed(arquetipo)
    esperado = arquetipo.cadencia_mensal * HORIZONTE_LONGO / 30 * len(SEEDS)
    assert abs(len(ordens) - esperado) / esperado < 0.10


@pytest.mark.parametrize("nome_arquetipo,seed", list(itertools.product(NOMES_ORDENADOS, SEEDS)))
def test_buffer_dentro_dos_limites_declarados(nome_arquetipo, seed):
    arquetipo = TODOS[nome_arquetipo]
    ordens = gerar_ordens(arquetipo, "x", seed=seed, horizonte_dias=HORIZONTE_LONGO)
    for o in ordens:
        buffer = o.dia_limite - o.dia_conhecida
        assert arquetipo.buffer_dias_min <= buffer <= arquetipo.buffer_dias_max


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_mediana_do_ticket_bate_com_o_declarado(nome_arquetipo):
    arquetipo = TODOS[nome_arquetipo]
    ordens = _pool_multi_seed(arquetipo)
    mediana_gerada = statistics.median(float(o.valor_brl) for o in ordens)
    mediana_declarada = float(arquetipo.ticket_mediana_brl)
    # tolerância larga: lognormal tem cauda longa, mediana amostral oscila mais
    # que a média para n moderado
    assert abs(mediana_gerada - mediana_declarada) / mediana_declarada < 0.15
