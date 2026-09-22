"""Contrato público, estrito e reconciliável do Replay temporal."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, StrictInt, model_validator

from servidor.contracts.diagnostics import DiagnosticEnvelope
from servidor.contracts.output import DecimalSaida
from servidor.contracts.preview import Fingerprint
from servidor.contracts.primitives import StrictModel, UUIDValue

ReplayTrigger = Literal["WINDOW", "DEADLINE", "HORIZON_END"]
ReplayCohort = Literal["WARMUP", "MEASUREMENT"]
MatchingOrigin = Literal["INTRA_CLIENTE", "INTER_CLIENTE"]

_TRIGGER_ORDER = {"WINDOW": 0, "DEADLINE": 1, "HORIZON_END": 2}


class ReplayRequestV1(StrictModel):
    api_version: Literal["1.0.0"]
    diagnostic_execution_id: UUIDValue
    diagnostic_envelope: DiagnosticEnvelope


class ReplayPeriodV1(StrictModel):
    mode: Literal["LEGADO", "NATURAL"]
    warmup_days: Annotated[StrictInt, Field(ge=0, le=730)]
    measurement_start_day: Annotated[StrictInt, Field(ge=0, le=730)]
    measurement_end_day: Annotated[StrictInt, Field(ge=0, le=730)]
    settlement_end_day: Annotated[StrictInt, Field(ge=0, le=730)]

    @model_validator(mode="after")
    def validate_period(self) -> ReplayPeriodV1:
        if self.measurement_start_day != self.warmup_days:
            raise ValueError("início medido deve coincidir com o aquecimento")
        if self.measurement_end_day < self.measurement_start_day:
            raise ValueError("fim medido não pode anteceder o início")
        if self.settlement_end_day < self.measurement_end_day:
            raise ValueError("liquidação não pode terminar antes da medição")
        if self.mode == "LEGADO" and (
            self.warmup_days != 0 or self.measurement_start_day != 0
        ):
            raise ValueError("período legado não possui aquecimento")
        return self


class ReplayOrderV1(StrictModel):
    id: Annotated[str, Field(strict=True, min_length=1, max_length=200)]
    client_id: Annotated[str, Field(strict=True, min_length=1, max_length=200)]
    direction: Literal["OUT", "IN"]
    known_day: Annotated[StrictInt, Field(ge=0, le=730)]
    deadline_day: Annotated[StrictInt, Field(ge=0)]
    value_brl: DecimalSaida
    cohort: ReplayCohort

    @model_validator(mode="after")
    def validate_order(self) -> ReplayOrderV1:
        if self.value_brl <= 0:
            raise ValueError("ordem do replay exige valor positivo")
        if self.deadline_day < self.known_day:
            raise ValueError("prazo não pode anteceder chegada")
        return self


class OrderArrivedEventV1(StrictModel):
    sequence: Annotated[StrictInt, Field(ge=0)]
    kind: Literal["ORDER_ARRIVED"]
    order_id: str


class AllocationEventV1(StrictModel):
    sequence: Annotated[StrictInt, Field(ge=0)]
    kind: Literal["ALLOCATION"]
    order_id: str
    allocation_type: Literal["CASADO", "REMETIDO"]
    value_brl: DecimalSaida
    direction: Literal["OUT", "IN"]
    matching_origin: MatchingOrigin | None

    @model_validator(mode="after")
    def validate_allocation(self) -> AllocationEventV1:
        if self.value_brl <= 0:
            raise ValueError("alocação do replay exige valor positivo")
        if self.allocation_type == "CASADO" and self.matching_origin is None:
            raise ValueError("CASADO exige origem")
        if self.allocation_type == "REMETIDO" and self.matching_origin is not None:
            raise ValueError("REMETIDO não aceita origem")
        return self


ReplayEventV1 = Annotated[
    OrderArrivedEventV1 | AllocationEventV1,
    Field(discriminator="kind"),
]


class ReplayFlowSegmentV1(StrictModel):
    closing_day: Annotated[StrictInt, Field(ge=0, le=730)]
    out_order_id: str
    in_order_id: str
    value_brl: DecimalSaida
    matching_origin: MatchingOrigin
    meaning: Literal["ILLUSTRATIVE_AGGREGATE_DECOMPOSITION"]

    @model_validator(mode="after")
    def validate_segment(self) -> ReplayFlowSegmentV1:
        if self.value_brl <= 0:
            raise ValueError("segmento exige valor positivo")
        return self


class ReplayClosingV1(StrictModel):
    triggers: Annotated[list[ReplayTrigger], Field(min_length=1, max_length=3)]
    gross_out_brl: DecimalSaida
    gross_in_brl: DecimalSaida
    matched_position_brl: DecimalSaida
    matched_contribution_brl: DecimalSaida
    intra_client_position_brl: DecimalSaida
    inter_client_position_brl: DecimalSaida
    remitted_out_brl: DecimalSaida
    remitted_in_brl: DecimalSaida
    flow_segments: Annotated[list[ReplayFlowSegmentV1], Field(max_length=2000)]

    @model_validator(mode="after")
    def validate_closing(self) -> ReplayClosingV1:
        values = (
            self.gross_out_brl,
            self.gross_in_brl,
            self.matched_position_brl,
            self.matched_contribution_brl,
            self.intra_client_position_brl,
            self.inter_client_position_brl,
            self.remitted_out_brl,
            self.remitted_in_brl,
        )
        if any(value < 0 for value in values):
            raise ValueError("valores de fechamento devem ser não negativos")
        if len(self.triggers) != len(set(self.triggers)) or self.triggers != sorted(
            self.triggers, key=_TRIGGER_ORDER.__getitem__
        ):
            raise ValueError("gatilhos fora da ordem canônica")
        if self.matched_contribution_brl != Decimal(2) * self.matched_position_brl:
            raise ValueError("contribuição casada deve conter as duas pontas")
        if (
            self.intra_client_position_brl + self.inter_client_position_brl
            != self.matched_position_brl
        ):
            raise ValueError("fases não reconciliam com a posição casada")
        if sum(
            (segment.value_brl for segment in self.flow_segments), Decimal(0)
        ) != self.matched_position_brl:
            raise ValueError("segmentos não reconciliam com a posição casada")
        return self


class ReplayEndStateV1(StrictModel):
    open_out_brl: DecimalSaida
    open_in_brl: DecimalSaida
    matched_position_accumulated_brl: DecimalSaida
    measured_matched_contribution_accumulated_brl: DecimalSaida
    remitted_out_accumulated_brl: DecimalSaida
    remitted_in_accumulated_brl: DecimalSaida

    @model_validator(mode="after")
    def validate_non_negative(self) -> ReplayEndStateV1:
        if any(value < 0 for value in self.__dict__.values()):
            raise ValueError("estado final exige valores não negativos")
        return self


class ReplayDayV1(StrictModel):
    day: Annotated[StrictInt, Field(ge=0, le=730)]
    events: Annotated[list[ReplayEventV1], Field(max_length=3000)]
    closing: ReplayClosingV1 | None
    end_state: ReplayEndStateV1

    @model_validator(mode="after")
    def validate_events(self) -> ReplayDayV1:
        sequences = [event.sequence for event in self.events]
        if sequences != list(range(len(sequences))):
            raise ValueError("sequência diária deve ser contínua a partir de zero")
        return self


class ReplayTotalsV1(StrictModel):
    measured_gross_brl: DecimalSaida
    measured_matched_contribution_brl: DecimalSaida
    measured_autonetting_contribution_brl: DecimalSaida
    measured_multilateral_contribution_brl: DecimalSaida
    measured_remitted_brl: DecimalSaida
    netability_fraction: DecimalSaida
    execution_matched_position_brl: DecimalSaida
    execution_remitted_out_brl: DecimalSaida
    execution_remitted_in_brl: DecimalSaida

    @model_validator(mode="after")
    def validate_totals(self) -> ReplayTotalsV1:
        if any(value < 0 for value in self.__dict__.values()):
            raise ValueError("totais do replay exigem valores não negativos")
        if (
            self.measured_autonetting_contribution_brl
            + self.measured_multilateral_contribution_brl
            != self.measured_matched_contribution_brl
        ):
            raise ValueError("contribuições por fase não reconciliam")
        expected = (
            self.measured_matched_contribution_brl / self.measured_gross_brl
            if self.measured_gross_brl
            else Decimal(0)
        )
        if self.netability_fraction != expected:
            raise ValueError("netabilidade não reconcilia")
        return self


class ReplayDocumentV1(StrictModel):
    api_version: Literal["1.0.0"]
    diagnostic_execution_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: Annotated[StrictInt, Field(ge=1)]
    repetition_id: UUIDValue
    participant_seeds: Annotated[dict[str, str], Field(max_length=100)]
    period: ReplayPeriodV1
    policy: Literal["P0"]
    currency: Literal["BRL"]
    orders: Annotated[list[ReplayOrderV1], Field(max_length=1000)]
    days: Annotated[list[ReplayDayV1], Field(min_length=1, max_length=731)]
    totals: ReplayTotalsV1
    motor_version: str
    execution_fingerprint: Fingerprint
    result_fingerprint: Fingerprint

    @model_validator(mode="after")
    def validate_document(self) -> ReplayDocumentV1:
        if [day.day for day in self.days] != list(
            range(self.period.settlement_end_day + 1)
        ):
            raise ValueError("dias do replay devem ser contínuos e inclusivos")
        order_ids = [order.id for order in self.orders]
        if len(order_ids) != len(set(order_ids)):
            raise ValueError("ordens do replay devem ter IDs únicos")
        known = set(order_ids)
        for day in self.days:
            for event in day.events:
                if event.order_id not in known:
                    raise ValueError("evento referencia ordem ausente")
        return self

