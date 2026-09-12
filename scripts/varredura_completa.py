"""Varredura completa: a grade (mix x N x W x semente) -> dois CSVs.

Responde tres perguntas: quantos clientes a pool precisa ter, que mistura de
clientes, e quanto de espera cada configuracao custa ao cliente.

O eixo W tem DOIS niveis, nao seis. Uma medicao pareada anterior (30 sementes,
scripts/varredura_janela.py) mostrou que acima de W=7 a janela nao morde — W=7 e
W=30 sao decimalmente identicos em 30/30 sementes, porque o fechamento e sempre
disparado por vencimento de ordem. W=1 sobra so como contraste: demonstra que a
politica gulosa queima contraparte.

Nao usa `rodar_varredura` porque precisa de uma coluna a mais por ponto
(`fracao_in_realizada`), que nao existe em `PontoVarredura` e nao pode ser
acrescentada sem editar `motor/`. O laco abaixo reproduz a regra que importa:
**a pool de um (mix, N, semente) e gerada UMA vez e reusada nos dois W**. Regerar
por W somaria o ruido amostral de `gerar_ordens` ao efeito da janela, e a
comparacao entre janelas passaria a medir sorte de semente.

Le o motor, nao o modifica.
"""

from __future__ import annotations

import csv
import math
from decimal import Decimal
from pathlib import Path

from motor.dominio import Cenario, Direcao
from motor.mixes import TODOS
from motor.varredura import (
    COLUNAS,
    PARAMETROS_VARREDURA,
    _CASAS_DECIMAIS,
    montar_ponto,
    montar_pool_do_ponto,
)

HORIZONTE = 365
VALORES_N = (2, 3, 4, 6, 8, 12, 16, 24, 32)
VALORES_W = (1, 7)
SEMENTES = tuple(range(1, 301))
BPS = Decimal(10000)

SAIDA = Path("resultados")
RESSALVA = [
    "# Nivel absoluto NAO e cotacao. Duas celulas da tabela de aliquotas carregam 34,5%",
    "# do volume e nao foram verificadas em norma: BENS_SERVICOS OUT (0,38% no codigo,",
    "# comentario admite que bens isento e servicos foram colapsados) e ATIVOS_VIRTUAIS",
    "# OUT (3,5% por fallback, marcado INCERTO no proprio codigo). A margem de erro do",
    "# nivel e de cerca de 2x. A FORMA das curvas nao depende dessas celulas.",
]

COLUNAS_BRUTA = (*COLUNAS, "economia_bps", "fracao_in_realizada")
COLUNAS_AGREGADA = (
    "nome_mix",
    "n_clientes",
    "janela_dias",
    "horizonte_dias",
    "n_sementes",
    "economia_bps_p10",
    "economia_bps_p50",
    "economia_bps_p90",
    "dias_espera_p90_volume_casado_p50",
    "dias_espera_p90_volume_remetido_p50",
    "pct_volume_espera_truncada_p50",
    "fracao_in_realizada_p50",
    # O piso do valor que o motor de fato adiciona, descontado o que cada cliente
    # casaria sozinho na propria tesouraria. Sobe para o agregado porque a economia
    # bruta INCLUI autonetting, e em mixes OUT-pesados o incremental e zero: sem
    # esta coluna ao lado, a economia bruta seria lida como valor do produto.
    "taxa_netabilidade_incremental_p50",
    "taxa_netabilidade_p50",
)


def _formatar(nome: str, valor):
    """Como `motor.varredura._formatar`, mas conhece as colunas agregadas.

    O `_CASAS_DECIMAIS` do motor e indexado por nome de coluna, e os nomes daqui
    (`..._p50`, `fracao_in_realizada`) nao estao la — cairiam no padrao de 2 casas,
    e uma fracao com 2 casas vira degrau: 3,6% de volume truncado sairia como 0,04.
    """
    if not isinstance(valor, Decimal):
        return valor
    if nome.startswith(("pct_", "fracao_", "taxa_")) or nome in _CASAS_DECIMAIS:
        quantum = _CASAS_DECIMAIS.get(nome, Decimal("0.000001"))
    else:
        quantum = Decimal("0.01")
    return valor.quantize(quantum, rounding="ROUND_HALF_UP")


def _percentil(ordenados, q: Decimal) -> Decimal:
    """Posto mais proximo, sem interpolar — mesma convencao de `motor.varredura`.

    Interpolar inventaria um valor que nenhuma semente produziu.
    """
    if not ordenados:
        return Decimal(0)
    posto = (Decimal(len(ordenados)) - 1) * q
    return ordenados[int(posto.to_integral_value(rounding="ROUND_HALF_UP"))]


def _fracao_in(pool) -> Decimal:
    total = sum((o.valor_brl for o in pool), Decimal(0))
    entrada = sum((o.valor_brl for o in pool if o.direcao is Direcao.IN), Decimal(0))
    return entrada / total if total else Decimal(0)


def rodar() -> list[dict]:
    linhas: list[dict] = []
    for nome_mix, mix in TODOS.items():
        for n in VALORES_N:
            for semente in SEMENTES:
                # UMA vez por (mix, N, semente); reusada nos dois W logo abaixo.
                pool = montar_pool_do_ponto(mix, n, HORIZONTE, semente)
                if not pool:
                    continue
                fracao = _fracao_in(pool)
                volume_bruto = sum((o.valor_brl for o in pool), Decimal(0))

                for w in VALORES_W:
                    cenario = Cenario(
                        ordens=pool,
                        janela_dias=w,
                        horizonte_dias=HORIZONTE,
                        custo=PARAMETROS_VARREDURA,
                    )
                    ponto = montar_ponto(
                        nome_mix=nome_mix,
                        n_clientes=n,
                        cenario=cenario,
                        seed_base=semente,
                        volume_bruto=volume_bruto,
                    )
                    registro = {c: getattr(ponto, c) for c in COLUNAS}
                    registro["economia_bps"] = (
                        ponto.economia_brl / volume_bruto * BPS if volume_bruto else Decimal(0)
                    )
                    registro["fracao_in_realizada"] = fracao
                    linhas.append(registro)
            print(f"  {nome_mix} N={n}: {len(linhas)} linhas", flush=True)
    return linhas


def escrever(caminho: Path, colunas, registros) -> None:
    with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
        for linha in RESSALVA:
            arquivo.write(linha + "\n")
        escritor = csv.DictWriter(arquivo, fieldnames=list(colunas))
        escritor.writeheader()
        for r in registros:
            escritor.writerow({c: _formatar(c, r[c]) for c in colunas})


def agregar(linhas) -> list[dict]:
    grupos: dict[tuple, list[dict]] = {}
    for r in linhas:
        grupos.setdefault((r["nome_mix"], r["n_clientes"], r["janela_dias"]), []).append(r)

    saida = []
    for (nome_mix, n, w), do_grupo in grupos.items():
        bps = sorted(r["economia_bps"] for r in do_grupo)
        saida.append(
            {
                "nome_mix": nome_mix,
                "n_clientes": n,
                "janela_dias": w,
                "horizonte_dias": HORIZONTE,
                "n_sementes": len(do_grupo),
                "economia_bps_p10": _percentil(bps, Decimal("0.10")),
                "economia_bps_p50": _percentil(bps, Decimal("0.50")),
                "economia_bps_p90": _percentil(bps, Decimal("0.90")),
                "dias_espera_p90_volume_casado_p50": _percentil(
                    sorted(r["dias_espera_p90_volume_casado"] for r in do_grupo),
                    Decimal("0.50"),
                ),
                "dias_espera_p90_volume_remetido_p50": _percentil(
                    sorted(r["dias_espera_p90_volume_remetido"] for r in do_grupo),
                    Decimal("0.50"),
                ),
                "pct_volume_espera_truncada_p50": _percentil(
                    sorted(r["pct_volume_espera_truncada"] for r in do_grupo),
                    Decimal("0.50"),
                ),
                "fracao_in_realizada_p50": _percentil(
                    sorted(r["fracao_in_realizada"] for r in do_grupo), Decimal("0.50")
                ),
                "taxa_netabilidade_incremental_p50": _percentil(
                    sorted(r["taxa_netabilidade_incremental"] for r in do_grupo),
                    Decimal("0.50"),
                ),
                "taxa_netabilidade_p50": _percentil(
                    sorted(r["taxa_netabilidade"] for r in do_grupo), Decimal("0.50")
                ),
            }
        )
    return saida


def variancia(linhas) -> None:
    """Decomposicao estilo ANOVA da variancia de economia_bps por eixo.

    Desenho fatorial completo e balanceado (mix x N x W x semente), entao a soma
    de quadrados se separa direto. A semente NAO e um eixo a atribuir: ela e o
    residuo dentro da celula, e reporta-la e o ponto — se o residuo dominar, a
    diferenca entre celulas e ruido amostral, nao efeito de parametro.
    """
    y = [float(r["economia_bps"]) for r in linhas]
    fatores = {
        "mix": [r["nome_mix"] for r in linhas],
        "N": [r["n_clientes"] for r in linhas],
        "W": [r["janela_dias"] for r in linhas],
    }
    media = sum(y) / len(y)
    sq_total = sum((v - media) ** 2 for v in y)

    def medias_por(chaves):
        soma: dict = {}
        cont: dict = {}
        for k, v in zip(chaves, y):
            soma[k] = soma.get(k, 0.0) + v
            cont[k] = cont.get(k, 0) + 1
        return {k: soma[k] / cont[k] for k in soma}, cont

    m1 = {}
    for nome, chaves in fatores.items():
        m1[nome], cont = medias_por(chaves)
        sq = sum(cont[k] * (m1[nome][k] - media) ** 2 for k in cont)
        print(f"{nome:18s} {sq / sq_total * 100:7.3f}%")

    nomes = list(fatores)
    for i in range(len(nomes)):
        for j in range(i + 1, len(nomes)):
            a, b = nomes[i], nomes[j]
            chaves = list(zip(fatores[a], fatores[b]))
            mab, cont = medias_por(chaves)
            sq = sum(
                cont[k] * (mab[k] - m1[a][k[0]] - m1[b][k[1]] + media) ** 2 for k in cont
            )
            print(f"{a + ' x ' + b:18s} {sq / sq_total * 100:7.3f}%")

    chaves3 = list(zip(fatores["mix"], fatores["N"], fatores["W"]))
    m3, cont3 = medias_por(chaves3)
    sq_celulas = sum(cont3[k] * (m3[k] - media) ** 2 for k in cont3)
    print(f"{'residuo (semente)':18s} {(sq_total - sq_celulas) / sq_total * 100:7.3f}%")
    print(f"{'todas as celulas':18s} {sq_celulas / sq_total * 100:7.3f}%  (soma dos efeitos acima + 3-way)")
    print(f"desvio-padrao de economia_bps: {math.sqrt(sq_total / len(y)):.2f}")


def main() -> None:
    SAIDA.mkdir(exist_ok=True)
    print("rodando a grade...", flush=True)
    linhas = rodar()
    print(f"total: {len(linhas)} linhas", flush=True)

    escrever(SAIDA / "varredura_bruta.csv", COLUNAS_BRUTA, linhas)
    escrever(SAIDA / "varredura_agregada.csv", COLUNAS_AGREGADA, agregar(linhas))
    print("=== DECOMPOSICAO DE VARIANCIA de economia_bps ===")
    variancia(linhas)


if __name__ == "__main__":
    main()
