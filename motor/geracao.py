"""Geração programática de ordens sintéticas a partir de um Arquetipo.

Produz o mesmo `tuple[Ordem, ...]` que o loader de YAML em `dominio.py`
produzia à mão — `simulacao.py` não sabe (e não precisa saber) se as ordens
vieram de um arquivo ou de um gerador.

Regra de importação: este módulo importa apenas `motor.dominio`. Nunca
`motor.netting` nem `motor.custo`.

Pureza: `gerar_ordens` e `gerar_pool` são puras — mesma entrada, mesma seed,
sempre o mesmo resultado. Usam `numpy.random.Generator(numpy.random.PCG64(seed))`,
nunca o estado global do numpy nem `random` da stdlib.
"""

from __future__ import annotations

import math
from decimal import Decimal

import numpy as np

from motor.arquetipos import TODOS
from motor.dominio import Arquetipo, Direcao, Ordem


def gerar_ordens(
    arquetipo: Arquetipo,
    cliente_id: str,
    seed: int,
    horizonte_dias: int,
) -> tuple[Ordem, ...]:
    """Gera o stream de ordens de um cliente seguindo um arquétipo, ao longo do horizonte.

    Pura: mesma (arquetipo, cliente_id, seed, horizonte_dias) -> sempre o mesmo resultado.
    """
    rng = np.random.Generator(np.random.PCG64(seed))

    n_esperado = arquetipo.cadencia_mensal * horizonte_dias / 30
    n = int(rng.poisson(n_esperado))

    log_mediana = math.log(float(arquetipo.ticket_mediana_brl))

    ordens: list[Ordem] = []
    for _ in range(n):
        dia_conhecida = int(rng.integers(0, horizonte_dias))

        # TODO: a antecedência de forecast (visibilidade_dias_*) ainda não é
        # modelada como efeito separado de dia_conhecida — os campos
        # visibilidade_dias_min/max do arquétipo documentam a intenção mas
        # não entram no cálculo nesta etapa.

        if dia_conhecida >= horizonte_dias:
            continue

        direcao = Direcao.OUT if rng.random() < arquetipo.p_out else Direcao.IN

        valor_brl = Decimal(str(round(rng.lognormal(log_mediana, arquetipo.ticket_sigma), 2)))

        buffer = int(rng.integers(arquetipo.buffer_dias_min, arquetipo.buffer_dias_max + 1))
        dia_limite = dia_conhecida + buffer

        ordens.append(
            Ordem(
                id=f"{cliente_id}-{arquetipo.nome}-{len(ordens):05d}",
                cliente_id=cliente_id,
                direcao=direcao,
                valor_brl=valor_brl,
                dia_conhecida=dia_conhecida,
                dia_limite=dia_limite,
                eh_efx=arquetipo.eh_efx,
                finalidade=arquetipo.finalidade,
            )
        )

    return tuple(ordens)


def gerar_pool(
    especificacao: dict[str, tuple[str, int]],
    horizonte_dias: int,
) -> tuple[Ordem, ...]:
    """Gera e concatena as ordens de vários clientes.

    `especificacao` mapeia cliente_id -> (nome_arquetipo, seed). Cada cliente usa
    sua própria seed, então adicionar ou remover um cliente não altera as ordens
    dos demais.
    """
    ordens: list[Ordem] = []
    for cliente_id, (nome_arquetipo, seed) in especificacao.items():
        arquetipo = TODOS[nome_arquetipo]
        ordens.extend(gerar_ordens(arquetipo, cliente_id, seed, horizonte_dias))

    return tuple(ordens)
