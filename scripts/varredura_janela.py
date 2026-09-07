"""Descartável: a janela W move o resultado, ou é ruído de semente?

Medição curta (5 valores de W x 30 sementes = 150 rodadas), NÃO a varredura
completa. Existe para decidir uma coisa só: se W=7, W=14 e W=30 forem
indistinguíveis, o eixo W da grade cai de seis níveis para três.

As MESMAS 30 sementes rodam em todos os W (números aleatórios comuns). É o que
`rodar_varredura` já faz de graça — a pool de um (mix, N, seed) é gerada uma vez,
no laço de seed, e reusada em todos os W. Com sementes diferentes por W a
variação entre pools abafaria o efeito da janela, e a medição não responderia
nada: o que interessa é a diferença PAREADA dentro da mesma pool, não o nível.

Lê o motor, não o modifica.
"""

from __future__ import annotations

from decimal import Decimal

from motor.mixes import EQUILIBRADO
from motor.varredura import PARAMETROS_VARREDURA, _percentil, rodar_varredura

MIX, N, HORIZONTE = "equilibrado", 12, 365
VALORES_W = (1, 3, 7, 14, 30)
SEMENTES = tuple(range(1, 31))
BPS = Decimal(10000)


def _mediana(ordenados):
    meio = len(ordenados) // 2
    if len(ordenados) % 2:
        return ordenados[meio]
    return (ordenados[meio - 1] + ordenados[meio]) / 2


def main() -> None:
    pontos = rodar_varredura(
        mixes={MIX: EQUILIBRADO},
        valores_n=(N,),
        valores_w=VALORES_W,
        valores_seed=SEMENTES,
        horizonte_dias=HORIZONTE,
        custo=PARAMETROS_VARREDURA,
    )

    # (W, seed) -> bps, para o pareamento depois.
    bps_de: dict[tuple[int, int], Decimal] = {}
    p90_de: dict[tuple[int, int], Decimal] = {}
    for p in pontos:
        bps_de[(p.janela_dias, p.seed_base)] = p.economia_brl / p.volume_bruto_brl * BPS
        p90_de[(p.janela_dias, p.seed_base)] = p.dias_espera_p90_volume_casado

    print(f"pool: mix={MIX} N={N} horizonte={HORIZONTE} sementes={len(SEMENTES)}")
    print(f"{'W':>3} {'econ_bps p50':>13} {'econ_bps p10':>13} {'p90_casado p50':>15}")
    for w in VALORES_W:
        bps = sorted(bps_de[(w, s)] for s in SEMENTES)
        p90 = sorted(p90_de[(w, s)] for s in SEMENTES)
        print(
            f"{w:>3} {_mediana(bps):>13.2f} "
            f"{_percentil(bps, Decimal('0.10')):>13.2f} {_mediana(p90):>15}"
        )

    for a, b in ((1, 3), (1, 7), (3, 7), (7, 14), (7, 30)):
        difs = sorted(bps_de[(a, s)] - bps_de[(b, s)] for s in SEMENTES)
        mediana = _mediana(difs)
        # "Inverte o sinal" = a semente discorda do sinal da mediana. Empate exato
        # conta à parte: não é inversão, é ausência de diferença.
        zeros = sum(1 for d in difs if d == 0)
        if mediana > 0:
            invertem = sum(1 for d in difs if d < 0)
        elif mediana < 0:
            invertem = sum(1 for d in difs if d > 0)
        else:
            invertem = sum(1 for d in difs if d != 0)
        print(
            f"W={a} - W={b}: mediana {mediana:+.3f} bps, faixa "
            f"[{difs[0]:+.3f}, {difs[-1]:+.3f}], invertem {invertem}/30, "
            f"iguais a zero {zeros}/30"
        )


if __name__ == "__main__":
    main()
