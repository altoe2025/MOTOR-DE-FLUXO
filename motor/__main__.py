"""CLI do motor de fluxo. Dois modos:

    python -m motor <cenario.yaml>
    python -m motor varredura --saida caminho.csv [--mixes ...] [--n ...] [--w ...]

O primeiro simula um cenário escrito à mão e imprime o resumo. O segundo roda a
grade (mix × N × W) de `motor.varredura` e escreve o CSV.

Não é pura — faz I/O. Toda a conta continua em `simulacao`/`varredura`.
"""

from __future__ import annotations

import argparse
import sys

from motor.dominio import carregar_cenario
from motor.mixes import TODOS as MIXES
from motor.simulacao import simular
from motor.varredura import PARAMETROS_VARREDURA, escrever_csv, rodar_varredura

USO = (
    "uso: python -m motor <cenario.yaml>\n"
    "     python -m motor varredura --saida <caminho.csv> [--mixes a,b] "
    "[--n 10,50] [--w 1,7] [--horizonte 365] [--seed-base 1]"
)

# Grade padrão. Tudo aqui é PLACEHOLDER, como os pesos de motor/mixes.py e os
# parâmetros de custo de motor/varredura.py — trocar esses valores é o próximo
# experimento, não um conserto.
MIXES_PADRAO = ("equilibrado", "retail_pesado", "corporativo_pesado", "psp_dominante")
VALORES_N_PADRAO = (10, 50, 200, 1000)
VALORES_W_PADRAO = (1, 3, 7, 14, 30)
HORIZONTE_PADRAO = 365
SEED_BASE_PADRAO = 1


def _lista_de_inteiros(texto: str) -> tuple[int, ...]:
    return tuple(int(parte) for parte in texto.split(",") if parte.strip())


def _resumo_do_cenario(caminho: str) -> int:
    cenario = carregar_cenario(caminho)
    resultado = simular(cenario)
    ptax = cenario.custo.ptax

    for ciclo in resultado.ciclos:
        print(
            f"dia {ciclo.dia}: bruto OUT {ciclo.bruto_out} | bruto IN {ciclo.bruto_in} "
            f"| casado {ciclo.casado} | resíduo {ciclo.residuo} {ciclo.direcao_residuo.value}"
        )

    print()
    print(f"baseline: {resultado.baseline.total} BRL (~ US$ {resultado.baseline.total / ptax:,.0f})")
    print(f"netado:   {resultado.netado.total} BRL (~ US$ {resultado.netado.total / ptax:,.0f})")
    print(f"economia: {resultado.economia} BRL (~ US$ {resultado.economia / ptax:,.0f})")
    print(f"taxa de netabilidade: {resultado.taxa_netabilidade:.2%}")
    return 0


def _varredura(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m motor varredura",
        description="Roda a grade (mix × N de clientes × W de janela) e escreve um CSV.",
    )
    parser.add_argument("--saida", required=True, help="caminho do CSV de saída")
    parser.add_argument("--mixes", default=",".join(MIXES_PADRAO), help="nomes de motor.mixes.TODOS")
    parser.add_argument("--n", default=",".join(map(str, VALORES_N_PADRAO)), help="valores de N")
    parser.add_argument("--w", default=",".join(map(str, VALORES_W_PADRAO)), help="valores de W")
    parser.add_argument("--horizonte", type=int, default=HORIZONTE_PADRAO, help="horizonte em dias")
    parser.add_argument("--seed-base", type=int, default=SEED_BASE_PADRAO, dest="seed_base")

    try:
        args = parser.parse_args(argv)
    except SystemExit:  # argparse já imprimiu a mensagem; a CLI devolve código, não sai
        return 1

    nomes = [parte.strip() for parte in args.mixes.split(",") if parte.strip()]
    desconhecidos = [nome for nome in nomes if nome not in MIXES]
    if desconhecidos:
        print(
            f"mix desconhecido: {desconhecidos} — disponíveis: {sorted(MIXES)}",
            file=sys.stderr,
        )
        return 1

    try:
        valores_n = _lista_de_inteiros(args.n)
        valores_w = _lista_de_inteiros(args.w)
    except ValueError as erro:
        print(f"--n e --w esperam inteiros separados por vírgula: {erro}", file=sys.stderr)
        return 1

    pontos = rodar_varredura(
        mixes={nome: MIXES[nome] for nome in nomes},
        valores_n=valores_n,
        valores_w=valores_w,
        horizonte_dias=args.horizonte,
        custo=PARAMETROS_VARREDURA,
        seed_base=args.seed_base,
    )

    escrever_csv(pontos, args.saida)
    print(f"{len(pontos)} pontos escritos em {args.saida}")

    for nome in nomes:
        do_mix = [ponto for ponto in pontos if ponto.nome_mix == nome]
        if not do_mix:
            continue
        melhor = max(do_mix, key=lambda ponto: ponto.economia_pct)
        print(
            f"  {nome}: melhor economia {melhor.economia_pct:.2%} "
            f"em N={melhor.n_clientes} W={melhor.janela_dias} "
            f"(netabilidade {melhor.taxa_netabilidade:.2%})"
        )

    return 0


def main(argv: list[str]) -> int:
    """Entrada da CLI. Devolve o código de saída em vez de chamá-lo, para ser testável."""
    if len(argv) >= 2 and argv[1] == "varredura":
        return _varredura(argv[2:])

    if len(argv) != 2:
        print(USO, file=sys.stderr)
        return 1

    return _resumo_do_cenario(argv[1])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
