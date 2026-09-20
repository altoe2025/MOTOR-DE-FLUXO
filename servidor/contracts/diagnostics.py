"""Contratos públicos e estritos do diagnóstico robusto."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import Field, StrictInt, field_validator, model_validator

from servidor.contracts.input import PreviaRequest
from servidor.contracts.preparation import EffectiveInput, MAX_SEED, SeedText
from servidor.contracts.preview import Fingerprint, PreviewEnvelope
from servidor.contracts.primitives import (
    DateTimeValue,
    DecimalText,
    Identificador,
    OrigemValor,
    StrictModel,
    UUIDValue,
    validate_identifier,
)

AxisCode = Literal[
    "STRUCTURAL_POTENTIAL",
    "POLICY_CAPTURE",
    "TEMPORAL_COMPATIBILITY",
    "CROSS_BORDER_RESIDUAL",
    "COMPOSITION_DEPENDENCY",
    "ECONOMIC_ROBUSTNESS",
    "OPERATIONAL_PROFILE",
]
EvidenceState = Literal[
    "NOT_COLLECTED",
    "INSUFFICIENT_COVERAGE",
    "INCOMPATIBLE",
]
JobStatus = Literal[
    "QUEUED",
    "RUNNING",
    "AGGREGATING",
    "CANCEL_REQUESTED",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
]

EvidenceValue = TypeVar("EvidenceValue")


class AvailableEvidenceMetric(StrictModel, Generic[EvidenceValue]):
    state: Literal["AVAILABLE"]
    value: EvidenceValue
    evidence: Annotated[
        list[Annotated[str, Field(strict=True, min_length=1, max_length=300)]],
        Field(max_length=200),
    ]


class UnavailableEvidenceMetric(StrictModel):
    state: EvidenceState
    reason: Annotated[str, Field(strict=True, min_length=1, max_length=200)]
    evidence: Annotated[
        list[Annotated[str, Field(strict=True, min_length=1, max_length=300)]],
        Field(max_length=200),
    ]


EvidenceMetric = Annotated[
    AvailableEvidenceMetric[DecimalText] | UnavailableEvidenceMetric,
    Field(discriminator="state"),
]


class DistributionSummary(StrictModel):
    minimum: DecimalText
    p10: DecimalText
    p25: DecimalText
    p50: DecimalText
    p75: DecimalText
    p90: DecimalText
    maximum: DecimalText
    amplitude: DecimalText


DistributionMetric = Annotated[
    AvailableEvidenceMetric[DistributionSummary] | UnavailableEvidenceMetric,
    Field(discriminator="state"),
]


class FixedInputPlan(StrictModel):
    kind: Literal["FIXED_INPUT"]
    count: Literal[1]
    preview_request: PreviaRequest


def _validate_participant_seeds(value: dict[str, str]) -> dict[str, str]:
    for participant_id, seed in value.items():
        try:
            UUID(participant_id)
        except (ValueError, TypeError, AttributeError) as error:
            raise ValueError("participant_seeds exige chaves UUID") from error
        if int(seed) > MAX_SEED:
            raise ValueError("seed fora do intervalo permitido")
    return value


class RepetitionPlan(StrictModel):
    repetition_id: UUIDValue
    participant_seeds: Annotated[dict[str, SeedText], Field(max_length=100)]

    @field_validator("participant_seeds")
    @classmethod
    def participant_ids_are_uuids(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_participant_seeds(value)


class GeneratedInputPlan(StrictModel):
    kind: Literal["GENERATED_INPUT"]
    count: Literal[10, 30, 100]
    preparation_input: EffectiveInput
    repetitions: Annotated[list[RepetitionPlan], Field(min_length=10, max_length=100)]

    @model_validator(mode="after")
    def validate_complete_seed_plan(self) -> GeneratedInputPlan:
        if len(self.repetitions) != self.count:
            raise ValueError("count deve corresponder às repetições explícitas")
        repetition_ids = [item.repetition_id for item in self.repetitions]
        if len(repetition_ids) != len(set(repetition_ids)):
            raise ValueError("repetition_id repetido")
        participant_ids = {
            str(participant.id) for participant in self.preparation_input.participants
        }
        seeds_by_participant: dict[str, set[str]] = {
            participant_id: set() for participant_id in participant_ids
        }
        for repetition in self.repetitions:
            if set(repetition.participant_seeds) != participant_ids:
                raise ValueError("cada repetição deve listar todos os participantes")
            for participant_id, seed in repetition.participant_seeds.items():
                if seed in seeds_by_participant[participant_id]:
                    raise ValueError("seed repetida para o mesmo participante")
                seeds_by_participant[participant_id].add(seed)
        return self


DiagnosticSamplingPlan = Annotated[
    FixedInputPlan | GeneratedInputPlan,
    Field(discriminator="kind"),
]


class DiagnosticRequest(StrictModel):
    api_version: Literal["1.0.0"]
    request_id: UUIDValue
    idempotency_key: UUIDValue
    study_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: Annotated[StrictInt, Field(ge=1)]
    input_fingerprint: Fingerprint
    sampling: DiagnosticSamplingPlan
    selected_repetition_id: UUIDValue
    provenance: Annotated[dict[str, OrigemValor], Field(max_length=500)]

    @model_validator(mode="after")
    def validate_selection_and_fixed_identity(self) -> DiagnosticRequest:
        if isinstance(self.sampling, GeneratedInputPlan):
            repetition_ids = {
                repetition.repetition_id for repetition in self.sampling.repetitions
            }
            if self.selected_repetition_id not in repetition_ids:
                raise ValueError("selected_repetition_id não existe no plano")
            return self
        request = self.sampling.preview_request
        if (
            request.study_id != self.study_id
            or request.scenario_id != self.scenario_id
            or request.scenario_revision != self.scenario_revision
        ):
            raise ValueError("identidade da prévia fixa não reconcilia")
        return self


class DiagnosticRetryRequest(StrictModel):
    api_version: Literal["1.0.0"]
    request_id: UUIDValue
    idempotency_key: UUIDValue


class JobProgress(StrictModel):
    completed: Annotated[StrictInt, Field(ge=0, le=100)]
    failed: Annotated[StrictInt, Field(ge=0, le=100)]
    total: Annotated[StrictInt, Field(ge=1, le=100)]
    current_repetition_id: UUIDValue | None
    phase: Literal["QUEUED", "EXECUTING", "AGGREGATING", "TERMINAL"]
    created_at: DateTimeValue
    started_at: DateTimeValue | None
    updated_at: DateTimeValue
    finished_at: DateTimeValue | None

    @field_validator("created_at", "started_at", "updated_at", "finished_at")
    @classmethod
    def timestamps_have_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("timestamps de job devem conter fuso")
        return value

    @model_validator(mode="after")
    def validate_progress(self) -> JobProgress:
        if self.completed + self.failed > self.total:
            raise ValueError("progresso excede o total")
        timeline = [self.created_at]
        if self.started_at is not None:
            timeline.append(self.started_at)
        timeline.append(self.updated_at)
        if self.finished_at is not None:
            timeline.append(self.finished_at)
        if timeline != sorted(timeline):
            raise ValueError("timestamps de progresso não são monotônicos")
        if self.phase == "QUEUED" and (
            self.started_at is not None
            or self.current_repetition_id is not None
            or self.completed != 0
            or self.failed != 0
        ):
            raise ValueError("progresso enfileirado é impossível")
        if self.phase in {"EXECUTING", "AGGREGATING"} and self.started_at is None:
            raise ValueError("progresso iniciado exige started_at")
        if self.phase == "AGGREGATING" and self.completed + self.failed != self.total:
            raise ValueError("agregação exige todas as repetições concluídas")
        if self.phase == "TERMINAL" and self.finished_at is None:
            raise ValueError("progresso terminal exige finished_at")
        if self.phase != "TERMINAL" and self.finished_at is not None:
            raise ValueError("finished_at só existe em progresso terminal")
        return self


class JobError(StrictModel):
    code: Annotated[str, Field(strict=True, min_length=1, max_length=100)]
    message: Annotated[str, Field(strict=True, min_length=1, max_length=500)]
    repetition_id: UUIDValue | None


class JobSnapshot(StrictModel):
    api_version: Literal["1.0.0"]
    job_id: UUIDValue
    request_id: UUIDValue
    status: JobStatus
    progress: JobProgress
    retry_of_job_id: UUIDValue | None
    error: JobError | None

    @model_validator(mode="after")
    def validate_status_progress(self) -> JobSnapshot:
        expected_phases = {
            "QUEUED": {"QUEUED"},
            "RUNNING": {"EXECUTING"},
            "AGGREGATING": {"AGGREGATING"},
            "CANCEL_REQUESTED": {"QUEUED", "EXECUTING"},
            "SUCCEEDED": {"TERMINAL"},
            "FAILED": {"TERMINAL"},
            "CANCELLED": {"TERMINAL"},
        }
        if self.progress.phase not in expected_phases[self.status]:
            raise ValueError("fase incompatível com status do job")
        if self.status == "SUCCEEDED" and (
            self.progress.completed != self.progress.total
            or self.progress.failed != 0
            or self.progress.current_repetition_id is not None
        ):
            raise ValueError("job bem-sucedido exige progresso integral")
        if self.status == "FAILED" and self.error is None:
            raise ValueError("job falho exige erro")
        if self.status != "FAILED" and self.error is not None:
            raise ValueError("erro só pode existir em job falho")
        return self


class StructuralPotentialAxis(StrictModel):
    gross_out_brl: EvidenceMetric
    gross_in_brl: EvidenceMetric
    imbalance_brl: EvidenceMetric
    ceiling_brl: EvidenceMetric


class PolicyCaptureAxis(StrictModel):
    matched_brl: EvidenceMetric
    intra_client_brl: EvidenceMetric
    inter_client_brl: EvidenceMetric
    uncaptured_potential_brl: EvidenceMetric
    captured_fraction: EvidenceMetric


class TemporalCompatibilityAxis(StrictModel):
    deadline_days: EvidenceMetric
    same_day_fraction: EvidenceMetric
    weighted_wait_days: EvidenceMetric
    window_closures: EvidenceMetric
    deadline_closures: EvidenceMetric
    horizon_closures: EvidenceMetric


class ResidualBreakdown(StrictModel):
    key: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    direction: Literal["OUT", "IN"]
    value_brl: DecimalText


class CrossBorderResidualAxis(StrictModel):
    remitted_brl: EvidenceMetric
    out_brl: EvidenceMetric
    in_brl: EvidenceMetric
    by_day: Annotated[list[ResidualBreakdown], Field(max_length=731)]
    by_purpose: Annotated[list[ResidualBreakdown], Field(max_length=200)]


class ParticipantShare(StrictModel):
    participant_id: Identificador
    volume_brl: DecimalText
    share: DecimalText

    @field_validator("participant_id")
    @classmethod
    def participant_id_is_exact(cls, value: str) -> str:
        return validate_identifier(value)


class CompositionDependencyAxis(StrictModel):
    hhi: EvidenceMetric
    largest_share: EvidenceMetric
    participants: Annotated[list[ParticipantShare], Field(max_length=100)]


class EconomicRobustnessAxis(StrictModel):
    baseline_brl: DistributionMetric
    netted_brl: DistributionMetric
    savings_brl: DistributionMetric
    netability_fraction: DistributionMetric


class OperationalProfileAxis(StrictModel):
    order_count: EvidenceMetric
    cycle_count: EvidenceMetric
    maximum_open_queue: EvidenceMetric
    due_order_count: EvidenceMetric
    weighted_wait_days: EvidenceMetric
    processing_duration_ms: EvidenceMetric


class DiagnosticAxes(StrictModel):
    structural_potential: StructuralPotentialAxis
    policy_capture: PolicyCaptureAxis
    temporal_compatibility: TemporalCompatibilityAxis
    cross_border_residual: CrossBorderResidualAxis
    composition_dependency: CompositionDependencyAxis
    economic_robustness: EconomicRobustnessAxis
    operational_profile: OperationalProfileAxis


class RepetitionSummary(StrictModel):
    repetition_id: UUIDValue
    participant_seeds: Annotated[dict[str, SeedText], Field(max_length=100)]
    input_fingerprint: Fingerprint
    execution_fingerprint: Fingerprint
    baseline_brl: DecimalText
    netted_brl: DecimalText
    savings_brl: DecimalText
    netability_fraction: DecimalText
    duration_ms: Annotated[StrictInt, Field(ge=0)]

    @field_validator("participant_seeds")
    @classmethod
    def participant_ids_are_uuids(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_participant_seeds(value)


class SingleExecutionStatistics(StrictModel):
    kind: Literal["SINGLE_EXECUTION"]
    count: Literal[1]
    selected_repetition_id: UUIDValue
    percentile_method: None


class DistributionStatistics(StrictModel):
    kind: Literal["DISTRIBUTION"]
    count: Literal[10, 30, 100]
    selected_repetition_id: UUIDValue
    percentile_method: Literal["EMPIRICAL_NEAREST_RANK"]


DiagnosticStatistics = Annotated[
    SingleExecutionStatistics | DistributionStatistics,
    Field(discriminator="kind"),
]


class DiagnosticConsequence(StrictModel):
    rule_id: Annotated[str, Field(strict=True, min_length=1, max_length=100)]
    rule_version: Literal["1.0.0"]
    axis: AxisCode
    statement_code: Annotated[str, Field(strict=True, min_length=1, max_length=100)]
    evidence_refs: Annotated[
        list[Annotated[str, Field(strict=True, min_length=1, max_length=300)]],
        Field(min_length=1, max_length=20),
    ]


class DiagnosticLimitation(StrictModel):
    code: Annotated[str, Field(strict=True, min_length=1, max_length=100)]
    severity: Literal["INFO", "WARNING"]
    condition: Annotated[str, Field(strict=True, min_length=1, max_length=200)]
    evidence_refs: Annotated[
        list[Annotated[str, Field(strict=True, min_length=1, max_length=300)]],
        Field(max_length=20),
    ]


class DiagnosticProvenance(StrictModel):
    request_paths: Annotated[dict[str, OrigemValor], Field(max_length=500)]
    evidence_refs: Annotated[
        list[Annotated[str, Field(strict=True, min_length=1, max_length=300)]],
        Field(max_length=500),
    ]


class DiagnosticEnvelope(StrictModel):
    api_version: Literal["1.0.0"]
    schema_version: Literal["1.0.0"]
    job_id: UUIDValue
    request_fingerprint: Fingerprint
    statistics: DiagnosticStatistics
    axes: DiagnosticAxes
    repetitions: Annotated[list[RepetitionSummary], Field(min_length=1, max_length=100)]
    selected_execution: PreviewEnvelope
    consequences: Annotated[list[DiagnosticConsequence], Field(max_length=100)]
    limitations: Annotated[list[DiagnosticLimitation], Field(max_length=100)]
    provenance: DiagnosticProvenance

    @model_validator(mode="after")
    def validate_repetition_set(self) -> DiagnosticEnvelope:
        if len(self.repetitions) != self.statistics.count:
            raise ValueError("statistics.count não reconcilia com repetitions")
        repetition_ids = [item.repetition_id for item in self.repetitions]
        if len(repetition_ids) != len(set(repetition_ids)):
            raise ValueError("resumo de repetição duplicado")
        if self.statistics.selected_repetition_id not in repetition_ids:
            raise ValueError("repetição selecionada não possui resumo")
        selected = next(
            item
            for item in self.repetitions
            if item.repetition_id == self.statistics.selected_repetition_id
        )
        if (
            self.selected_execution.statistics.repetition_id
            != self.statistics.selected_repetition_id
            or self.selected_execution.execution_fingerprint
            != selected.execution_fingerprint
        ):
            raise ValueError("execução completa não corresponde à repetição selecionada")
        if isinstance(self.statistics, SingleExecutionStatistics):
            metrics = (
                self.axes.economic_robustness.baseline_brl,
                self.axes.economic_robustness.netted_brl,
                self.axes.economic_robustness.savings_brl,
                self.axes.economic_robustness.netability_fraction,
            )
            if any(
                not isinstance(metric, UnavailableEvidenceMetric)
                or metric.state != "INSUFFICIENT_COVERAGE"
                or metric.reason != "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION"
                for metric in metrics
            ):
                raise ValueError("entrada fixa não pode fabricar distribuição")
        return self
