"""Contribuição leave-one-client-out sobre as mesmas posições líquidas.

Não regenera ordens nem altera P0. Ganho próprio e seus bps vêm do resultado
publicado por analisar_clientes, inclusive os resíduos numéricos reconciliados.
"""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from motor.analise.clientes import _somar_exato, analisar_clientes
from motor.analise.modelo import ContribuicaoMarginal, ResultadoCliente
from motor.dominio import Cenario
from motor.simulacao import Resultado, simular


def _contribuicao_com_resultado(
    cenario: Cenario, cheio: Resultado, cliente: ResultadoCliente, volume_pool: Decimal,
) -> ContribuicaoMarginal:
    """Reutiliza a execução cheia e o cliente já calculados pelo pipeline."""
    sem_cliente = replace(cenario, ordens=tuple(
        o for o in cenario.ordens if o.cliente_id != cliente.cliente_id
    ))
    economia_sem = simular(sem_cliente).economia
    marginal = _somar_exato((cheio.economia, economia_sem.copy_negate()))
    efeito = _somar_exato((marginal, cliente.ganho_proprio_brl.copy_negate()))
    return ContribuicaoMarginal(
        cliente_id=cliente.cliente_id,
        ganho_proprio_brl=cliente.ganho_proprio_brl,
        ganho_proprio_bps=cliente.ganho_proprio_bps,
        contribuicao_marginal_total_brl=marginal,
        contribuicao_marginal_total_bps=marginal / volume_pool * Decimal(10000),
        efeito_sobre_demais_brl=efeito,
        efeito_sobre_demais_bps=efeito / volume_pool * Decimal(10000),
    )


def calcular_contribuicao_marginal(cenario: Cenario, cliente_id: str) -> ContribuicaoMarginal:
    """Remove todas as ordens do cliente, preservando os objetos das demais.

    BRL é a diferença exata dos valores Decimal publicados. Bps marginal e
    efeito usam volume da pool cheia; bps próprio usa o volume do cliente.
    Um cliente existente tem volume positivo pelo contrato de Ordem.
    """
    if cliente_id not in {o.cliente_id for o in cenario.ordens}:
        raise ValueError(f"cliente inexistente: {cliente_id!r}")
    cheio = simular(cenario)
    _, clientes = analisar_clientes(cenario, cheio)
    cliente = next(c for c in clientes if c.cliente_id == cliente_id)
    volume_pool = _somar_exato(o.valor_brl for o in cenario.ordens)
    return _contribuicao_com_resultado(cenario, cheio, cliente, volume_pool)
