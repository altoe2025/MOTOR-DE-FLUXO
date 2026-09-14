"""DTOs HTTP versionados de autoria efetiva, preparação e catálogo."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    Field,
    StrictBool,
    StrictInt,
    ValidationError,
    field_validator,
    model_validator,
)
from pydantic_core import PydanticCustomError

from servidor.contracts.input import CustoEntrada, OrdemEntrada
from servidor.contracts.preview import BuildSha, Fingerprint
from servidor.contracts.primitives import (
    DateTimeValue,
    DecimalText,
    StrictModel,
    UUIDValue,
    decimal_places,
    decimal_value,
    validate_identifier,
)

PREPARATION_VERSION = "1.0.0"
CATALOG_VERSION = "1.0.0"
GENERATOR_VERSION = "dimensionamento-v1"
MAX_SEED = 2**63 - 1

ProfileId = Literal[
    "remessa_outbound_massiva",
    "psp_inbound",
    "cripto_native_sem_fiat",
    "payroll_fornecedor",
    "exportador",
    "tesouraria_corporativa",
]
ExampleId = Literal[
    "equilibrado",
    "retail_pesado",
    "corporativo_pesado",
    "psp_dominante",
    "outbound_extremo",
]
SeedText = Annotated[
    str,
    Field(strict=True, min_length=1, max_length=19, pattern=r"^(0|[1-9][0-9]*)$"),
]

_PROFILE_IDS = {
    "remessa_outbound_massiva",
    "psp_inbound",
    "cripto_native_sem_fiat",
    "payroll_fornecedor",
    "exportador",
    "tesouraria_corporativa",
}
_EXAMPLE_IDS = {
    "equilibrado",
    "retail_pesado",
    "corporativo_pesado",
    "psp_dominante",
    "outbound_extremo",
}
_COST_FIELDS = (
    "iof_out",
    "iof_in",
    "carry_cnr",
    "spread_rail_bps",
    "custo_fixo_remessa",
    "custo_oportunidade_aa",
    "ptax",
)


def _require_timezone(value: datetime, field: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field} deve conter fuso")
    return value


def _validate_money(value: str, *, minimum: Decimal) -> str:
    number = decimal_value(value)
    if number < minimum or number > Decimal(10**12):
        raise ValueError("valor monetário fora do intervalo permitido")
    if decimal_places(value) > 6:
        raise ValueError("valor monetário aceita no máximo 6 casas decimais")
    return value


def _validate_fraction(value: str) -> str:
    number = decimal_value(value)
    if not Decimal(0) <= number <= Decimal(1) or decimal_places(value) > 12:
        raise ValueError("fração fora do intervalo ou precisão permitidos")
    return value


def _escape_pointer_token(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _source_validation_error(code: str, path: str, message: str) -> ValidationError:
    location = tuple(
        token.replace("~1", "/").replace("~0", "~")
        for token in path.removeprefix("/").split("/")
    )
    return ValidationError.from_exception_data(
        "EffectiveInput",
        [
            {
                "type": PydanticCustomError(code, message),
                "loc": location,
                "input": None,
            }
        ],
    )


class EffectiveSource(StrictModel):
    kind: Literal["PADRAO_SINTETICO", "ESTIMATIVA_USUARIO"]
    source: Annotated[str, Field(strict=True, min_length=1, max_length=200)]
    recorded_at: DateTimeValue

    @field_validator("recorded_at")
    @classmethod
    def recorded_at_has_timezone(cls, value: datetime) -> datetime:
        return _require_timezone(value, "recorded_at")


class ProfileDeadline(StrictModel):
    mode: Literal["PROFILE"]


class FixedDeadline(StrictModel):
    mode: Literal["FIXED"]
    days: Annotated[StrictInt, Field(ge=0, le=365)]


EffectiveDeadline = Annotated[
    ProfileDeadline | FixedDeadline,
    Field(discriminator="mode"),
]


class EffectiveParticipant(StrictModel):
    id: UUIDValue
    profile: ProfileId
    seed: SeedText
    monthly_volume_brl: DecimalText
    ticket_median_brl: DecimalText
    out_fraction: DecimalText
    deadline: EffectiveDeadline
    eh_efx: StrictBool
    purpose_out: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    purpose_in: Annotated[str, Field(strict=True, min_length=1, max_length=128)]

    @field_validator("seed")
    @classmethod
    def seed_is_in_range(cls, value: str) -> str:
        if int(value) > MAX_SEED:
            raise ValueError("seed fora do intervalo permitido")
        return value

    @field_validator("monthly_volume_brl")
    @classmethod
    def monthly_volume_is_valid(cls, value: str) -> str:
        return _validate_money(value, minimum=Decimal("0.000001"))

    @field_validator("ticket_median_brl")
    @classmethod
    def ticket_median_is_valid(cls, value: str) -> str:
        return _validate_money(value, minimum=Decimal("0.01"))

    @field_validator("out_fraction")
    @classmethod
    def out_fraction_is_valid(cls, value: str) -> str:
        return _validate_fraction(value)

    @field_validator("purpose_out", "purpose_in")
    @classmethod
    def purposes_are_exact(cls, value: str) -> str:
        if value != value.strip():
            raise ValueError("finalidade não pode ter espaços externos")
        return value


def required_source_paths(input_value: EffectiveInput) -> set[str]:
    """Retorna os caminhos estáveis exigidos para a autoria efetiva."""
    required = {"/warmup_days", "/measurement_days", "/window_days"}
    required.update(f"/costs/{field}" for field in _COST_FIELDS)
    for participant in input_value.participants:
        prefix = f"/participants/{participant.id}"
        required.update(
            {
                f"{prefix}/profile",
                f"{prefix}/monthly_volume_brl",
                f"{prefix}/ticket_median_brl",
                f"{prefix}/out_fraction",
                f"{prefix}/deadline/mode",
                f"{prefix}/eh_efx",
                f"{prefix}/purpose_out",
                f"{prefix}/purpose_in",
            }
        )
        if isinstance(participant.deadline, FixedDeadline):
            required.add(f"{prefix}/deadline/days")
    for rule in input_value.costs.iof_por_finalidade:
        purpose = _escape_pointer_token(rule.finalidade)
        required.add(f"/costs/iof_por_finalidade/{purpose}/{rule.direcao}")
    return required


class EffectiveInput(StrictModel):
    participants: Annotated[list[EffectiveParticipant], Field(max_length=100)]
    warmup_days: Annotated[StrictInt, Field(ge=0, le=365)]
    measurement_days: Annotated[StrictInt, Field(ge=1, le=365)]
    window_days: Annotated[StrictInt, Field(ge=1, le=730)]
    costs: CustoEntrada
    sources: dict[str, EffectiveSource]

    @model_validator(mode="after")
    def validate_semantics(self) -> EffectiveInput:
        participant_ids = [participant.id for participant in self.participants]
        if len(participant_ids) != len(set(participant_ids)):
            raise ValueError("IDs de participante repetidos")
        if self.warmup_days + self.measurement_days > 730:
            raise ValueError("período total excede 730 dias")
        if any(rule.finalidade != rule.finalidade.strip() for rule in self.costs.iof_por_finalidade):
            raise ValueError("finalidade de IOF não pode ter espaços externos")
        required = required_source_paths(self)
        supplied = set(self.sources)
        missing = required - supplied
        if missing:
            raise _source_validation_error(
                "ORIGEM_AUSENTE",
                min(missing),
                "Origem obrigatória ausente.",
            )
        extra = supplied - required
        if extra:
            raise _source_validation_error(
                "ORIGEM_INVALIDA",
                min(extra),
                "Caminho de origem não reconhecido.",
            )
        return self


class PreparationRequest(StrictModel):
    preparation_version: Literal["1.0.0"]
    request_id: UUIDValue
    study_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: Annotated[StrictInt, Field(ge=1)]
    expected_build_sha: BuildSha
    input: EffectiveInput


class DerivedEvidence(StrictModel):
    rule: Literal["dimensionamento-v1", "geracao-v1", "soma-ordens-v1"]
    inputs: Annotated[list[Annotated[str, Field(strict=True, min_length=1)]], Field(min_length=1)]

    @field_validator("inputs")
    @classmethod
    def inputs_are_stable_paths(cls, value: list[str]) -> list[str]:
        if any(not path.startswith("/") or path != path.strip() for path in value):
            raise ValueError("entrada derivada deve ser caminho estável")
        return value


class RealizedComposition(StrictModel):
    participant_id: UUIDValue | None
    order_count: Annotated[StrictInt, Field(ge=0, le=1000)]
    out_brl: DecimalText
    in_brl: DecimalText
    total_brl: DecimalText
    out_fraction: DecimalText | None

    @field_validator("out_brl", "in_brl", "total_brl")
    @classmethod
    def totals_are_non_negative(cls, value: str) -> str:
        if decimal_value(value) < 0:
            raise ValueError("composição não pode ser negativa")
        return value

    @field_validator("out_fraction")
    @classmethod
    def realized_fraction_is_valid(cls, value: str | None) -> str | None:
        return None if value is None else _validate_fraction(value)


class PreparationParameter(StrictModel):
    participant_id: UUIDValue
    sigma: DecimalText
    cadence_monthly: DecimalText
    expected_period_brl: DecimalText
    deadline_min: Annotated[StrictInt, Field(ge=0, le=365)]
    deadline_max: Annotated[StrictInt, Field(ge=0, le=365)]

    @field_validator("sigma", "cadence_monthly", "expected_period_brl")
    @classmethod
    def derived_values_are_positive(cls, value: str) -> str:
        if decimal_value(value) <= 0:
            raise ValueError("parâmetro derivado deve ser positivo")
        return value

    @model_validator(mode="after")
    def deadline_is_ordered(self) -> PreparationParameter:
        if self.deadline_max < self.deadline_min:
            raise ValueError("deadline_max deve ser maior ou igual a deadline_min")
        return self


class PreparationResponse(StrictModel):
    preparation_version: Literal["1.0.0"]
    preparation_id: UUIDValue
    request_id: UUIDValue
    study_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: Annotated[StrictInt, Field(ge=1)]
    created_at: DateTimeValue
    motor_build_sha: BuildSha
    generator_version: Literal["dimensionamento-v1"]
    catalog_version: Literal["1.0.0"]
    generation_fingerprint: Fingerprint
    input_snapshot: EffectiveInput
    orders: Annotated[list[OrdemEntrada], Field(max_length=1000)]
    parameters: list[PreparationParameter]
    composition: list[RealizedComposition]
    derived_provenance: dict[str, DerivedEvidence]

    @field_validator("created_at")
    @classmethod
    def created_at_has_timezone(cls, value: datetime) -> datetime:
        return _require_timezone(value, "created_at")


class ProfileTemplate(StrictModel):
    id: ProfileId
    ticket_median_brl: DecimalText
    sigma: DecimalText
    cadence_monthly: DecimalText
    monthly_volume_brl: DecimalText
    out_fraction: DecimalText
    deadline_min: Annotated[StrictInt, Field(ge=0, le=365)]
    deadline_max: Annotated[StrictInt, Field(ge=0, le=365)]
    eh_efx: StrictBool
    purpose_out: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    purpose_in: Annotated[str, Field(strict=True, min_length=1, max_length=128)]

    @field_validator("ticket_median_brl")
    @classmethod
    def profile_ticket_median_is_valid(cls, value: str) -> str:
        return _validate_money(value, minimum=Decimal("0.01"))

    @field_validator("monthly_volume_brl")
    @classmethod
    def profile_monthly_volume_is_valid(cls, value: str) -> str:
        return _validate_money(value, minimum=Decimal("0.000001"))

    @field_validator("sigma", "cadence_monthly")
    @classmethod
    def profile_parameters_are_positive(cls, value: str) -> str:
        if decimal_value(value) <= 0:
            raise ValueError("parâmetro de perfil deve ser positivo")
        return value

    @field_validator("out_fraction")
    @classmethod
    def profile_fraction_is_valid(cls, value: str) -> str:
        return _validate_fraction(value)

    @field_validator("purpose_out", "purpose_in")
    @classmethod
    def profile_purposes_are_exact(cls, value: str) -> str:
        return validate_identifier(value)

    @model_validator(mode="after")
    def profile_deadline_is_ordered(self) -> ProfileTemplate:
        if self.deadline_max < self.deadline_min:
            raise ValueError("deadline_max deve ser maior ou igual a deadline_min")
        return self


class ExampleParticipant(StrictModel):
    template_id: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    profile: ProfileId
    seed: SeedText

    @field_validator("template_id")
    @classmethod
    def template_id_is_exact(cls, value: str) -> str:
        return validate_identifier(value)

    @field_validator("seed")
    @classmethod
    def template_seed_is_in_range(cls, value: str) -> str:
        if int(value) > MAX_SEED:
            raise ValueError("seed fora do intervalo permitido")
        return value


class ExampleTemplate(StrictModel):
    id: ExampleId
    label: Annotated[str, Field(strict=True, min_length=1, max_length=120)]
    weights: dict[ProfileId, DecimalText]
    participants: Annotated[list[ExampleParticipant], Field(min_length=12, max_length=12)]

    @model_validator(mode="after")
    def validate_example(self) -> ExampleTemplate:
        if set(self.weights) != _PROFILE_IDS:
            raise ValueError("pesos devem cobrir exatamente os perfis do catálogo")
        numbers = [decimal_value(value) for value in self.weights.values()]
        if any(value < 0 for value in numbers) or sum(numbers) <= 0:
            raise ValueError("pesos devem ser não negativos e ter soma positiva")
        template_ids = [participant.template_id for participant in self.participants]
        if len(template_ids) != len(set(template_ids)):
            raise ValueError("template_id repetido")
        return self


class CatalogResponse(StrictModel):
    catalog_version: Literal["1.0.0"]
    motor_build_sha: BuildSha
    profiles: Annotated[list[ProfileTemplate], Field(min_length=6, max_length=6)]
    examples: Annotated[list[ExampleTemplate], Field(min_length=5, max_length=5)]
    costs: CustoEntrada
    source: Annotated[str, Field(strict=True, min_length=1, max_length=200)]
    recorded_at: DateTimeValue

    @field_validator("recorded_at")
    @classmethod
    def catalog_time_has_timezone(cls, value: datetime) -> datetime:
        return _require_timezone(value, "recorded_at")

    @model_validator(mode="after")
    def catalog_is_complete(self) -> CatalogResponse:
        if {profile.id for profile in self.profiles} != _PROFILE_IDS:
            raise ValueError("catálogo deve conter exatamente os seis perfis")
        if {example.id for example in self.examples} != _EXAMPLE_IDS:
            raise ValueError("catálogo deve conter exatamente os cinco exemplos")
        return self


class Capabilities(StrictModel):
    preparation_version: Literal["1.0.0"]
    preview_version: Literal["1.0.0"]
    presentation_version: Literal["1.0.0"]
    motor_schema_version: Literal["1.0.0"]
    generator_version: Literal["dimensionamento-v1"]
    catalog_version: Literal["1.0.0"]
    motor_build_sha: BuildSha
    max_orders: Literal[1000]
    max_expected_orders: Literal[500]
