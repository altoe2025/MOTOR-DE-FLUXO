"""Varredura em grade: (mix de arquétipos × N de clientes × W de janela) -> CSV.

Esta é a camada que responde a pergunta do projeto — "com que mistura de
arquétipos de cliente o netting passa a valer a pena, e qual parâmetro domina o
resultado" — e não é `simular()` rodado uma vez com uma pool grande. É `simular()`
rodado em grade, variando composição de carteira, escala e janela, para que a
economia possa ser lida como superfície e não como número solto.

Por isso cada ponto do CSV carrega a decomposição de custo (IOF, carry, spread,
espera, fixo) dos dois lados: sem ela dá para ver QUANTO se economiza, mas não
DE ONDE vem a economia — e é o "de onde" que diz qual dado a Amanda precisa
caçar primeiro.

## A regra que não pode quebrar

A pool de ordens de um (mix, N) é gerada UMA vez e reusada em todos os W daquele
ponto. Regerar por W com seed diferente somaria o ruído amostral de
`gerar_ordens` ao efeito real da janela, e a varredura passaria a medir sorte de
seed. `montar_pool_do_ponto` nem sequer aceita `janela_dias` como argumento, e
`rodar_varredura` chama essa função no laço de N, fora do laço de W.

## Pureza

`montar_especificacao_pool`, `montar_pool_do_ponto` e `rodar_varredura` são
puras. `escrever_csv` é a única função com I/O de todo o pacote `motor` além do
loader de YAML em `dominio.py` e da CLI.

## Regra de importação

Consome as camadas de baixo (`arquetipos`, `mixes`, `geracao`, `simulacao`,
`dominio`); nenhuma delas importa esta. Nada aqui recalcula custo ou netting à
mão — tudo passa por `simulacao.simular`, que continua sendo a fonte da verdade.
"""

from __future__ import annotations

import csv
import dataclasses
import hashlib
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Mapping, Sequence

from motor.dominio import Cenario, Ciclo, Direcao, Ordem, ParametrosCusto, TipoAlocacao
from motor.geracao import gerar_pool
from motor.mixes import Mix, normalizar, validar_mix
from motor.simulacao import simular

_MIX_ANONIMO = "(sem nome)"

IOF_POR_FINALIDADE: dict[tuple[str, Direcao], Decimal] = {
    # Câmbio de exportação é isento. É exatamente o que o comentário em
    # arquetipos.py ("IOF 0% no ingresso — ver custo.py") sempre disse; o custo
    # é que nunca tinha lido o campo `finalidade`.
    ("ANEXO_V_RECEITA_EXPORTACAO", Direcao.IN): Decimal("0"),
    # Pagamento de importação: BENS é isento, SERVIÇOS paga 0,38%. Os dois caem
    # na mesma finalidade aqui e não temos o split — é a pergunta em aberto para
    # a Amanda. Usamos 0,38%, e a incerteza que sobra aponta PARA BAIXO: se o
    # fluxo for majoritariamente bens, a alíquota é 0 e a economia cai mais.
    ("ANEXO_V_BENS_SERVICOS", Direcao.OUT): Decimal("0.0038"),
    # Sem regra explícita aqui, caem no padrão de 3,5% / 0,38%:
    #   ANEXO_V_DISPONIBILIDADE (transferência a título próprio)  — 3,5% confere
    #   ANEXO_V_REMESSA_TERCEIRO                                  — 3,5% confere
    #   ANEXO_V_ATIVOS_VIRTUAIS                                   — INCERTO, verificar
    #   ANEXO_V_RECEITA_EXPORTACAO na direção OUT                 — combinação que
    #     não existe no mundo real (receita de exportação não sai do país). Ela
    #     aparece na pool porque `geracao.py` sorteia a direção ordem a ordem em
    #     vez de por cliente; some quando esse gerador for corrigido.
}
"""Alíquotas de IOF por (finalidade, direção). PROVISÓRIO — pesquisa, não parecer.

Levantado em 2026-09-04 a partir de fontes secundárias. A matéria está instável:
o Decreto 12.499/2025 unificou boa parte em 3,5%, o Congresso o sustou pelo
Decreto Legislativo 176/2025, e houve medida cautelar do STF depois. Confirmar o
que está efetivamente em vigor antes de qualquer número sair daqui.
"""

PARAMETROS_VARREDURA = ParametrosCusto(
    iof_out=Decimal("0.035"),
    iof_in=Decimal("0.0038"),
    carry_cnr=Decimal("0.0004"),
    spread_rail_bps=Decimal("25"),
    custo_fixo_remessa=Decimal("40"),
    # ZERO por decisão de produto, não por falta de calibração: o motor é camada
    # de orquestração, não custodia fundos. Ninguém tem dinheiro parado esperando
    # o ciclo fechar. A tolerância do cliente ("posso esperar 6 dias") já está no
    # modelo como RESTRIÇÃO — `buffer_dias_*` do arquétipo vira `dia_limite` da
    # ordem, e o P0 nunca a ultrapassa. Precificar a espera além disso contaria o
    # mesmo fenômeno duas vezes.
    custo_oportunidade_aa=Decimal("0"),
    ptax=Decimal("5.40"),
    iof_por_finalidade=IOF_POR_FINALIDADE,
)
"""Parâmetros de custo da varredura. Ainda placeholders — não são calibração de mercado.

`spread_rail_bps` e `custo_fixo_remessa` continuam sendo chutes de ordem de
grandeza, só para que esses componentes não fiquem zerados na decomposição do CSV.
As alíquotas de IOF agora vêm de pesquisa (ver `IOF_POR_FINALIDADE`), o que é
melhor que chute mas ainda não é parecer.

Diferença deliberada para `exemplo_amanda.yaml`, que zera spread e fixo e não
declara tabela de finalidade: lá o objetivo é preservar o número de aceitação;
aqui é descobrir a que a economia é sensível.
"""


@dataclass(frozen=True)
class PontoVarredura:
    """Uma célula da grade: um (mix, N, W) já simulado. A ordem dos campos é a
    ordem das colunas do CSV."""

    nome_mix: str
    n_clientes: int
    janela_dias: int
    horizonte_dias: int
    seed_base: int

    n_ordens: int
    n_ciclos: int
    volume_bruto_brl: Decimal
    volume_casado_brl: Decimal
    volume_residuo_brl: Decimal
    taxa_netabilidade: Decimal

    # O melhor que QUALQUER política conseguiria nesta pool, e quanto disso a
    # política de fato extraiu. Sem as duas, uma netabilidade alta é ambígua:
    # pode ser carteira naturalmente equilibrada ou política boa numa carteira
    # ruim — conclusões opostas para o produto.
    teto_netabilidade: Decimal
    eficiencia_vs_teto: Decimal

    # Netting que só existe porque clientes DIFERENTES se encontraram. Um cliente
    # com fluxo nos dois sentidos casa o próprio saldo na tesouraria dele, sem
    # produto nenhum; contar isso como valor criado infla a proposta. O limite
    # intra é o teto do que os clientes fariam sozinhos, e o incremental é o que
    # sobra depois de descontá-lo — um PISO do valor que o motor adiciona.
    limite_intra_cliente_brl: Decimal
    volume_casado_incremental_brl: Decimal
    taxa_netabilidade_incremental: Decimal

    baseline_total_brl: Decimal
    baseline_iof_brl: Decimal
    baseline_carry_brl: Decimal
    baseline_spread_brl: Decimal
    baseline_espera_brl: Decimal
    baseline_fixo_brl: Decimal

    netado_total_brl: Decimal
    netado_iof_brl: Decimal
    netado_carry_brl: Decimal
    netado_spread_brl: Decimal
    netado_espera_brl: Decimal
    netado_fixo_brl: Decimal

    economia_brl: Decimal
    economia_pct: Decimal
    economia_por_ordem_brl: Decimal

    # O preço que o cliente pagou pela economia acima. Sem estas colunas a grade
    # mede metade do trade-off: esperar mais sempre neta mais, então com custo
    # como métrica única o ótimo da varredura é "espere o máximo possível" — um
    # ótimo que nenhum cliente aceita. O prazo é a restrição que impede esse
    # resultado degenerado, e ela só entra na leitura se sair no CSV.
    dias_espera_p90_volume_casado: Decimal
    dias_espera_p90_volume_remetido: Decimal
    dias_espera_media_por_real: Decimal
    pct_volume_espera_truncada: Decimal


@dataclass(frozen=True)
class MetricasTempo:
    """Quanto cada real esperou parado antes de ser resolvido, em dias.

    p90 e não média nas duas primeiras porque a média esconde a cauda: média de 4
    dias com uma ordem que esperou 30 é um relatório bom sobre um cliente que
    cancela contrato. A promessa que o produto consegue fazer é sobre a cauda.

    `CASADO` e `REMETIDO` separados porque são coisas diferentes: o volume casado
    esperou e economizou; o remetido esperou e atravessou a fronteira assim mesmo
    — espera que não comprou nada. Numa coluna só esse custo desaparece.

    Quando o conjunto está vazio (nenhuma alocação daquele tipo) o p90 sai 0. Isso
    é indistinguível de "tudo resolveu no mesmo dia" olhando só esta coluna — quem
    lê o CSV desempata pela coluna `volume_casado_brl` da mesma linha.

    `pct_volume_espera_truncada` é a ressalva que acompanha os três primeiros:
    quanto do volume pertence a ordens cujo `dia_limite` cai depois do horizonte.
    `executar_p0` drena essas ordens no último dia para não quebrar a conservação,
    então a espera delas sai MENOR do que teria sido — foram resolvidas por fim de
    simulação, não por prazo. Elas continuam dentro dos percentis: excluí-las
    trocaria um viés por outro. A coluna diz qual fatia dos tempos está encurtada.
    """

    dias_espera_p90_volume_casado: Decimal
    dias_espera_p90_volume_remetido: Decimal
    dias_espera_media_por_real: Decimal
    pct_volume_espera_truncada: Decimal


def _percentil_ponderado(
    pares: Sequence[tuple[Decimal, Decimal]], q: Decimal
) -> Decimal:
    """Percentil de `valor` ponderado por `peso`, sobre pares `(valor, peso)`.

    Ordena por valor, acumula o peso e devolve o valor onde o acumulado cruza `q`
    do peso total. NÃO é o percentil sobre a lista de valores ignorando o peso de
    cada um — esse cálculo daria a uma alocação de R$ 1 mil o mesmo peso que a uma
    de R$ 5 mi, e o resultado passaria a descrever a contagem de alocações em vez
    do volume do cliente. Ver
    `test_percentil_e_ponderado_por_volume_e_nao_por_contagem_de_alocacao`.

    Não interpola, pelo mesmo motivo de `_percentil`: interpolar inventaria um
    prazo que nenhuma alocação teve. Pura.
    """
    total = sum((peso for _, peso in pares), Decimal(0))
    if total <= 0:
        return Decimal(0)

    alvo = total * q
    acumulado = Decimal(0)
    valor = Decimal(0)
    for valor, peso in sorted(pares, key=lambda par: par[0]):
        acumulado += peso
        if acumulado >= alvo:
            return valor
    return valor


def metricas_de_tempo(
    ciclos: Iterable[Ciclo], ordens: Iterable[Ordem], horizonte_dias: int
) -> MetricasTempo:
    """Tempo até resolução de uma simulação, em dias. Pura.

    A unidade de medida é a ALOCAÇÃO, ponderada por volume, e não a ordem: uma
    ordem coberta em tranches (60% casada no dia 5, 40% remetida no dia 12) não
    tem um tempo de espera único, e cada real conta o tempo que ELE ficou parado.
    Isso mantém a métrica de tempo na mesma base da métrica de custo, que também é
    por volume — é essa coincidência de base que sustenta a identidade verificada
    em `test_identidade_com_o_termo_de_espera_do_custo`.

    O baseline não entra na conta porque nele `dia_exec == dia_conhecida`: toda
    espera medida aqui foi causada pelo netting, sem precisar subtrair nada.

    Volume sem alocação nenhuma não existe: `executar_p0` drena o que sobrou no fim
    do horizonte e levanta exceção se alguma ordem ficar aberta. É por isso que a
    quarta métrica NÃO é volume sem alocação (seria zero em toda linha do CSV) e
    sim volume com espera truncada pela borda do horizonte — que é por onde o viés
    de fato entra. A invariante vive em
    `tests/test_tempo.py::test_toda_ordem_recebe_alocacao_dentro_do_horizonte`.
    """
    # Materializa: `ordens` é iterável, e ele é percorrido duas vezes (o índice de
    # dia_conhecida e o volume bruto do denominador da censura).
    pool = tuple(ordens)
    dia_conhecida = {ordem.id: ordem.dia_conhecida for ordem in pool}

    casado: list[tuple[Decimal, Decimal]] = []
    remetido: list[tuple[Decimal, Decimal]] = []
    espera_x_volume = Decimal(0)
    volume_alocado = Decimal(0)

    for ciclo in ciclos:
        for alocacao in ciclo.alocacoes:
            espera = Decimal(alocacao.dia - dia_conhecida[alocacao.ordem_id])
            par = (espera, alocacao.valor_brl)
            if alocacao.tipo is TipoAlocacao.CASADO:
                casado.append(par)
            else:
                remetido.append(par)
            espera_x_volume += alocacao.valor_brl * espera
            volume_alocado += alocacao.valor_brl

    volume_bruto = sum((ordem.valor_brl for ordem in pool), Decimal(0))
    volume_truncado = sum(
        (ordem.valor_brl for ordem in pool if ordem.dia_limite > horizonte_dias),
        Decimal(0),
    )

    return MetricasTempo(
        dias_espera_p90_volume_casado=_percentil_ponderado(casado, Decimal("0.90")),
        dias_espera_p90_volume_remetido=_percentil_ponderado(remetido, Decimal("0.90")),
        dias_espera_media_por_real=(
            espera_x_volume / volume_alocado if volume_alocado else Decimal(0)
        ),
        pct_volume_espera_truncada=(
            volume_truncado / volume_bruto if volume_bruto else Decimal(0)
        ),
    )


def _seed_do_cliente(seed_base: int, nome_arquetipo: str, indice: int) -> int:
    """Seed determinista de um cliente, derivada de (seed_base, arquétipo, índice).

    Não usa `hash()`: o hash de string do CPython é randomizado por processo
    (PYTHONHASHSEED), o que quebraria a reprodutibilidade entre execuções.

    Depender de (arquétipo, índice) e não da posição global do cliente é o que faz
    `remessa_outbound_massiva-0003` ter a mesma seed em N=10 e em N=1000: aumentar
    N acrescenta clientes em vez de reamostrar os que já existiam, então o eixo N
    da varredura mede escala, não reamostragem.
    """
    material = f"{seed_base}|{nome_arquetipo}|{indice}".encode("utf-8")
    return int.from_bytes(hashlib.blake2b(material, digest_size=8).digest(), "big") % (2**63)


def _alocar_clientes(mix: Mix, n_clientes: int) -> dict[str, int]:
    """Distribui `n_clientes` entre os arquétipos proporcionalmente aos pesos.

    Método de D'Hondt (maiores médias): entrega um cliente por vez ao arquétipo com
    maior `peso / (já_alocados + 1)`, empate resolvido pela ordem alfabética do nome.

    D'Hondt é house-monotone — a alocação de N clientes é sempre subconjunto da de
    N+1 — o que dá a propriedade de aninhamento do eixo N. O método de maiores
    sobras (Hare) seria mais proporcional mas sofre do paradoxo do Alabama:
    aumentar N poderia TIRAR um cliente de um arquétipo, embaralhando a pool entre
    dois pontos da grade e virando ruído no lugar de efeito de escala.
    """
    pesos = normalizar(mix)
    candidatos = sorted(nome for nome, peso in pesos.items() if peso > 0)
    contagem = {nome: 0 for nome in candidatos}

    for _ in range(n_clientes):
        escolhido = max(candidatos, key=lambda nome: pesos[nome] / (contagem[nome] + 1))
        contagem[escolhido] += 1

    return contagem


def montar_especificacao_pool(
    mix: Mix, n_clientes: int, seed_base: int
) -> dict[str, tuple[str, int]]:
    """Monta a especificação `cliente_id -> (nome_arquetipo, seed)` de um (mix, N).

    É exatamente o formato que `motor.geracao.gerar_pool` consome. Pura.
    """
    if n_clientes < 0:
        raise ValueError(f"n_clientes deve ser >= 0, recebeu {n_clientes}")

    validar_mix(_MIX_ANONIMO, mix)
    contagem = _alocar_clientes(mix, n_clientes)

    return {
        f"{nome_arquetipo}-{indice:04d}": (
            nome_arquetipo,
            _seed_do_cliente(seed_base, nome_arquetipo, indice),
        )
        for nome_arquetipo in sorted(contagem)
        for indice in range(contagem[nome_arquetipo])
    }


def montar_pool_do_ponto(
    mix: Mix, n_clientes: int, horizonte_dias: int, seed_base: int
) -> tuple[Ordem, ...]:
    """Gera a pool de ordens de um (mix, N). Pura.

    Não recebe `janela_dias` de propósito: a pool de um ponto da grade é a mesma
    para todos os W testados nele. Ver a regra no docstring do módulo.
    """
    especificacao = montar_especificacao_pool(mix, n_clientes, seed_base)
    return gerar_pool(especificacao, horizonte_dias)


def montar_ponto(
    nome_mix: str,
    n_clientes: int,
    cenario: Cenario,
    seed_base: int,
    volume_bruto: Decimal | None = None,
) -> PontoVarredura:
    """Simula um `Cenario` e embrulha o `Resultado` numa linha da grade. Pura.

    `janela_dias`, `horizonte_dias` e a pool saem do próprio `cenario` — não há
    como um ponto discordar do cenário que o produziu. `nome_mix`, `n_clientes` e
    `seed_base` são só rótulos de proveniência: o cenário não os conhece.

    `volume_bruto` é opcional apenas como cache: `rodar_varredura` soma o volume da
    pool uma vez por (mix, N) e reaproveita em todos os W. Omitido, é derivado aqui.

    Aceitar um `Cenario` qualquer (e não só um gerado pela grade) é o que permite
    passar o cenário da Amanda por este mesmo caminho e conferir o número de
    aceitação — ver `test_celula_do_grid_reproduz_o_numero_de_aceitacao_da_amanda`.
    """
    pool = cenario.ordens
    if volume_bruto is None:
        volume_bruto = sum((ordem.valor_brl for ordem in pool), Decimal(0))

    janela_dias = cenario.janela_dias
    horizonte_dias = cenario.horizonte_dias

    resultado = simular(cenario)
    baseline = resultado.baseline
    netado = resultado.netado

    # `ciclo.casado` é grandeza de UMA perna (o mínimo entre os dois lados), mas o
    # volume que deixou de atravessar são as DUAS — os reais que ficaram no Brasil e
    # a moeda que ficou lá fora. `volume_bruto` conta as duas pernas, então sem o
    # fator 2 as colunas do CSV não fecham entre si e `volume_casado_brl /
    # volume_bruto_brl` dá metade da coluna `taxa_netabilidade` da mesma linha.
    volume_casado = sum((ciclo.casado for ciclo in resultado.ciclos), Decimal(0)) * 2
    volume_residuo = sum((ciclo.residuo for ciclo in resultado.ciclos), Decimal(0))

    economia_pct = resultado.economia / baseline.total if baseline.total else Decimal(0)
    economia_por_ordem = resultado.economia / len(pool) if pool else Decimal(0)

    # O teto é propriedade da POOL, não da política: a soma dos resíduos nunca
    # fica abaixo do desbalanço total entre os dois lados, então nem um ciclo
    # único que enxergasse a pool inteira netaria mais que isto.
    lado_out = sum((o.valor_brl for o in pool if o.direcao is Direcao.OUT), Decimal(0))
    lado_in = sum((o.valor_brl for o in pool if o.direcao is Direcao.IN), Decimal(0))
    total_pernas = lado_out + lado_in
    teto = 1 - abs(lado_out - lado_in) / total_pernas if total_pernas else Decimal(0)
    eficiencia = resultado.taxa_netabilidade / teto if teto else Decimal(0)

    # `2 × min(manda, recebe)` por cliente: o teto do que a tesouraria dele
    # resolveria sem contraparte externa. Subtraído do casado, sobra um PISO do
    # netting que só aconteceu porque dois clientes diferentes se encontraram —
    # piso, e não valor exato, porque o casamento é agregado e não diz quem casou
    # com quem. O chão é zero: quando o tempo impede um cliente de casar o próprio
    # fluxo, o motor casa menos que o limite intra, e um número negativo aqui não
    # significaria nada.
    por_cliente: dict[str, list[Decimal]] = {}
    for ordem in pool:
        lados = por_cliente.setdefault(ordem.cliente_id, [Decimal(0), Decimal(0)])
        lados[0 if ordem.direcao is Direcao.OUT else 1] += ordem.valor_brl
    limite_intra = sum(
        (2 * min(saida, entrada) for saida, entrada in por_cliente.values()), Decimal(0)
    )
    casado_incremental = max(Decimal(0), volume_casado - limite_intra)
    netabilidade_incremental = (
        casado_incremental / volume_bruto if volume_bruto else Decimal(0)
    )

    tempo = metricas_de_tempo(resultado.ciclos, pool, horizonte_dias)

    return PontoVarredura(
        nome_mix=nome_mix,
        n_clientes=n_clientes,
        janela_dias=janela_dias,
        horizonte_dias=horizonte_dias,
        seed_base=seed_base,
        n_ordens=len(pool),
        n_ciclos=len(resultado.ciclos),
        volume_bruto_brl=volume_bruto,
        volume_casado_brl=volume_casado,
        volume_residuo_brl=volume_residuo,
        taxa_netabilidade=resultado.taxa_netabilidade,
        teto_netabilidade=teto,
        eficiencia_vs_teto=eficiencia,
        limite_intra_cliente_brl=limite_intra,
        volume_casado_incremental_brl=casado_incremental,
        taxa_netabilidade_incremental=netabilidade_incremental,
        baseline_total_brl=baseline.total,
        baseline_iof_brl=baseline.iof,
        baseline_carry_brl=baseline.carry,
        baseline_spread_brl=baseline.spread,
        baseline_espera_brl=baseline.espera,
        baseline_fixo_brl=baseline.fixo,
        netado_total_brl=netado.total,
        netado_iof_brl=netado.iof,
        netado_carry_brl=netado.carry,
        netado_spread_brl=netado.spread,
        netado_espera_brl=netado.espera,
        netado_fixo_brl=netado.fixo,
        economia_brl=resultado.economia,
        economia_pct=economia_pct,
        economia_por_ordem_brl=economia_por_ordem,
        dias_espera_p90_volume_casado=tempo.dias_espera_p90_volume_casado,
        dias_espera_p90_volume_remetido=tempo.dias_espera_p90_volume_remetido,
        dias_espera_media_por_real=tempo.dias_espera_media_por_real,
        pct_volume_espera_truncada=tempo.pct_volume_espera_truncada,
    )


def rodar_varredura(
    mixes: Mapping[str, Mix],
    valores_n: Sequence[int],
    valores_w: Sequence[int],
    valores_seed: Sequence[int],
    horizonte_dias: int,
    custo: ParametrosCusto,
) -> tuple[PontoVarredura, ...]:
    """Roda a grade (mix × N × W × seed) e devolve um ponto por célula. Pura.

    O eixo de seeds existe porque uma célula rodada com uma seed só é UMA amostra.
    Em N baixo isso é ruído — em `corporativo_pesado` com N=3, vinte seeds vão de
    +12% a +36% de economia. Sem repetição, comparar dois mixes nessa faixa é
    comparar sorte. Use `resumir` para colapsar o eixo em mediana + faixa.

    A pool de cada (mix, N, seed) é gerada uma única vez, no laço de seed, e
    reusada em todos os W. Não mova essa chamada para dentro do laço de W: o W é
    o único eixo que precisa enxergar exatamente a mesma pool, senão o ruído
    amostral entra somado ao efeito da janela.
    """
    pontos: list[PontoVarredura] = []

    for nome_mix, mix in mixes.items():
        for n_clientes in valores_n:
            for seed_base in valores_seed:
                pool = montar_pool_do_ponto(mix, n_clientes, horizonte_dias, seed_base)
                volume_bruto = sum((ordem.valor_brl for ordem in pool), Decimal(0))

                for janela_dias in valores_w:
                    cenario = Cenario(
                        ordens=pool,
                        janela_dias=janela_dias,
                        horizonte_dias=horizonte_dias,
                        custo=custo,
                    )
                    pontos.append(
                        montar_ponto(
                            nome_mix=nome_mix,
                            n_clientes=n_clientes,
                            cenario=cenario,
                            seed_base=seed_base,
                            volume_bruto=volume_bruto,
                        )
                    )

    return tuple(pontos)


@dataclass(frozen=True)
class ResumoCelula:
    """Uma célula (mix, N, W) com o eixo de seeds colapsado em mediana + faixa.

    `economia_pct_min`/`max` são a pior e a melhor seed, não intervalo de confiança
    — com poucas seeds a faixa É o resultado, e apertá-la em uma estatística só
    esconderia justamente o que se quer ver.
    """

    nome_mix: str
    n_clientes: int
    janela_dias: int
    horizonte_dias: int
    n_seeds: int

    n_ordens_p50: Decimal
    taxa_netabilidade_p50: Decimal
    teto_netabilidade_p50: Decimal
    eficiencia_vs_teto_p50: Decimal
    taxa_netabilidade_incremental_p50: Decimal

    economia_pct_min: Decimal
    economia_pct_p25: Decimal
    economia_pct_p50: Decimal
    economia_pct_p75: Decimal
    economia_pct_max: Decimal

    economia_brl_min: Decimal
    economia_brl_p50: Decimal

    frac_seeds_positiva: Decimal


def _percentil(ordenados: Sequence[Decimal], q: Decimal) -> Decimal:
    """Percentil por posto mais próximo — sem interpolar.

    Interpolar inventaria um valor que nenhuma seed produziu. Com poucas seeds
    isso é pior que arredondar para a amostra vizinha.
    """
    # Arredonda para o posto mais próximo (meio para cima). `int(...)` truncava, o que
    # é PISO — com 4 seeds e q=0,25 devolvia a pior seed em vez da vizinha.
    posto = (Decimal(len(ordenados)) - 1) * q
    indice = int(posto.to_integral_value(rounding=ROUND_HALF_UP))
    return ordenados[indice]


def _mediana(ordenados: Sequence[Decimal]) -> Decimal:
    meio = len(ordenados) // 2
    if len(ordenados) % 2:
        return ordenados[meio]
    return (ordenados[meio - 1] + ordenados[meio]) / 2


def resumir(pontos: Iterable[PontoVarredura]) -> tuple[ResumoCelula, ...]:
    """Colapsa o eixo de seeds: um `ResumoCelula` por (mix, N, W). Pura.

    Preserva a ordem em que cada célula apareceu pela primeira vez, para o CSV
    resumido sair na mesma ordem de leitura da grade crua.
    """
    # O horizonte entra na chave: sem ele, dois horizontes diferentes com o mesmo
    # (mix, N, W) viravam um resumo só, que reportava o horizonte do primeiro ponto e
    # tirava mediana de amostras que não são comparáveis entre si.
    grupos: dict[tuple[str, int, int, int], list[PontoVarredura]] = {}
    for ponto in pontos:
        chave = (ponto.nome_mix, ponto.n_clientes, ponto.janela_dias, ponto.horizonte_dias)
        grupos.setdefault(chave, []).append(ponto)

    resumos: list[ResumoCelula] = []
    for (nome_mix, n_clientes, janela_dias, horizonte_dias), do_grupo in grupos.items():
        pcts = sorted(p.economia_pct for p in do_grupo)
        brls = sorted(p.economia_brl for p in do_grupo)
        ordens = sorted(Decimal(p.n_ordens) for p in do_grupo)
        taxas = sorted(p.taxa_netabilidade for p in do_grupo)
        tetos = sorted(p.teto_netabilidade for p in do_grupo)
        eficiencias = sorted(p.eficiencia_vs_teto for p in do_grupo)
        incrementais = sorted(p.taxa_netabilidade_incremental for p in do_grupo)
        positivas = sum(1 for valor in pcts if valor > 0)

        resumos.append(
            ResumoCelula(
                nome_mix=nome_mix,
                n_clientes=n_clientes,
                janela_dias=janela_dias,
                horizonte_dias=horizonte_dias,
                n_seeds=len(do_grupo),
                n_ordens_p50=_mediana(ordens),
                taxa_netabilidade_p50=_mediana(taxas),
                teto_netabilidade_p50=_mediana(tetos),
                eficiencia_vs_teto_p50=_mediana(eficiencias),
                taxa_netabilidade_incremental_p50=_mediana(incrementais),
                economia_pct_min=pcts[0],
                economia_pct_p25=_percentil(pcts, Decimal("0.25")),
                economia_pct_p50=_mediana(pcts),
                economia_pct_p75=_percentil(pcts, Decimal("0.75")),
                economia_pct_max=pcts[-1],
                economia_brl_min=brls[0],
                economia_brl_p50=_mediana(brls),
                frac_seeds_positiva=Decimal(positivas) / Decimal(len(do_grupo)),
            )
        )

    return tuple(resumos)


COLUNAS: tuple[str, ...] = tuple(campo.name for campo in dataclasses.fields(PontoVarredura))

# Campos que são fração, não dinheiro: precisam de mais casas para não virar degrau.
_CASAS_DECIMAIS = {
    "taxa_netabilidade": Decimal("0.000001"),
    "taxa_netabilidade_p50": Decimal("0.000001"),
    "teto_netabilidade": Decimal("0.000001"),
    "teto_netabilidade_p50": Decimal("0.000001"),
    "eficiencia_vs_teto": Decimal("0.000001"),
    "eficiencia_vs_teto_p50": Decimal("0.000001"),
    "economia_pct": Decimal("0.000001"),
    "economia_pct_min": Decimal("0.000001"),
    "economia_pct_p25": Decimal("0.000001"),
    "economia_pct_p50": Decimal("0.000001"),
    "economia_pct_p75": Decimal("0.000001"),
    "economia_pct_max": Decimal("0.000001"),
    "frac_seeds_positiva": Decimal("0.000001"),
    "pct_volume_espera_truncada": Decimal("0.000001"),
    # Dias, não dinheiro. Duas casas dão ~15 minutos de granularidade, que é mais
    # resolução do que a decisão de produto precisa — mas arredondar para inteiro
    # esconderia a diferença entre janelas vizinhas na grade.
    "dias_espera_p90_volume_casado": Decimal("0.01"),
    "dias_espera_p90_volume_remetido": Decimal("0.01"),
    "dias_espera_media_por_real": Decimal("0.01"),
}
_CASAS_PADRAO = Decimal("0.01")


def _formatar(nome_campo: str, valor: object) -> object:
    if not isinstance(valor, Decimal):
        return valor
    quantum = _CASAS_DECIMAIS.get(nome_campo, _CASAS_PADRAO)
    return valor.quantize(quantum, rounding=ROUND_HALF_UP)


def escrever_csv(pontos: Iterable[object], caminho: str, tipo: type = PontoVarredura) -> None:
    """Escreve linhas num CSV, uma por item, na ordem recebida.

    `tipo` diz de qual dataclass tirar as colunas — `PontoVarredura` (grade crua)
    ou `ResumoCelula` (grade agregada por seed). É parâmetro e não inferência do
    primeiro item porque uma sequência vazia ainda precisa escrever o cabeçalho.

    Única função com I/O deste módulo. Decimais são arredondados aqui — apenas na
    apresentação: `PontoVarredura` guarda o valor exato que `simular` devolveu, e
    é ele que os testes comparam. Sem isso, divisões (taxa de netabilidade,
    economia por ordem) vazariam 28 dígitos para dentro do CSV.

    `*.csv` está no `.gitignore` do projeto: a saída da varredura é resultado de
    execução, não fonte.
    """
    colunas = tuple(campo.name for campo in dataclasses.fields(tipo))
    with open(caminho, "w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=colunas, lineterminator="\n")
        escritor.writeheader()
        for ponto in pontos:
            linha = dataclasses.asdict(ponto)
            escritor.writerow({nome: _formatar(nome, linha[nome]) for nome in colunas})
