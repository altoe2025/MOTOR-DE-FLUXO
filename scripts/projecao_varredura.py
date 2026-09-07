"""Parte 0 da varredura completa: quanto custa uma rodada, e onde cada mix cai.

Cronometra antes de disparar a grade. `Decimal` e lento e ninguem tinha medido;
uma grade de dezenas de milhares de rodadas disparada as cegas pode levar horas.

Le o motor, nao o modifica.
"""

from __future__ import annotations

import time
from decimal import Decimal

from motor.dominio import Cenario, Direcao
from motor.mixes import TODOS
from motor.varredura import PARAMETROS_VARREDURA, montar_ponto, montar_pool_do_ponto

HORIZONTE = 365
VALORES_N = (2, 3, 4, 6, 8, 12, 16, 24, 32)
VALORES_W = (1, 7)
N_SEMENTES = 300


def fracao_in(pool) -> Decimal:
    """Fracao do volume da pool que e IN. Ponderada por volume, nao por contagem."""
    total = sum((o.valor_brl for o in pool), Decimal(0))
    entrada = sum((o.valor_brl for o in pool if o.direcao is Direcao.IN), Decimal(0))
    return entrada / total if total else Decimal(0)


def main() -> None:
    print("=== (a) custo de uma rodada: N=12, W=7, horizonte 365 ===")
    inicio = time.perf_counter()
    pool = montar_pool_do_ponto(TODOS["equilibrado"], 12, HORIZONTE, 42)
    t_pool = time.perf_counter() - inicio

    inicio = time.perf_counter()
    repeticoes = 3
    for _ in range(repeticoes):
        cen = Cenario(
            ordens=pool, janela_dias=7, horizonte_dias=HORIZONTE, custo=PARAMETROS_VARREDURA
        )
        montar_ponto(nome_mix="equilibrado", n_clientes=12, cenario=cen, seed_base=42)
    t_sim = (time.perf_counter() - inicio) / repeticoes

    print(f"pool ({len(pool)} ordens): {t_pool:.3f}s   simulacao: {t_sim:.3f}s")

    # A pool de um (mix, N, seed) e gerada UMA vez e reusada nos dois W
    # (rodar_varredura chama montar_pool_do_ponto no laco de seed, fora do de W).
    n_mixes = len(TODOS)
    n_pools = n_mixes * len(VALORES_N) * N_SEMENTES
    n_sims = n_pools * len(VALORES_W)
    # O custo escala com o numero de ordens, que escala com N. A rodada medida e
    # N=12; a media da grade e a media de VALORES_N.
    fator = (sum(VALORES_N) / len(VALORES_N)) / 12
    segundos = (n_pools * t_pool + n_sims * t_sim) * fator
    print(
        f"grade: {n_mixes} mixes x {len(VALORES_N)} N x {len(VALORES_W)} W x "
        f"{N_SEMENTES} sementes = {n_sims} rodadas ({n_pools} pools)"
    )
    print(f"fator de escala por N medio: {fator:.3f}")
    print(f"PROJECAO: {segundos:.0f}s = {segundos / 60:.1f} min = {segundos / 3600:.2f} h")

    print()
    print("=== (b) fracao IN realizada por mix (ponderada por volume) ===")
    for nome in TODOS:
        fracoes = []
        for n in (4, 12, 32):
            for seed in range(1, 11):
                p = montar_pool_do_ponto(TODOS[nome], n, HORIZONTE, seed)
                if p:
                    fracoes.append(fracao_in(p))
        fracoes.sort()
        meio = len(fracoes) // 2
        mediana = (
            fracoes[meio] if len(fracoes) % 2 else (fracoes[meio - 1] + fracoes[meio]) / 2
        )
        print(
            f"{nome:22s} mediana {mediana:.4f}  faixa [{fracoes[0]:.4f}, {fracoes[-1]:.4f}]"
        )


if __name__ == "__main__":
    main()
