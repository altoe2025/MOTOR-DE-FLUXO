"""Projeção temporal pura e fail-closed de um resultado canônico persistido."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal
from typing import Literal

from motor.analise import ConfiguracaoTemporal, preparar_execucao_temporal
from motor.dominio import Cenario, Direcao, Ordem
from servidor.contracts.input import PeriodoNatural
from servidor.contracts.output import AlocacaoDTO, CicloDTO
from servidor.contracts.replay import (
    ReplayClosingV1,
    ReplayDayV1,
    ReplayDocumentV1,
    ReplayEndStateV1,
    ReplayFlowSegmentV1,
    ReplayOrderV1,
    ReplayPeriodV1,
    ReplayRequestV1,
    ReplayTotalsV1,
    ReplayTrigger,
)
from servidor.motor_adapter import construir_cenario


class ReplayInconsistente(ValueError):
    """O resultado persistido não fecha sob os invariantes públicos do Replay."""


def _text(value: Decimal) -> str:
    if not value.is_finite():
        raise ReplayInconsistente("decimal não finito no replay")
    text = format(value, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def _fingerprint(document: object) -> str:
    encoded = json.dumps(
        document,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _priority(order: Ordem) -> tuple[int, str]:
    return order.dia_limite, order.id


def _pair_allocations(
    *,
    day: int,
    origin: Literal["INTRA_CLIENTE", "INTER_CLIENTE"],
    out_allocations: Iterable[AlocacaoDTO],
    in_allocations: Iterable[AlocacaoDTO],
    orders: dict[str, Ordem],
) -> list[ReplayFlowSegmentV1]:
    out_queue: list[tuple[AlocacaoDTO, Decimal]] = [
        (allocation, allocation.valor_brl)
        for allocation in sorted(
            out_allocations, key=lambda item: _priority(orders[item.ordem_id])
        )
    ]
    in_queue: list[tuple[AlocacaoDTO, Decimal]] = [
        (allocation, allocation.valor_brl)
        for allocation in sorted(
            in_allocations, key=lambda item: _priority(orders[item.ordem_id])
        )
    ]
    segments: list[ReplayFlowSegmentV1] = []
    out_index = 0
    in_index = 0
    while out_index < len(out_queue) and in_index < len(in_queue):
        out_allocation, out_remaining = out_queue[out_index]
        in_allocation, in_remaining = in_queue[in_index]
        value = min(out_remaining, in_remaining)
        if value <= 0:
            raise ReplayInconsistente("waterfall ilustrativo recebeu parcela inválida")
        segments.append(
            ReplayFlowSegmentV1.model_validate({
                "closing_day": day,
                "out_order_id": out_allocation.ordem_id,
                "in_order_id": in_allocation.ordem_id,
                "value_brl": _text(value),
                "matching_origin": origin,
                "meaning": "ILLUSTRATIVE_AGGREGATE_DECOMPOSITION",
            })
        )
        out_queue[out_index] = (out_allocation, out_remaining - value)
        in_queue[in_index] = (in_allocation, in_remaining - value)
        if out_queue[out_index][1] == 0:
            out_index += 1
        if in_queue[in_index][1] == 0:
            in_index += 1
    if any(item[1] != 0 for item in out_queue + in_queue):
        raise ReplayInconsistente(
            f"alocações {origin} não reconciliam entre OUT e IN no dia {day}"
        )
    return segments


def decompor_fluxos(
    cycle: CicloDTO, orders: dict[str, Ordem]
) -> list[ReplayFlowSegmentV1]:
    """Decompõe o agregado sem criar contraparte de domínio persistente."""
    allocations = [
        allocation
        for allocation in cycle.alocacoes
        if allocation.tipo == "CASADO"
    ]
    segments: list[ReplayFlowSegmentV1] = []
    intra = [a for a in allocations if a.origem_casamento == "INTRA_CLIENTE"]
    by_client: dict[str, list[AlocacaoDTO]] = defaultdict(list)
    for allocation in intra:
        by_client[orders[allocation.ordem_id].cliente_id].append(allocation)
    for client_id in sorted(by_client):
        client_allocations = by_client[client_id]
        segments.extend(
            _pair_allocations(
                day=cycle.dia,
                origin="INTRA_CLIENTE",
                out_allocations=(
                    allocation
                    for allocation in client_allocations
                    if orders[allocation.ordem_id].direcao is Direcao.OUT
                ),
                in_allocations=(
                    allocation
                    for allocation in client_allocations
                    if orders[allocation.ordem_id].direcao is Direcao.IN
                ),
                orders=orders,
            )
        )
    inter = [a for a in allocations if a.origem_casamento == "INTER_CLIENTE"]
    segments.extend(
        _pair_allocations(
            day=cycle.dia,
            origin="INTER_CLIENTE",
            out_allocations=(
                allocation
                for allocation in inter
                if orders[allocation.ordem_id].direcao is Direcao.OUT
            ),
            in_allocations=(
                allocation
                for allocation in inter
                if orders[allocation.ordem_id].direcao is Direcao.IN
            ),
            orders=orders,
        )
    )
    if sum((segment.value_brl for segment in segments), Decimal(0)) != cycle.casado:
        raise ReplayInconsistente(
            f"segmentos não reconciliam com casado do dia {cycle.dia}"
        )
    return segments


def _execution_scenario(request: ReplayRequestV1) -> tuple[Cenario, ReplayPeriodV1, set[str]]:
    selected = request.diagnostic_envelope.selected_execution
    scenario = construir_cenario(selected.input_snapshot.cenario)
    period_input = selected.input_snapshot.periodo
    if isinstance(period_input, PeriodoNatural):
        execution = preparar_execucao_temporal(
            scenario,
            ConfiguracaoTemporal(
                period_input.dias_aquecimento,
                period_input.periodo_medicao_dias,
            ),
        )
        period = ReplayPeriodV1(
            mode="NATURAL",
            warmup_days=period_input.dias_aquecimento,
            measurement_start_day=period_input.dias_aquecimento,
            measurement_end_day=(
                period_input.dias_aquecimento
                + period_input.periodo_medicao_dias
                - 1
            ),
            settlement_end_day=execution.cenario.horizonte_dias,
        )
        return execution.cenario, period, set(execution.ids_ordens_medidas)
    period = ReplayPeriodV1(
        mode="LEGADO",
        warmup_days=0,
        measurement_start_day=0,
        measurement_end_day=scenario.horizonte_dias,
        settlement_end_day=scenario.horizonte_dias,
    )
    return scenario, period, {order.id for order in scenario.ordens}


def _triggers(
    *, day: int, last_closing_day: int, scenario: Cenario, open_orders: set[str],
    orders: dict[str, Ordem], period: ReplayPeriodV1,
) -> list[ReplayTrigger]:
    triggers: list[ReplayTrigger] = []
    if day - last_closing_day >= scenario.janela_dias:
        triggers.append("WINDOW")
    if any(orders[order_id].dia_limite == day for order_id in open_orders):
        triggers.append("DEADLINE")
    if day == period.settlement_end_day:
        triggers.append("HORIZON_END")
    return triggers


def construir_replay(request: ReplayRequestV1) -> ReplayDocumentV1:
    selected = request.diagnostic_envelope.selected_execution
    aggregate = selected.result.agregado
    scenario, period, measured_ids = _execution_scenario(request)
    orders = {order.id: order for order in scenario.ordens}
    if set(aggregate.ids_ordens_medidas) != measured_ids:
        raise ReplayInconsistente("coorte medida diverge do resultado canônico")
    cycles = aggregate.execucao_completa.ciclos
    cycles_by_day = {cycle.dia: cycle for cycle in cycles}
    if len(cycles_by_day) != len(cycles):
        raise ReplayInconsistente("mais de um ciclo publicado no mesmo dia")

    balance = {order.id: order.valor_brl for order in scenario.ordens}
    allocated = {order.id: Decimal(0) for order in scenario.ordens}
    open_orders: set[str] = set()
    matched_position_accumulated = Decimal(0)
    measured_matched_accumulated = Decimal(0)
    remitted_out_accumulated = Decimal(0)
    remitted_in_accumulated = Decimal(0)
    measured_matched = Decimal(0)
    measured_intra = Decimal(0)
    measured_inter = Decimal(0)
    measured_remitted = Decimal(0)
    execution_remitted_out = Decimal(0)
    execution_remitted_in = Decimal(0)
    days: list[ReplayDayV1] = []
    last_closing_day = -1

    arrivals: dict[int, list[Ordem]] = defaultdict(list)
    for order in scenario.ordens:
        arrivals[order.dia_conhecida].append(order)

    for day in range(period.settlement_end_day + 1):
        events: list[dict[str, object]] = []
        for order in sorted(arrivals.get(day, ()), key=lambda item: item.id):
            open_orders.add(order.id)
            events.append(
                {
                    "sequence": len(events),
                    "kind": "ORDER_ARRIVED",
                    "order_id": order.id,
                }
            )

        cycle = cycles_by_day.get(day)
        closing: ReplayClosingV1 | None = None
        if cycle is not None:
            gross_out = sum(
                (
                    balance[order_id]
                    for order_id in open_orders
                    if orders[order_id].direcao is Direcao.OUT
                ),
                Decimal(0),
            )
            gross_in = sum(
                (
                    balance[order_id]
                    for order_id in open_orders
                    if orders[order_id].direcao is Direcao.IN
                ),
                Decimal(0),
            )
            if gross_out != cycle.bruto_out or gross_in != cycle.bruto_in:
                raise ReplayInconsistente(
                    f"bruto do ciclo não reconcilia no dia {day}"
                )
            triggers = _triggers(
                day=day,
                last_closing_day=last_closing_day,
                scenario=scenario,
                open_orders=open_orders,
                orders=orders,
                period=period,
            )
            if not triggers:
                raise ReplayInconsistente(f"ciclo sem gatilho no dia {day}")
            last_closing_day = day
            matched_allocations = [
                allocation
                for allocation in cycle.alocacoes
                if allocation.tipo == "CASADO"
            ]
            matched_contribution = sum(
                (allocation.valor_brl for allocation in matched_allocations),
                Decimal(0),
            )
            intra_position = sum(
                (
                    allocation.valor_brl
                    for allocation in matched_allocations
                    if allocation.origem_casamento == "INTRA_CLIENTE"
                    and orders[allocation.ordem_id].direcao is Direcao.OUT
                ),
                Decimal(0),
            )
            inter_position = sum(
                (
                    allocation.valor_brl
                    for allocation in matched_allocations
                    if allocation.origem_casamento == "INTER_CLIENTE"
                    and orders[allocation.ordem_id].direcao is Direcao.OUT
                ),
                Decimal(0),
            )
            remitted_out = Decimal(0)
            remitted_in = Decimal(0)
            for allocation in cycle.alocacoes:
                order = orders.get(allocation.ordem_id)
                if order is None or allocation.dia != day:
                    raise ReplayInconsistente("alocação referencia ordem ou dia inválido")
                if allocation.valor_brl <= 0 or allocation.valor_brl > balance[order.id]:
                    raise ReplayInconsistente("alocação excede saldo da ordem")
                balance[order.id] -= allocation.valor_brl
                allocated[order.id] += allocation.valor_brl
                if order.id in measured_ids:
                    if allocation.tipo == "CASADO":
                        measured_matched += allocation.valor_brl
                        measured_matched_accumulated += allocation.valor_brl
                        if allocation.origem_casamento == "INTRA_CLIENTE":
                            measured_intra += allocation.valor_brl
                        else:
                            measured_inter += allocation.valor_brl
                    else:
                        measured_remitted += allocation.valor_brl
                if allocation.tipo == "REMETIDO":
                    if order.direcao is Direcao.OUT:
                        remitted_out += allocation.valor_brl
                        execution_remitted_out += allocation.valor_brl
                        remitted_out_accumulated += allocation.valor_brl
                    else:
                        remitted_in += allocation.valor_brl
                        execution_remitted_in += allocation.valor_brl
                        remitted_in_accumulated += allocation.valor_brl
                events.append(
                    {
                        "sequence": len(events),
                        "kind": "ALLOCATION",
                        "order_id": order.id,
                        "allocation_type": allocation.tipo,
                        "value_brl": _text(allocation.valor_brl),
                        "direction": order.direcao.value,
                        "matching_origin": allocation.origem_casamento,
                    }
                )
                if balance[order.id] == 0:
                    open_orders.discard(order.id)
            if matched_contribution != Decimal(2) * cycle.casado:
                raise ReplayInconsistente("contribuição casada do ciclo não fecha")
            if remitted_out + remitted_in != cycle.residuo:
                raise ReplayInconsistente("resíduo do ciclo não fecha")
            matched_position_accumulated += cycle.casado
            closing = ReplayClosingV1.model_validate({
                "triggers": triggers,
                "gross_out_brl": _text(cycle.bruto_out),
                "gross_in_brl": _text(cycle.bruto_in),
                "matched_position_brl": _text(cycle.casado),
                "matched_contribution_brl": _text(matched_contribution),
                "intra_client_position_brl": _text(intra_position),
                "inter_client_position_brl": _text(inter_position),
                "remitted_out_brl": _text(remitted_out),
                "remitted_in_brl": _text(remitted_in),
                "flow_segments": decompor_fluxos(cycle, orders),
            })

        open_out = sum(
            (
                balance[order_id]
                for order_id in open_orders
                if orders[order_id].direcao is Direcao.OUT
            ),
            Decimal(0),
        )
        open_in = sum(
            (
                balance[order_id]
                for order_id in open_orders
                if orders[order_id].direcao is Direcao.IN
            ),
            Decimal(0),
        )
        days.append(
            ReplayDayV1.model_validate({
                "day": day,
                "events": events,
                "closing": closing,
                "end_state": ReplayEndStateV1.model_validate({
                    "open_out_brl": _text(open_out),
                    "open_in_brl": _text(open_in),
                    "matched_position_accumulated_brl": _text(
                        matched_position_accumulated
                    ),
                    "measured_matched_contribution_accumulated_brl": _text(
                        measured_matched_accumulated
                    ),
                    "remitted_out_accumulated_brl": _text(
                        remitted_out_accumulated
                    ),
                    "remitted_in_accumulated_brl": _text(remitted_in_accumulated),
                }),
            })
        )

    for order_id, order in orders.items():
        if allocated[order_id] != order.valor_brl or balance[order_id] != 0:
            raise ReplayInconsistente(f"conservação violada na ordem {order_id}")

    expected = {
        "casado": aggregate.volume_casado_periodo_brl,
        "autonetting": aggregate.volume_autonetting_periodo_brl,
        "multilateral": aggregate.volume_netting_multilateral_periodo_brl,
        "remetido": aggregate.volume_remetido_periodo_brl,
    }
    observed = {
        "casado": measured_matched,
        "autonetting": measured_intra,
        "multilateral": measured_inter,
        "remetido": measured_remitted,
    }
    for name, expected_value in expected.items():
        if expected_value != observed[name]:
            raise ReplayInconsistente(
                f"{name} medido diverge do resultado canônico"
            )
    if aggregate.taxa_netabilidade_periodo != (
        measured_matched / aggregate.volume_bruto_periodo_brl
        if aggregate.volume_bruto_periodo_brl
        else Decimal(0)
    ):
        raise ReplayInconsistente("taxa de netabilidade diverge do resultado")

    selected_summary = next(
        summary
        for summary in request.diagnostic_envelope.repetitions
        if summary.repetition_id
        == request.diagnostic_envelope.statistics.selected_repetition_id
    )
    replay_orders = [
        ReplayOrderV1.model_validate({
            "id": order.id,
            "client_id": order.cliente_id,
            "direction": order.direcao.value,
            "known_day": order.dia_conhecida,
            "deadline_day": order.dia_limite,
            "value_brl": _text(order.valor_brl),
            "cohort": (
                "WARMUP"
                if period.mode == "NATURAL"
                and order.dia_conhecida < period.measurement_start_day
                else "MEASUREMENT"
            ),
        })
        for order in sorted(scenario.ordens, key=lambda item: item.id)
    ]
    totals = ReplayTotalsV1.model_validate({
        "measured_gross_brl": _text(aggregate.volume_bruto_periodo_brl),
        "measured_matched_contribution_brl": _text(measured_matched),
        "measured_autonetting_contribution_brl": _text(measured_intra),
        "measured_multilateral_contribution_brl": _text(measured_inter),
        "measured_remitted_brl": _text(measured_remitted),
        "netability_fraction": _text(aggregate.taxa_netabilidade_periodo),
        "execution_matched_position_brl": _text(matched_position_accumulated),
        "execution_remitted_out_brl": _text(execution_remitted_out),
        "execution_remitted_in_brl": _text(execution_remitted_in),
    })
    return ReplayDocumentV1(
        api_version="1.0.0",
        diagnostic_execution_id=request.diagnostic_execution_id,
        scenario_id=selected.scenario_id,
        scenario_revision=selected.scenario_revision,
        repetition_id=selected.statistics.repetition_id,
        participant_seeds=selected_summary.participant_seeds,
        period=period,
        policy="P0",
        currency="BRL",
        orders=replay_orders,
        days=days,
        totals=totals,
        motor_version=selected.result.manifesto.versao_motor,
        execution_fingerprint=selected.execution_fingerprint,
        result_fingerprint=_fingerprint(selected.result.model_dump(mode="json")),
    )
