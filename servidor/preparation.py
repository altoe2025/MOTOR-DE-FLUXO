"""Preparação determinística de carteiras pela interface pública do motor."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal, localcontext
from uuid import UUID, uuid4

from motor.arquetipos import TODOS as ARQUETIPOS
from motor.dominio import Arquetipo, Direcao, Ordem
from motor.geracao import gerar_ordens
from servidor.contracts.input import OrdemEntrada
from servidor.contracts.preparation import (
    GENERATOR_VERSION,
    DerivedEvidence,
    EffectiveParticipant,
    FixedDeadline,
    PreparationParameter,
    PreparationRequest,
    PreparationResponse,
    RealizedComposition,
)
from servidor.identity import canon_decimal

MAX_EXPECTED_ORDERS = Decimal(500)
_CADENCE_QUANTUM = Decimal("0.000000000001")
_MONEY_QUANTUM = Decimal("0.000001")
_FRACTION_QUANTUM = Decimal("0.000000000001")


class PreparationLimitExceeded(ValueError):
    """A estimativa determinística excede o limite seguro antes do sorteio."""


def _decimal_text(value: Decimal) -> str:
    return format(value, "f")


def _dimensionar(
    participant: EffectiveParticipant, measurement_days: int
) -> tuple[Arquetipo, PreparationParameter]:
    """Materializa o perfil efetivo sem reimplementar o sorteio do motor."""
    profile = ARQUETIPOS[participant.profile]
    sigma = Decimal(str(profile.ticket_sigma))
    median = Decimal(participant.ticket_median_brl)
    monthly_volume = Decimal(participant.monthly_volume_brl)
    with localcontext() as context:
        context.prec = 50
        mean = median * (sigma * sigma / Decimal(2)).exp()
        cadence = (monthly_volume / mean).quantize(
            _CADENCE_QUANTUM, rounding=ROUND_HALF_UP
        )
    if cadence <= 0 or not cadence.is_finite():
        raise ValueError("cadência derivada inválida")

    deadline = participant.deadline  # type: ignore[attr-defined]
    if isinstance(deadline, FixedDeadline):
        deadline_min = deadline.days
        deadline_max = deadline.days
    else:
        deadline_min = profile.buffer_dias_min
        deadline_max = profile.buffer_dias_max

    effective_profile = Arquetipo(
        nome=profile.nome,
        p_out=float(Decimal(participant.out_fraction)),  # type: ignore[attr-defined]
        ticket_mediana_brl=median,
        ticket_sigma=profile.ticket_sigma,
        cadencia_mensal=float(cadence),
        buffer_dias_min=deadline_min,
        buffer_dias_max=deadline_max,
        visibilidade_dias_min=profile.visibilidade_dias_min,
        visibilidade_dias_max=profile.visibilidade_dias_max,
        eh_efx=participant.eh_efx,
        finalidade_out=participant.purpose_out,
        finalidade_in=participant.purpose_in,
    )
    expected_period = (
        monthly_volume * Decimal(measurement_days) / Decimal(30)
    ).quantize(_MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    parameter = PreparationParameter(
        participant_id=participant.id,
        sigma=_decimal_text(sigma),
        cadence_monthly=_decimal_text(cadence),
        expected_period_brl=_decimal_text(expected_period),
        deadline_min=deadline_min,
        deadline_max=deadline_max,
    )
    return effective_profile, parameter


def _order_dto(order: Ordem) -> OrdemEntrada:
    return OrdemEntrada(
        id=order.id,
        cliente_id=order.cliente_id,
        direcao=order.direcao.value,
        valor_brl=_decimal_text(order.valor_brl),
        dia_conhecida=order.dia_conhecida,
        dia_limite=order.dia_limite,
        eh_efx=order.eh_efx,
        finalidade=order.finalidade,
    )


def _composition(participant_id: UUID | None, orders: list[Ordem]) -> RealizedComposition:
    out_brl = sum(
        (order.valor_brl for order in orders if order.direcao is Direcao.OUT),
        Decimal(0),
    )
    in_brl = sum(
        (order.valor_brl for order in orders if order.direcao is Direcao.IN),
        Decimal(0),
    )
    total_brl = out_brl + in_brl
    out_fraction = (
        None
        if total_brl == 0
        else _decimal_text(
            (out_brl / total_brl).quantize(_FRACTION_QUANTUM, rounding=ROUND_HALF_UP)
        )
    )
    return RealizedComposition(
        participant_id=participant_id,
        order_count=len(orders),
        out_brl=_decimal_text(out_brl),
        in_brl=_decimal_text(in_brl),
        total_brl=_decimal_text(total_brl),
        out_fraction=out_fraction,
    )


def _generation_fingerprint(request: PreparationRequest, build_sha: str) -> str:
    """Hash only order-generation determinants, excluding later analytical evidence."""
    participants = []
    for participant in sorted(request.input.participants, key=lambda value: str(value.id)):
        participants.append(
            {
                "id": str(participant.id),
                "profile": participant.profile,
                "seed": participant.seed,
                "monthly_volume_brl": canon_decimal(participant.monthly_volume_brl),
                "ticket_median_brl": canon_decimal(participant.ticket_median_brl),
                "out_fraction": canon_decimal(participant.out_fraction),
                "deadline": participant.deadline.model_dump(mode="json"),
                "eh_efx": participant.eh_efx,
                "purpose_out": participant.purpose_out,
                "purpose_in": participant.purpose_in,
            }
        )
    document = {
        "generator_version": GENERATOR_VERSION,
        "motor_build_sha": build_sha,
        "generation_horizon_days": request.input.warmup_days
        + request.input.measurement_days,
        "participants": participants,
    }
    encoded = json.dumps(
        document,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _derived_provenance(request: PreparationRequest) -> dict[str, DerivedEvidence]:
    evidence: dict[str, DerivedEvidence] = {}
    for participant in request.input.participants:
        prefix = f"/participants/{participant.id}"
        parameter_prefix = f"/parameters/{participant.id}"
        evidence[f"{parameter_prefix}/sigma"] = DerivedEvidence(
            rule="geracao-v1", inputs=[f"{prefix}/profile"]
        )
        evidence[f"{parameter_prefix}/cadence_monthly"] = DerivedEvidence(
            rule="dimensionamento-v1",
            inputs=[
                f"{prefix}/monthly_volume_brl",
                f"{prefix}/ticket_median_brl",
                f"{prefix}/profile",
            ],
        )
        evidence[f"{parameter_prefix}/expected_period_brl"] = DerivedEvidence(
            rule="dimensionamento-v1",
            inputs=["/measurement_days", f"{prefix}/monthly_volume_brl"],
        )
        deadline_inputs = [f"{prefix}/deadline/mode", f"{prefix}/profile"]
        if isinstance(participant.deadline, FixedDeadline):
            deadline_inputs.append(f"{prefix}/deadline/days")
        for field in ("deadline_min", "deadline_max"):
            evidence[f"{parameter_prefix}/{field}"] = DerivedEvidence(
                rule="geracao-v1", inputs=deadline_inputs
            )
        order_inputs = [
            f"{prefix}/seed",
            f"{prefix}/monthly_volume_brl",
            f"{prefix}/ticket_median_brl",
            f"{prefix}/out_fraction",
            *deadline_inputs,
            f"{prefix}/eh_efx",
            f"{prefix}/purpose_out",
            f"{prefix}/purpose_in",
            "/warmup_days",
            "/measurement_days",
        ]
        evidence[f"/orders/{participant.id}"] = DerivedEvidence(
            rule="geracao-v1", inputs=order_inputs
        )
    return evidence


def preparar_carteira(
    request: PreparationRequest,
    *,
    build_sha: str,
    relogio: Callable[[], datetime] | None = None,
    id_factory: Callable[[], UUID] | None = None,
) -> PreparationResponse:
    """Gera ordens explícitas e metadados, sem executar prévia, netting ou custo."""
    horizon_days = request.input.warmup_days + request.input.measurement_days
    prepared: list[tuple[UUID, Arquetipo, int, PreparationParameter]] = []
    expected_orders = Decimal(0)
    for participant in sorted(request.input.participants, key=lambda value: str(value.id)):
        profile, parameter = _dimensionar(
            participant, request.input.measurement_days
        )
        expected_orders += Decimal(parameter.cadence_monthly) * Decimal(horizon_days) / Decimal(30)
        prepared.append((participant.id, profile, int(participant.seed), parameter))
    if expected_orders > MAX_EXPECTED_ORDERS:
        raise PreparationLimitExceeded("cadência esperada excede o limite de preparação")

    participant_orders: dict[UUID, list[Ordem]] = {}
    for participant_id, profile, seed, _ in prepared:
        participant_orders[participant_id] = list(
            gerar_ordens(profile, str(participant_id), seed, horizon_days)
        )
    all_orders = sorted(
        (order for orders in participant_orders.values() for order in orders),
        key=lambda order: order.id,
    )
    if len(all_orders) > 1000:
        raise PreparationLimitExceeded("ordens realizadas excedem o limite de preparação")

    composition = [
        _composition(participant_id, participant_orders[participant_id])
        for participant_id, _, _, _ in prepared
    ]
    composition.append(_composition(None, all_orders))
    clock = relogio or (lambda: datetime.now(UTC))
    new_id = id_factory or uuid4
    return PreparationResponse(
        preparation_version="1.0.0",
        preparation_id=new_id(),
        request_id=request.request_id,
        study_id=request.study_id,
        scenario_id=request.scenario_id,
        scenario_revision=request.scenario_revision,
        created_at=clock(),
        motor_build_sha=build_sha,
        generator_version="dimensionamento-v1",
        generation_fingerprint=_generation_fingerprint(request, build_sha),
        input_snapshot=request.input,
        orders=[_order_dto(order) for order in all_orders],
        parameters=[parameter for _, _, _, parameter in prepared],
        composition=composition,
        derived_provenance=_derived_provenance(request),
    )
