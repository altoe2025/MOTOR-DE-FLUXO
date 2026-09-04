"""Confirma que CADA um dos seis geradores é confiável sozinho, não só os dois
usados como exemplo em test_geracao.py (psp_inbound e payroll_fornecedor).

Roda cada arquétipo isolado num horizonte longo (10 anos) — para a lei dos
grandes números segurar a comparação estatística — e verifica que direção,
cadência, buffer e mediana de ticket batem com o que está declarado em
motor/arquetipos.py. Não mistura arquétipos nem passa por simular(): isso é a
Etapa 3 (varredura), fora de escopo aqui.
"""

import statistics

import pytest

from motor.arquetipos import TODOS
from motor.dominio import Direcao
from motor.geracao import gerar_ordens

HORIZONTE_LONGO = 3650  # 10 anos
NOMES_ORDENADOS = sorted(TODOS.keys())


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_direcao_bate_com_p_out(nome_arquetipo):
    arquetipo = TODOS[nome_arquetipo]
    ordens = gerar_ordens(arquetipo, "x", seed=1, horizonte_dias=HORIZONTE_LONGO)
    frac_out = sum(1 for o in ordens if o.direcao == Direcao.OUT) / len(ordens)
    assert abs(frac_out - arquetipo.p_out) < 0.05


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_cadencia_bate_com_o_esperado(nome_arquetipo):
    arquetipo = TODOS[nome_arquetipo]
    ordens = gerar_ordens(arquetipo, "x", seed=1, horizonte_dias=HORIZONTE_LONGO)
    esperado = arquetipo.cadencia_mensal * HORIZONTE_LONGO / 30
    assert abs(len(ordens) - esperado) / esperado < 0.10


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_buffer_dentro_dos_limites_declarados(nome_arquetipo):
    arquetipo = TODOS[nome_arquetipo]
    ordens = gerar_ordens(arquetipo, "x", seed=1, horizonte_dias=HORIZONTE_LONGO)
    for o in ordens:
        buffer = o.dia_limite - o.dia_conhecida
        assert arquetipo.buffer_dias_min <= buffer <= arquetipo.buffer_dias_max


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_mediana_do_ticket_bate_com_o_declarado(nome_arquetipo):
    arquetipo = TODOS[nome_arquetipo]
    ordens = gerar_ordens(arquetipo, "x", seed=1, horizonte_dias=HORIZONTE_LONGO)
    mediana_gerada = statistics.median(float(o.valor_brl) for o in ordens)
    mediana_declarada = float(arquetipo.ticket_mediana_brl)
    # tolerância larga: lognormal tem cauda longa, mediana amostral oscila mais
    # que a média para n moderado
    assert abs(mediana_gerada - mediana_declarada) / mediana_declarada < 0.15
