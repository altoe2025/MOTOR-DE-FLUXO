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
import math
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


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_dispersao_do_ticket_bate_com_sigma_declarado(nome_arquetipo):
    """A mediana não depende de sigma (mediana da lognormal = exp(mu)) — um bug
    que zera ou ignora ticket_sigma passaria pelo teste de mediana acima sem
    ser notado. Este teste olha para o desvio padrão de log(valor_brl), que é
    exatamente sigma por construção da lognormal."""
    arquetipo = TODOS[nome_arquetipo]
    ordens = _pool_multi_seed(arquetipo)
    logs = [math.log(float(o.valor_brl)) for o in ordens]
    sigma_amostral = statistics.stdev(logs)
    assert abs(sigma_amostral - arquetipo.ticket_sigma) / arquetipo.ticket_sigma < 0.20


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_buffer_cobre_todo_o_intervalo_declarado(nome_arquetipo):
    """O teste de bounds (acima) passaria mesmo se o buffer nunca variasse —
    por exemplo se rng.integers fosse trocado por um valor fixo. Este teste
    checa que todo valor inteiro do intervalo declarado aparece pelo menos
    uma vez na amostra agregada (n suficientemente grande para tornar isso
    praticamente certo se a amostragem for de fato uniforme)."""
    arquetipo = TODOS[nome_arquetipo]
    ordens = _pool_multi_seed(arquetipo)
    buffers_observados = {o.dia_limite - o.dia_conhecida for o in ordens}
    intervalo_esperado = set(range(arquetipo.buffer_dias_min, arquetipo.buffer_dias_max + 1))
    assert buffers_observados == intervalo_esperado


@pytest.mark.parametrize("nome_arquetipo", NOMES_ORDENADOS)
def test_dia_conhecida_espalhado_pelo_horizonte(nome_arquetipo):
    """O teste de bounds em test_nenhuma_ordem_conhecida_fora_do_horizonte
    (tests/test_geracao.py) passaria mesmo se dia_conhecida fosse sempre 0 —
    checa só o intervalo, não a distribuição dentro dele. Uniforme em
    [0, horizonte) tem média horizonte/2; um bug de concentração no início
    (ou no fim) do horizonte desloca essa média de forma detectável."""
    arquetipo = TODOS[nome_arquetipo]
    ordens = _pool_multi_seed(arquetipo)
    media = statistics.mean(o.dia_conhecida for o in ordens)
    media_esperada = HORIZONTE_LONGO / 2
    assert abs(media - media_esperada) / media_esperada < 0.10
