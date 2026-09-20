"""Agregadores puros dos sete eixos do diagnóstico."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from types import MappingProxyType
from typing import Literal, cast

from motor.analise.estatistica import percentil_empirico
from servidor.contracts.diagnostics import (
    CompositionDependencyAxis,
    CrossBorderResidualAxis,
    DiagnosticAxes,
    DistributionSummary,
    EconomicRobustnessAxis,
    OperationalProfileAxis,
    ParticipantShare,
    PolicyCaptureAxis,
    RepetitionSummary,
    ResidualBreakdown,
    StructuralPotentialAxis,
    TemporalCompatibilityAxis,
)
from servidor.contracts.input import OrdemEntrada, PreviaRequest
from servidor.contracts.output import AlocacaoDTO
from servidor.contracts.preview import PreviewEnvelope

_ALLOWED_REPETITION_COUNTS = {1, 10, 30, 100}


def _decimal_text(value: Decimal | int) -> str:
    decimal = value if isinstance(value, Decimal) else Decimal(value)
    if decimal == 0:
        return "0"
    text = format(decimal, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def _available(value: Decimal | int, *evidence: str) -> dict[str, object]:
    return {
        "state": "AVAILABLE",
        "value": _decimal_text(value),
        "evidence": list(evidence),
    }


def _incompatible(reason: str, *evidence: str) -> dict[str, object]:
    return {"state": "INCOMPATIBLE", "reason": reason, "evidence": list(evidence)}


@dataclass(frozen=True)
class RepetitionInput:
    request: PreviaRequest
    envelope: PreviewEnvelope
    duration_ms: int
    participant_seeds: Mapping[str, str] = field(
        default_factory=lambda: MappingProxyType({})
    )
    input_fingerprint: str | None = None
    selected: bool = False

    def __post_init__(self) -> None:
        if self.duration_ms < 0:
            raise ValueError("duration_ms deve ser não negativo")
        if (
            self.request.request_id != self.envelope.request_id
            or self.request.study_id != self.envelope.study_id
            or self.request.scenario_id != self.envelope.scenario_id
            or self.request.scenario_revision != self.envelope.scenario_revision
        ):
            raise ValueError("request e envelope não reconciliam")
        snapshot = self.envelope.input_snapshot
        if (
            self.request.cenario != snapshot.cenario
            or self.request.periodo != snapshot.periodo
            or self.request.proveniencia != snapshot.proveniencia
        ):
            raise ValueError("request diverge do snapshot de entrada validado")
        if self.input_fingerprint is not None and (
            len(self.input_fingerprint) != 64
            or any(
                character not in "0123456789abcdef"
                for character in self.input_fingerprint
            )
        ):
            raise ValueError("input_fingerprint inválido")


def _input_fingerprint(request: PreviaRequest) -> str:
    document = request.model_dump(mode="json", exclude={"request_id"})
    encoded = json.dumps(
        document,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def summarize_repetition(
    request: PreviaRequest, envelope: PreviewEnvelope, duration_ms: int
) -> RepetitionSummary:
    """Resume uma execução fixa sem inventar seeds ou distribuição."""
    RepetitionInput(request=request, envelope=envelope, duration_ms=duration_ms)
    aggregate = envelope.result.agregado
    return RepetitionSummary(
        repetition_id=envelope.statistics.repetition_id,
        participant_seeds={},
        input_fingerprint=_input_fingerprint(request),
        execution_fingerprint=envelope.execution_fingerprint,
        baseline_brl=_decimal_text(aggregate.baseline_periodo.total),
        netted_brl=_decimal_text(aggregate.netado_periodo.total),
        savings_brl=_decimal_text(aggregate.economia_periodo_brl),
        netability_fraction=_decimal_text(aggregate.taxa_netabilidade_periodo),
        duration_ms=duration_ms,
    )


def _selected(repetitions: tuple[RepetitionInput, ...]) -> RepetitionInput:
    if len(repetitions) == 1:
        return repetitions[0]
    selected = tuple(item for item in repetitions if item.selected)
    if len(selected) != 1:
        raise ValueError("distribuição exige exatamente uma execução selecionada")
    return selected[0]


def _measured_orders(repetition: RepetitionInput) -> tuple[OrdemEntrada, ...]:
    ids = set(repetition.envelope.result.agregado.ids_ordens_medidas)
    return tuple(
        order for order in repetition.request.cenario.ordens if order.id in ids
    )


def _allocations(repetition: RepetitionInput) -> tuple[AlocacaoDTO, ...]:
    ids = set(repetition.envelope.result.agregado.ids_ordens_medidas)
    return tuple(
        allocation
        for cycle in repetition.envelope.result.agregado.execucao_completa.ciclos
        for allocation in cycle.alocacoes
        if allocation.ordem_id in ids
    )


def _distribution(values: tuple[Decimal, ...], evidence: str) -> dict[str, object]:
    minimum, maximum = min(values), max(values)
    summary = DistributionSummary(
        minimum=_decimal_text(minimum),
        p10=_decimal_text(percentil_empirico(values, Decimal(".10"))),
        p25=_decimal_text(percentil_empirico(values, Decimal(".25"))),
        p50=_decimal_text(percentil_empirico(values, Decimal(".50"))),
        p75=_decimal_text(percentil_empirico(values, Decimal(".75"))),
        p90=_decimal_text(percentil_empirico(values, Decimal(".90"))),
        maximum=_decimal_text(maximum),
        amplitude=_decimal_text(maximum - minimum),
    )
    return {"state": "AVAILABLE", "value": summary, "evidence": [evidence]}


def _weighted_percentile(
    observations: tuple[tuple[Decimal, Decimal], ...], q: Decimal
) -> Decimal:
    """Nearest-rank ponderado por volume, sem interpolar dias inexistentes."""
    if not q.is_finite() or not Decimal(0) <= q <= Decimal(1):
        raise ValueError("q deve estar em [0,1]")
    total = sum((weight for _, weight in observations), Decimal(0))
    if total <= 0:
        raise ValueError("percentil ponderado exige peso positivo")
    target = total * q
    accumulated = Decimal(0)
    for value, weight in sorted(observations, key=lambda observation: observation[0]):
        if weight < 0:
            raise ValueError("peso de percentil não pode ser negativo")
        accumulated += weight
        if accumulated >= target:
            return value
    raise ValueError("pesos de percentil não reconciliam")


def _economic_axis(repetitions: tuple[RepetitionInput, ...]) -> EconomicRobustnessAxis:
    if len(repetitions) == 1:
        unavailable = {
            "state": "INSUFFICIENT_COVERAGE",
            "reason": "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION",
            "evidence": ["/repetitions"],
        }
        return EconomicRobustnessAxis.model_validate(
            {
                name: unavailable
                for name in (
                    "baseline_brl",
                    "netted_brl",
                    "savings_brl",
                    "netability_fraction",
                )
            }
        )
    aggregates = tuple(item.envelope.result.agregado for item in repetitions)
    return EconomicRobustnessAxis.model_validate(
        {
            "baseline_brl": _distribution(
                tuple(item.baseline_periodo.total for item in aggregates),
                "/repetitions/*/baseline_brl",
            ),
            "netted_brl": _distribution(
                tuple(item.netado_periodo.total for item in aggregates),
                "/repetitions/*/netted_brl",
            ),
            "savings_brl": _distribution(
                tuple(item.economia_periodo_brl for item in aggregates),
                "/repetitions/*/savings_brl",
            ),
            "netability_fraction": _distribution(
                tuple(item.taxa_netabilidade_periodo for item in aggregates),
                "/repetitions/*/netability_fraction",
            ),
        }
    )


def analyze_diagnostic_repetitions(
    repetitions: tuple[RepetitionInput, ...],
) -> DiagnosticAxes:
    """Calcula os sete eixos sem I/O e sem recalcular regras do motor."""
    if len(repetitions) not in _ALLOWED_REPETITION_COUNTS:
        raise ValueError("diagnóstico aceita 1, 10, 30 ou 100 repetições")
    repetition_ids = tuple(
        item.envelope.statistics.repetition_id for item in repetitions
    )
    if len(set(repetition_ids)) != len(repetition_ids):
        raise ValueError("repetition_id duplicado")
    chosen = _selected(repetitions)
    orders = _measured_orders(chosen)
    order_by_id = {order.id: order for order in orders}
    allocations = _allocations(chosen)
    aggregate = chosen.envelope.result.agregado
    gross_out = sum(
        (Decimal(order.valor_brl) for order in orders if order.direcao == "OUT"),
        Decimal(0),
    )
    gross_in = sum(
        (Decimal(order.valor_brl) for order in orders if order.direcao == "IN"),
        Decimal(0),
    )
    gross = gross_out + gross_in
    ceiling = Decimal(2) * min(gross_out, gross_in)
    matched = aggregate.volume_casado_periodo_brl
    uncaptured = ceiling - matched
    if uncaptured < 0:
        raise ValueError("volume casado excede o potencial estrutural")
    structural = StructuralPotentialAxis.model_validate(
        {
            "gross_out_brl": _available(
                gross_out, "/selected_execution/input_snapshot/cenario/ordens"
            ),
            "gross_in_brl": _available(
                gross_in, "/selected_execution/input_snapshot/cenario/ordens"
            ),
            "imbalance_brl": _available(
                abs(gross_out - gross_in),
                "/selected_execution/input_snapshot/cenario/ordens",
            ),
            "ceiling_brl": _available(
                ceiling, "/selected_execution/input_snapshot/cenario/ordens"
            ),
        }
    )
    capture_fraction = (
        _available(
            matched / ceiling,
            "/axes/structural_potential/ceiling_brl",
            "/axes/policy_capture/matched_brl",
        )
        if ceiling
        else _incompatible(
            "STRUCTURAL_POTENTIAL_HAS_NO_DENOMINATOR",
            "/axes/structural_potential/ceiling_brl",
        )
    )
    policy = PolicyCaptureAxis.model_validate(
        {
            "matched_brl": _available(
                matched, "/selected_execution/result/agregado/volume_casado_periodo_brl"
            ),
            "intra_client_brl": _available(
                aggregate.volume_autonetting_periodo_brl,
                "/selected_execution/result/agregado/volume_autonetting_periodo_brl",
            ),
            "inter_client_brl": _available(
                aggregate.volume_netting_multilateral_periodo_brl,
                "/selected_execution/result/agregado/volume_netting_multilateral_periodo_brl",
            ),
            "uncaptured_potential_brl": _available(
                uncaptured, "/axes/structural_potential/ceiling_brl"
            ),
            "captured_fraction": capture_fraction,
        }
    )
    deadline_days = (
        _weighted_percentile(
            tuple(
                (
                    Decimal(order.dia_limite - order.dia_conhecida),
                    Decimal(order.valor_brl),
                )
                for order in orders
            ),
            Decimal("0.50"),
        )
        if gross
        else Decimal(0)
    )
    same_day_volume = sum(
        (
            Decimal(order.valor_brl)
            for order in orders
            if order.dia_limite == order.dia_conhecida
        ),
        Decimal(0),
    )
    waited = sum(
        (
            Decimal(allocation.dia - order_by_id[allocation.ordem_id].dia_conhecida)
            * allocation.valor_brl
            for allocation in allocations
        ),
        Decimal(0),
    )
    cycles = chosen.envelope.result.agregado.execucao_completa.ciclos
    completion_days: dict[str, int] = defaultdict(int)
    for allocation in allocations:
        completion_days[allocation.ordem_id] = max(
            completion_days[allocation.ordem_id], allocation.dia
        )
    previous_close = -1
    window_closures = deadline_closures = horizon_closures = 0
    for cycle in cycles:
        window_closures += (
            cycle.dia - previous_close >= chosen.request.cenario.janela_dias
        )
        deadline_closures += any(
            order.dia_conhecida <= cycle.dia <= completion_days.get(order.id, cycle.dia)
            and order.dia_limite <= cycle.dia
            for order in orders
        )
        horizon_closures += cycle.dia == chosen.envelope.result.manifesto.horizonte_dias
        previous_close = cycle.dia
    temporal = TemporalCompatibilityAxis.model_validate(
        {
            "deadline_days": _available(
                deadline_days,
                "/selected_execution/input_snapshot/cenario/ordens",
            ),
            "same_day_fraction": _available(
                same_day_volume / gross,
                "/selected_execution/input_snapshot/cenario/ordens",
            )
            if gross
            else _incompatible("PORTFOLIO_HAS_NO_VOLUME"),
            "weighted_wait_days": _available(
                waited / gross,
                "/selected_execution/result/agregado/execucao_completa/ciclos",
            )
            if gross
            else _incompatible("PORTFOLIO_HAS_NO_VOLUME"),
            "window_closures": _available(
                window_closures,
                "/selected_execution/result/agregado/execucao_completa/ciclos",
            ),
            "deadline_closures": _available(
                deadline_closures,
                "/selected_execution/result/agregado/execucao_completa/ciclos",
            ),
            "horizon_closures": _available(
                horizon_closures,
                "/selected_execution/result/agregado/execucao_completa/ciclos",
            ),
        }
    )
    by_day: dict[tuple[int, str], Decimal] = defaultdict(Decimal)
    by_purpose: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    remitted_out = remitted_in = Decimal(0)
    for allocation in allocations:
        if allocation.tipo != "REMETIDO":
            continue
        order = order_by_id[allocation.ordem_id]
        by_day[(allocation.dia, order.direcao)] += allocation.valor_brl
        by_purpose[(order.finalidade, order.direcao)] += allocation.valor_brl
        if order.direcao == "OUT":
            remitted_out += allocation.valor_brl
        else:
            remitted_in += allocation.valor_brl
    residual = CrossBorderResidualAxis.model_validate(
        {
            "remitted_brl": _available(
                remitted_out + remitted_in,
                "/selected_execution/result/agregado/volume_remetido_periodo_brl",
            ),
            "out_brl": _available(
                remitted_out,
                "/selected_execution/result/agregado/execucao_completa/ciclos",
            ),
            "in_brl": _available(
                remitted_in,
                "/selected_execution/result/agregado/execucao_completa/ciclos",
            ),
            "by_day": [
                ResidualBreakdown(
                    key=str(day),
                    direction=cast(Literal["OUT", "IN"], direction),
                    value_brl=_decimal_text(value),
                )
                for (day, direction), value in sorted(by_day.items())
            ],
            "by_purpose": [
                ResidualBreakdown(
                    key=purpose,
                    direction=cast(Literal["OUT", "IN"], direction),
                    value_brl=_decimal_text(value),
                )
                for (purpose, direction), value in sorted(by_purpose.items())
            ],
        }
    )
    volumes_by_client: dict[str, Decimal] = defaultdict(Decimal)
    for order in orders:
        volumes_by_client[order.cliente_id] += Decimal(order.valor_brl)
    participants = (
        [
            ParticipantShare(
                participant_id=participant_id,
                volume_brl=_decimal_text(volume),
                share=_decimal_text(volume / gross),
            )
            for participant_id, volume in sorted(volumes_by_client.items())
        ]
        if gross
        else []
    )
    shares = tuple(Decimal(item.share) for item in participants)
    composition = CompositionDependencyAxis.model_validate(
        {
            "hhi": _available(
                sum((share * share for share in shares), Decimal(0)),
                "/axes/composition_dependency/participants",
            )
            if shares
            else _incompatible("PORTFOLIO_HAS_NO_VOLUME"),
            "largest_share": _available(
                max(shares), "/axes/composition_dependency/participants"
            )
            if shares
            else _incompatible("PORTFOLIO_HAS_NO_VOLUME"),
            "participants": participants,
        }
    )
    maximum_open_queue = 0
    if orders:
        for day in range(max(completion_days.values(), default=0) + 1):
            maximum_open_queue = max(
                maximum_open_queue,
                sum(
                    order.dia_conhecida <= day <= completion_days.get(order.id, day)
                    for order in orders
                ),
            )
    due_count = sum(
        completion_days.get(order.id, -1) >= order.dia_limite for order in orders
    )
    operational = OperationalProfileAxis.model_validate(
        {
            "order_count": _available(
                len(orders), "/selected_execution/result/agregado/ids_ordens_medidas"
            ),
            "cycle_count": _available(
                len(cycles),
                "/selected_execution/result/agregado/execucao_completa/ciclos",
            ),
            "maximum_open_queue": _available(
                maximum_open_queue,
                "/selected_execution/result/agregado/execucao_completa/ciclos",
            ),
            "due_order_count": _available(
                due_count, "/selected_execution/input_snapshot/cenario/ordens"
            ),
            "weighted_wait_days": temporal.weighted_wait_days,
            "processing_duration_ms": _available(
                chosen.duration_ms, "/repetitions/selected/duration_ms"
            ),
        }
    )
    return DiagnosticAxes(
        structural_potential=structural,
        policy_capture=policy,
        temporal_compatibility=temporal,
        cross_border_residual=residual,
        composition_dependency=composition,
        economic_robustness=_economic_axis(repetitions),
        operational_profile=operational,
    )
