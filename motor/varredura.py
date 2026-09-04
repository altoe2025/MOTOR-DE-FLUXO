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

from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
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

    volume_casado = sum((ciclo.casado for ciclo in resultado.ciclos), Decimal(0))
    volume_residuo = sum((ciclo.residuo for ciclo in resultado.ciclos), Decimal(0))

    economia_pct = resultado.economia / baseline.total if baseline.total else Decimal(0)
    economia_por_ordem = resultado.economia / len(pool) if pool else Decimal(0)

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
    indice = int((len(ordenados) - 1) * q)
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
    grupos: dict[tuple[str, int, int], list[PontoVarredura]] = {}
    for ponto in pontos:
        chave = (ponto.nome_mix, ponto.n_clientes, ponto.janela_dias)
        grupos.setdefault(chave, []).append(ponto)

    resumos: list[ResumoCelula] = []
    for (nome_mix, n_clientes, janela_dias), do_grupo in grupos.items():
        pcts = sorted(p.economia_pct for p in do_grupo)
        brls = sorted(p.economia_brl for p in do_grupo)
        ordens = sorted(Decimal(p.n_ordens) for p in do_grupo)
        taxas = sorted(p.taxa_netabilidade for p in do_grupo)
        positivas = sum(1 for valor in pcts if valor > 0)

        resumos.append(
            ResumoCelula(
                nome_mix=nome_mix,
                n_clientes=n_clientes,
                janela_dias=janela_dias,
                horizonte_dias=do_grupo[0].horizonte_dias,
                n_seeds=len(do_grupo),
                n_ordens_p50=_mediana(ordens),
                taxa_netabilidade_p50=_mediana(taxas),
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
    "economia_pct": Decimal("0.000001"),
    "economia_pct_min": Decimal("0.000001"),
    "economia_pct_p25": Decimal("0.000001"),
    "economia_pct_p50": Decimal("0.000001"),
    "economia_pct_p75": Decimal("0.000001"),
    "economia_pct_max": Decimal("0.000001"),
    "frac_seeds_positiva": Decimal("0.000001"),
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
