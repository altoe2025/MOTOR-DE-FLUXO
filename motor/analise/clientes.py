"""Ledger esparso e rateio técnico de custos; não define preço ou faturamento.

O baseline só é reconhecido na resolução de cada tranche. Spread e tarifa do
ciclo são repartidos por volume remetido do cliente e, dentro dele, por tranche.
Todo resto de divisão fica no último identificador ordenado, de forma explícita.

Somas canônicas usam coeficientes Decimal exatos. O agregado legado foi calculado
sob precisão finita: seus componentes, total e economia são reconciliados
separadamente, sem recalculá-lo ou mudar o contexto global. Resíduos numéricos
ficam na última resolução elegível por cliente/dia/ordem/evento; para total e
ganho, no último cliente. Eles não representam redistribuição comercial.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
from decimal import Decimal, localcontext
from typing import Iterable

from motor.analise.modelo import EventoCliente, ResultadoCliente, ResumoDiaCliente
from motor.custo import Custos, aliquota_iof, custo_baseline
from motor.dominio import Alocacao, Cenario, TipoAlocacao
from motor.simulacao import Resultado

_ZERO = Decimal(0)
_COMPONENTES = ("iof", "carry", "spread", "espera", "fixo")


def _somar_exato(valores: Iterable[Decimal]) -> Decimal:
    """Soma coeficientes finitos sem depender da ordem ou da precisão global.

    A maior posição inteira, a menor casa decimal e os dígitos da contagem
    limitam o tamanho do coeficiente resultante, inclusive com cancelamentos.
    """
    itens = tuple(valores)
    if not itens:
        return _ZERO
    menor_expoente = min(v.as_tuple().exponent for v in itens)
    maior_posicao = max(v.adjusted() for v in itens)
    with localcontext() as contexto:
        contexto.prec = max(
            contexto.prec, maior_posicao - menor_expoente + len(str(len(itens))) + 2,
        )
        return sum(itens, _ZERO)


def _custos(**parcelas: Decimal) -> Custos:
    componentes = {nome: parcelas.get(nome, _ZERO) for nome in _COMPONENTES}
    return Custos(**componentes, total=sum(componentes.values(), _ZERO))


def _somar_custos(custos: Iterable[Custos]) -> Custos:
    itens = tuple(custos)
    return Custos(**{nome: _somar_exato(getattr(c, nome) for c in itens)
                     for nome in (*_COMPONENTES, "total")})


def _ratear(total: Decimal, pesos: tuple[tuple[str, Decimal], ...]) -> dict[str, Decimal]:
    ordenados = tuple(sorted(pesos))
    soma_pesos = _somar_exato(peso for _, peso in ordenados)
    if total == 0:
        return {chave: _ZERO for chave, _ in ordenados}
    if soma_pesos <= 0:
        raise ValueError("rateio exige peso total positivo")
    parcelas: dict[str, Decimal] = {}
    atribuido = _ZERO
    for chave, peso in ordenados[:-1]:
        parcela = total * peso / soma_pesos
        parcelas[chave] = parcela
        atribuido = _somar_exato((atribuido, parcela))
    parcelas[ordenados[-1][0]] = _somar_exato((total, atribuido.copy_negate()))
    return parcelas


def _dia(evento: EventoCliente) -> int:
    return evento.dia_conhecida if evento.dia_resolucao is None else evento.dia_resolucao


def _reconciliar_ledger(eventos: list[EventoCliente], resultado: Resultado) -> None:
    """Propaga os restos numéricos do legado às últimas resoluções elegíveis.

    Custos.total é autoritativo, inclusive seu arredondamento Decimal legado.
    Reconciliá-lo separadamente dos componentes evita recalcular o agregado com
    outra precisão. O ledger carrega o ajuste e continua sendo fonte do histórico.
    Economia segue a mesma regra. Por isso o ganho da última resolução pode
    diferir de baseline.total - netado.total exatamente pelo resíduo numérico.
    """
    por_cliente: dict[str, list[int]] = defaultdict(list)
    for i, evento in enumerate(eventos):
        if evento.dia_resolucao is not None:
            por_cliente[evento.cliente_id].append(i)
    clientes = sorted(por_cliente)
    if not clientes:
        return
    indices = [i for cid in clientes for i in por_cliente[cid]]
    for lado in ("baseline", "netado"):
        agregado = getattr(resultado, lado)
        for campo in _COMPONENTES:
            soma = _somar_exato(getattr(getattr(eventos[i], lado), campo) for i in indices)
            resto = _somar_exato((getattr(agregado, campo), soma.copy_negate()))
            if resto:
                elegiveis = [
                    i for i in indices if getattr(getattr(eventos[i], lado), campo)
                ]
                if not elegiveis:
                    raise ValueError(f"resultado incompatível: {lado}.{campo} sem resolução elegível")
                i = elegiveis[-1]
                anterior = getattr(eventos[i], lado)
                corrigido = replace(anterior, **{
                    campo: _somar_exato((getattr(anterior, campo), resto)),
                })
                eventos[i] = replace(eventos[i], **{lado: corrigido})

        totais = {}
        for cid in clientes:
            custos = _somar_custos(getattr(eventos[i], lado) for i in por_cliente[cid])
            totais[cid] = sum((getattr(custos, campo) for campo in _COMPONENTES), _ZERO)
        resto = _somar_exato((agregado.total, _somar_exato(totais.values()).copy_negate()))
        totais[clientes[-1]] = _somar_exato((totais[clientes[-1]], resto))
        for cid in clientes:
            soma = _somar_exato(getattr(eventos[i], lado).total for i in por_cliente[cid])
            resto = _somar_exato((totais[cid], soma.copy_negate()))
            i = por_cliente[cid][-1]
            anterior = getattr(eventos[i], lado)
            eventos[i] = replace(eventos[i], **{lado: replace(
                anterior, total=_somar_exato((anterior.total, resto)),
            )})
    for i in indices:
        evento = eventos[i]
        eventos[i] = replace(evento, ganho_realizado_brl=(
            evento.baseline.total - evento.netado.total
        ))
    ganhos = {}
    for cid in clientes:
        baseline = _somar_custos(eventos[i].baseline for i in por_cliente[cid])
        netado = _somar_custos(eventos[i].netado for i in por_cliente[cid])
        ganhos[cid] = baseline.total - netado.total
    resto_economia = _somar_exato((
        resultado.economia, _somar_exato(ganhos.values()).copy_negate(),
    ))
    ganhos[clientes[-1]] = _somar_exato((ganhos[clientes[-1]], resto_economia))
    for cid in clientes:
        soma = _somar_exato(eventos[i].ganho_realizado_brl for i in por_cliente[cid])
        resto_cliente = _somar_exato((ganhos[cid], soma.copy_negate()))
        i = por_cliente[cid][-1]
        eventos[i] = replace(eventos[i], ganho_realizado_brl=_somar_exato((
            eventos[i].ganho_realizado_brl, resto_cliente,
        )))


def _resumir(cliente_id: str, eventos: tuple[EventoCliente, ...]) -> ResultadoCliente:
    por_dia: dict[int, list[EventoCliente]] = defaultdict(list)
    for evento in eventos:
        por_dia[_dia(evento)].append(evento)
    historico = []
    acumulado = _ZERO
    for dia, itens in sorted(por_dia.items()):
        baseline = _somar_custos(e.baseline for e in itens)
        netado = _somar_custos(e.netado for e in itens)
        ganho = _somar_exato(e.ganho_realizado_brl for e in itens)
        acumulado = _somar_exato((acumulado, ganho))
        historico.append(ResumoDiaCliente(
            cliente_id=cliente_id, dia=dia,
            volume_conhecido_brl=_somar_exato(
                e.valor_brl for e in itens if e.tipo == "ORDEM_CONHECIDA"
            ),
            volume_casado_brl=_somar_exato(e.valor_brl for e in itens if e.tipo == "CASADO"),
            volume_remetido_brl=_somar_exato(e.valor_brl for e in itens if e.tipo == "REMETIDO"),
            baseline_brl=baseline.total, custo_netado_brl=netado.total,
            ganho_dia_brl=ganho, ganho_acumulado_brl=acumulado,
        ))
    baseline = _somar_custos(e.baseline for e in eventos)
    netado = _somar_custos(e.netado for e in eventos)
    ganho = _somar_exato(e.ganho_realizado_brl for e in eventos)
    bruto = _somar_exato(d.volume_conhecido_brl for d in historico)
    return ResultadoCliente(
        cliente_id=cliente_id, volume_bruto_brl=bruto,
        volume_casado_brl=_somar_exato(d.volume_casado_brl for d in historico),
        volume_remetido_brl=_somar_exato(d.volume_remetido_brl for d in historico),
        baseline=baseline, netado=netado, ganho_proprio_brl=ganho,
        ganho_proprio_bps=ganho / bruto * Decimal(10000) if bruto else _ZERO,
        historico_diario=tuple(historico),
    )


def analisar_clientes(
    cenario: Cenario, resultado: Resultado,
) -> tuple[tuple[EventoCliente, ...], tuple[ResultadoCliente, ...]]:
    """Explica uma execução completa de P0 pelos eventos de cada cliente.

    Recebe o Resultado correspondente ao cenário, sem executar nova simulação.
    O volume casado inclui as duas pernas, tal como as alocações do agregado.
    Dias são relativos; só aparecem dias com entrada ou resolução.
    """
    ordens = {o.id: o for o in cenario.ordens}
    por_ordem: dict[str, list[tuple[str, Alocacao]]] = defaultdict(list)
    por_ciclo: list[list[tuple[str, Alocacao]]] = []
    for indice, ciclo in enumerate(resultado.ciclos):
        itens = []
        for posicao, alocacao in enumerate(ciclo.alocacoes):
            # Índices separados e com largura fixa: sem colisões por IDs livres
            # e com ordem lexical igual à sequência canônica das alocações P0.
            chave = f"resolucao:{indice:012d}:{posicao:012d}"
            itens.append((chave, alocacao))
            por_ordem[alocacao.ordem_id].append((chave, alocacao))
        por_ciclo.append(itens)

    baseline_evento: dict[str, Custos] = {}
    eventos = []
    for ordem in sorted(cenario.ordens, key=lambda o: o.id):
        eventos.append(EventoCliente(
            evento_id=f"conhecida:{ordem.id}", cliente_id=ordem.cliente_id,
            ordem_id=ordem.id, dia_conhecida=ordem.dia_conhecida,
            dia_resolucao=None, tipo="ORDEM_CONHECIDA", valor_brl=ordem.valor_brl,
            baseline=_custos(), netado=_custos(), ganho_realizado_brl=_ZERO,
            eh_efx=ordem.eh_efx,
        ))
        baseline = custo_baseline(replace(cenario, ordens=(ordem,)))
        pesos = tuple((chave, a.valor_brl) for chave, a in por_ordem[ordem.id])
        componentes = {
            nome: _ratear(getattr(baseline, nome), pesos) for nome in _COMPONENTES
        }
        for chave, _ in pesos:
            baseline_evento[chave] = _custos(**{
                nome: valores[chave] for nome, valores in componentes.items()
            })

    custo = cenario.custo
    for ciclo, itens in zip(resultado.ciclos, por_ciclo):
        remetidas: dict[str, list[tuple[str, Decimal]]] = defaultdict(list)
        for chave, alocacao in itens:
            if alocacao.tipo is TipoAlocacao.REMETIDO:
                cid = ordens[alocacao.ordem_id].cliente_id
                remetidas[cid].append((chave, alocacao.valor_brl))
        pesos_clientes = tuple(
            (cid, _somar_exato(v for _, v in tranches)) for cid, tranches in remetidas.items()
        )
        compartilhados: dict[str, dict[str, Decimal]] = {}
        for nome, total in (
            ("spread", ciclo.residuo * custo.spread_rail_bps / Decimal(10000)),
            ("fixo", custo.custo_fixo_remessa if ciclo.residuo > 0 else _ZERO),
        ):
            por_cliente = _ratear(total, pesos_clientes)
            compartilhados[nome] = {}
            for cid, tranches in remetidas.items():
                compartilhados[nome].update(_ratear(por_cliente[cid], tuple(tranches)))
        for chave, alocacao in itens:
            ordem = ordens[alocacao.ordem_id]
            remete = alocacao.tipo is TipoAlocacao.REMETIDO
            netado = _custos(
                iof=(alocacao.valor_brl * aliquota_iof(custo, ordem.finalidade, ordem.direcao)
                     if remete else _ZERO),
                carry=_ZERO if remete else alocacao.valor_brl * custo.carry_cnr,
                espera=alocacao.valor_brl * Decimal(alocacao.dia - ordem.dia_conhecida)
                       * custo.custo_oportunidade_aa / Decimal(365),
                spread=compartilhados["spread"].get(chave, _ZERO),
                fixo=compartilhados["fixo"].get(chave, _ZERO),
            )
            baseline = baseline_evento[chave]
            eventos.append(EventoCliente(
                evento_id=chave, cliente_id=ordem.cliente_id, ordem_id=ordem.id,
                dia_conhecida=ordem.dia_conhecida, dia_resolucao=alocacao.dia,
                tipo=alocacao.tipo.value, valor_brl=alocacao.valor_brl,
                baseline=baseline, netado=netado,
                ganho_realizado_brl=baseline.total - netado.total,
                eh_efx=ordem.eh_efx,
            ))
    eventos.sort(key=lambda e: (
        _dia(e), e.dia_resolucao is not None, e.cliente_id, e.ordem_id, e.evento_id,
    ))
    _reconciliar_ledger(eventos, resultado)
    ledger = tuple(eventos)
    por_cliente: dict[str, list[EventoCliente]] = defaultdict(list)
    for evento in ledger:
        por_cliente[evento.cliente_id].append(evento)
    clientes = tuple(_resumir(cid, tuple(itens)) for cid, itens in sorted(por_cliente.items()))
    return ledger, clientes


def filtrar_analise_clientes(
    ledger: tuple[EventoCliente, ...], ids_ordens: tuple[str, ...],
) -> tuple[tuple[EventoCliente, ...], tuple[ResultadoCliente, ...]]:
    """Publica uma coorte sem refazer o rateio técnico da execução integral."""
    ids = frozenset(ids_ordens)
    eventos = [evento for evento in ledger if evento.ordem_id in ids]
    if not eventos:
        return (), ()
    alvo = Resultado(
        ciclos=(),
        baseline=_somar_custos(evento.baseline for evento in eventos),
        netado=_somar_custos(evento.netado for evento in eventos),
        economia=_somar_exato(evento.ganho_realizado_brl for evento in eventos),
        taxa_netabilidade=_ZERO,
    )
    # Aplica à coorte a mesma política canônica de restos usada no ledger integral.
    _reconciliar_ledger(eventos, alvo)
    ledger_coorte = tuple(eventos)
    por_cliente: dict[str, list[EventoCliente]] = defaultdict(list)
    for evento in ledger_coorte:
        por_cliente[evento.cliente_id].append(evento)
    clientes = tuple(
        _resumir(cliente_id, tuple(itens))
        for cliente_id, itens in sorted(por_cliente.items())
    )
    return ledger_coorte, clientes


def resultado_cliente_vazio(cliente_id: str) -> ResultadoCliente:
    """Representa ganho próprio nulo para cliente sem ordem na coorte medida."""
    return _resumir(cliente_id, ())
