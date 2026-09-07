"""Tempo até resolução: quanto cada real esperou parado antes de ser resolvido.

O motor mede o custo do netting; estas métricas medem o que foi PAGO por ele. Sem
elas a varredura mede metade do trade-off: esperar mais sempre neta mais, então
com custo como métrica única o ótimo da grade é "espere o máximo", que é um ótimo
que nenhum cliente aceita. A restrição que impede esse resultado degenerado é o
prazo — e ela só entra na leitura se sair no CSV.

A unidade de medida é a ALOCAÇÃO, ponderada por volume, nunca a ordem: uma ordem
coberta em tranches esperou vários prazos diferentes, e cada real conta o tempo
que ELE ficou parado. É a mesma base do custo, que também é por volume — é isso
que torna possível a identidade de `test_identidade_com_o_termo_de_espera_do_custo`.
"""

import csv
from decimal import Decimal

from motor.custo import custo_netado
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.mixes import EQUILIBRADO
from motor.netting import executar_p0
from motor.varredura import (
    PARAMETROS_VARREDURA,
    _percentil_ponderado,
    escrever_csv,
    metricas_de_tempo,
    montar_ponto,
    montar_pool_do_ponto,
)

CUSTO_NEUTRO = ParametrosCusto(
    iof_out=Decimal("0.035"),
    iof_in=Decimal("0.0038"),
    carry_cnr=Decimal("0.0004"),
    spread_rail_bps=Decimal("0"),
    custo_fixo_remessa=Decimal("0"),
    custo_oportunidade_aa=Decimal("0"),
    ptax=Decimal("5.40"),
)


def _ordem(id_, direcao, valor, conhecida, limite):
    return Ordem(
        id=id_,
        cliente_id=f"cliente-{id_}",
        direcao=direcao,
        valor_brl=Decimal(valor),
        dia_conhecida=conhecida,
        dia_limite=limite,
        eh_efx=False,
        finalidade="x",
    )


def _cenario_conferido_a_mao() -> Cenario:
    """Três ordens, alocações previsíveis. `janela_dias` > horizonte de propósito:
    assim TODO fechamento é causado por uma ordem vencendo, e a sequência dá para
    prever à mão, ciclo a ciclo, sem rodar o motor.

    Previsão escrita ANTES de rodar (se o motor discordar, a previsão tem
    precedência até que se prove o contrário):

      dia  4: o2 (IN 60) vence e fecha o lote. bruto_out=100 (o1), bruto_in=60.
              casado=60 -> CASADO(o1, d4, 60) e CASADO(o2, d4, 60). Sobram 40 de
              o1, que NÃO saem: o1 só vence no dia 10, então continua aberta.
      dia  8: o3 (OUT 40) vence sem nenhum IN no lote. casado=0, e o3 sai sozinha
              -> REMETIDO(o3, d8, 40). o1 ainda tem folga e sobrevive.
      dia 10: o1 vence com 40 pendentes -> REMETIDO(o1, d10, 40).
    """
    return Cenario(
        ordens=(
            _ordem("o1", Direcao.OUT, "100", 0, 10),
            _ordem("o2", Direcao.IN, "60", 4, 4),
            _ordem("o3", Direcao.OUT, "40", 8, 8),
        ),
        janela_dias=100,
        horizonte_dias=20,
        custo=CUSTO_NEUTRO,
    )


def _cenario_com_espera_truncada() -> Cenario:
    """Uma ordem cujo `dia_limite` cai DEPOIS do horizonte.

    `executar_p0` drena o que sobrou no último dia para não quebrar a conservação
    (ver o laço de resíduo em netting.py: `venceu = ordem.dia_limite <= dia or
    fim_do_horizonte`). O efeito colateral é que a espera dessa ordem sai MENOR do
    que teria sido: ela foi resolvida por fim de simulação, não por prazo.

    Previsão escrita ANTES de rodar:

      dia  2: t2 (IN 60) vence e fecha o lote. bruto_out=100 (t1), bruto_in=60,
              casado=60 -> CASADO(t1, d2, 60) e CASADO(t2, d2, 60). Sobram 40 de
              t1, que tem folga até o dia 30 e continua aberta.
      dia 10: fim do horizonte. t1 ainda tem 40 pendentes e é drenada
              -> REMETIDO(t1, d10, 40). No dia 30, que é o prazo real dela, ela
              teria esperado 30 dias, não 10.
    """
    return Cenario(
        ordens=(
            _ordem("t1", Direcao.OUT, "100", 0, 30),
            _ordem("t2", Direcao.IN, "60", 2, 2),
        ),
        janela_dias=100,
        horizonte_dias=10,
        custo=CUSTO_NEUTRO,
    )


def test_volume_de_ordens_que_o_horizonte_truncou_e_reportado():
    """A borda do horizonte encurta a espera, e quem lê o CSV precisa ver quanto.

    Conta o volume DRENADO PELA BORDA, não o volume das ordens que poderiam ter
    sido drenadas. A distinção não é sutil: t1 vale 100, mas 60 dela casou
    normalmente no dia 2, com espera de 2 dias que nada tem de truncada. Só os 40
    que restaram foram resolvidos por fim de simulação.

        volume bruto = 100 (t1) + 60 (t2) = 160
        drenado na borda = 40 (a alocação de t1 no dia 10, e t1 vence no dia 30)
        pct = 40 / 160 = 0,25

    Contar a ordem inteira daria 100/160 = 0,625 — 2,5x o valor real. Em pools
    geradas essa superestimativa chega a 3,4x na mediana de alguns mixes, o que
    faria a coluna disparar alarme falso justamente na faixa em que ela deveria
    dizer que está tudo bem.

    As alocações dessas ordens CONTINUAM nos percentis — excluí-las trocaria um
    viés por outro, e sobrariam poucos dados. O que a coluna diz é qual fatia dos
    tempos está encurtada, não que os tempos sejam inválidos.

    media_ponderada = (60*2 + 60*0 + 40*10) / 160 = 520 / 160 = 3.25
    """
    cenario = _cenario_com_espera_truncada()
    ciclos = executar_p0(cenario)

    metricas = metricas_de_tempo(ciclos, cenario.ordens, cenario.horizonte_dias)

    assert metricas.pct_volume_espera_truncada == Decimal("0.25")
    assert metricas.dias_espera_media_por_real == Decimal("3.25")


def test_toda_ordem_recebe_alocacao_dentro_do_horizonte():
    """Invariante de conservação, no lugar certo: teste, não coluna do CSV.

    Isto já foi uma coluna (`volume_censurado_pct`, commit 8ed8a2b). Saiu porque
    é estruturalmente zero em toda linha: `executar_p0` drena o que sobrou no fim
    do horizonte e LEVANTA EXCEÇÃO se alguma ordem ficar aberta, além de conferir
    ordem a ordem que a soma das alocações é o `valor_brl`. Coluna que é sempre
    zero vira ruído que ninguém olha; a invariante, essa continua valendo.

    Se este teste cair, `metricas_de_tempo` passou a medir tempo sobre um volume
    menor que o da pool, e os três números de tempo viraram amostra enviesada de
    um subconjunto — sem nada no CSV para avisar.
    """
    horizonte = 180
    pool = montar_pool_do_ponto(
        EQUILIBRADO, n_clientes=6, horizonte_dias=horizonte, seed_base=7
    )
    cenario = Cenario(
        ordens=pool, janela_dias=7, horizonte_dias=horizonte, custo=CUSTO_NEUTRO
    )
    ciclos = executar_p0(cenario)

    volume_alocado = sum((a.valor_brl for c in ciclos for a in c.alocacoes), Decimal(0))
    volume_bruto = sum((o.valor_brl for o in pool), Decimal(0))

    assert volume_alocado == volume_bruto


def test_caso_pequeno_bate_com_a_conta_feita_a_mao():
    """Valores calculados no papel a partir do enunciado, antes de rodar o motor.

    Alocações previstas, com a espera de cada uma (dia da alocação - dia_conhecida):

        CASADO   o1 d4  60  espera  4      CASADO   o2 d4  60  espera 0
        REMETIDO o3 d8  40  espera  0      REMETIDO o1 d10 40  espera 10

    media_ponderada = (60*4 + 60*0 + 40*0 + 40*10) / (60+60+40+40)
                    = (240 + 400) / 200 = 640 / 200 = 3.2

    p90 casado: volume casado = 120; 90% de 120 = 108. Ordenado por espera:
        espera 0 -> acumulado  60  (< 108)
        espera 4 -> acumulado 120  (>= 108)  <- cruza aqui, p90 = 4

    p90 remetido: volume remetido = 80; 90% de 80 = 72. Ordenado por espera:
        espera  0 -> acumulado 40  (< 72)
        espera 10 -> acumulado 80  (>= 72)   <- cruza aqui, p90 = 10

    truncada: nenhuma das 3 tem `dia_limite` (10, 4, 8) além do horizonte (20),
    então 0.
    """
    cenario = _cenario_conferido_a_mao()
    ciclos = executar_p0(cenario)

    metricas = metricas_de_tempo(ciclos, cenario.ordens, cenario.horizonte_dias)

    assert metricas.dias_espera_media_por_real == Decimal("3.2")
    assert metricas.dias_espera_p90_volume_casado == Decimal(4)
    assert metricas.dias_espera_p90_volume_remetido == Decimal(10)
    assert metricas.pct_volume_espera_truncada == Decimal(0)


def test_percentil_e_ponderado_por_volume_e_nao_por_contagem_de_alocacao():
    """O peso é o volume, não a alocação. Uma alocação de R$ 1 mil não pode valer o
    mesmo que uma de R$ 5 mi.

    Pares (espera, volume), total 10.000:
        (1, 8000)  (2, 1000)  (100, 1000)

    Ponderado por volume: 90% de 10.000 = 9.000. Acumulando na ordem de espera,
        espera   1 -> 8000  (< 9000)
        espera   2 -> 9000  (>= 9000)  <- p90 = 2
    A cauda de espera 100 carrega só 10% do volume e fica FORA do p90.

    Se o percentil fosse por contagem, a lista seria [1, 2, 100] e o p90 cairia em
    100 — 50x maior. É essa diferença que este teste tranca.
    """
    pares = (
        (Decimal(1), Decimal(8000)),
        (Decimal(2), Decimal(1000)),
        (Decimal(100), Decimal(1000)),
    )

    assert _percentil_ponderado(pares, Decimal("0.90")) == Decimal(2)
    assert _percentil_ponderado(pares, Decimal("0.50")) == Decimal(1)


def test_identidade_com_o_termo_de_espera_do_custo():
    """Ancora a métrica nova no termo de custo que o motor já exercita.

        custo_espera == volume_alocado * dias_espera_media_por_real * oport / 365

    Se as duas formas discordarem, a agregação nova e `custo.py` discordam sobre o
    que é uma alocação, e é isso que precisa ser resolvido — não o teste.

    `custo_oportunidade_aa=0.01` existe SÓ aqui: o padrão do parâmetro continua
    zero por decisão de produto (ver `PARAMETROS_VARREDURA`). Com zero os dois
    lados dariam 0 == 0 e a identidade não provaria nada.

    A comparação é relativa, e não exata, porque as duas formas dividem por 365 em
    momentos diferentes: `custo.py` divide uma vez por alocação, a média ponderada
    divide uma vez só, no fim. Em `Decimal` (28 dígitos) isso deixa resíduo na
    última casa. O que o teste exige é que a diferença seja de arredondamento
    decimal, não de modelagem.
    """
    horizonte = 180
    pool = montar_pool_do_ponto(
        EQUILIBRADO, n_clientes=6, horizonte_dias=horizonte, seed_base=7
    )
    custo = ParametrosCusto(
        iof_out=PARAMETROS_VARREDURA.iof_out,
        iof_in=PARAMETROS_VARREDURA.iof_in,
        carry_cnr=PARAMETROS_VARREDURA.carry_cnr,
        spread_rail_bps=PARAMETROS_VARREDURA.spread_rail_bps,
        custo_fixo_remessa=PARAMETROS_VARREDURA.custo_fixo_remessa,
        custo_oportunidade_aa=Decimal("0.01"),
        ptax=PARAMETROS_VARREDURA.ptax,
        iof_por_finalidade=PARAMETROS_VARREDURA.iof_por_finalidade,
    )
    cenario = Cenario(ordens=pool, janela_dias=7, horizonte_dias=horizonte, custo=custo)
    ciclos = executar_p0(cenario)

    metricas = metricas_de_tempo(ciclos, pool, horizonte)
    volume_alocado = sum((a.valor_brl for c in ciclos for a in c.alocacoes), Decimal(0))

    pela_media = (
        volume_alocado
        * metricas.dias_espera_media_por_real
        * custo.custo_oportunidade_aa
        / Decimal(365)
    )
    pelo_custo = custo_netado(ciclos, cenario).espera

    assert pelo_custo > 0, "cenário sem espera nenhuma não testaria a identidade"
    assert abs(pela_media - pelo_custo) <= abs(pelo_custo) * Decimal("1e-20")


def test_as_quatro_colunas_de_tempo_saem_no_csv(tmp_path):
    """As métricas só servem se chegarem a quem lê a grade.

    A coluna de censura é fração, não dinheiro: precisa das seis casas de
    `_CASAS_DECIMAIS`, senão uma censura de 0,05% vira 0,00 no CSV e o aviso que
    ela existe para dar desaparece justamente na faixa em que ainda dava para
    confiar nos outros três números.
    """
    cenario = _cenario_conferido_a_mao()
    ponto = montar_ponto(
        nome_mix="conferido-a-mao", n_clientes=3, cenario=cenario, seed_base=0
    )
    caminho = tmp_path / "grade.csv"

    escrever_csv([ponto], str(caminho))

    with open(caminho, newline="", encoding="utf-8") as arquivo:
        linhas = list(csv.DictReader(arquivo))

    (linha,) = linhas
    assert linha["dias_espera_p90_volume_casado"] == "4.00"
    assert linha["dias_espera_p90_volume_remetido"] == "10.00"
    assert linha["dias_espera_media_por_real"] == "3.20"
    assert linha["pct_volume_espera_truncada"] == "0.000000"
