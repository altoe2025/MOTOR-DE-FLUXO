"""Envelope versionado da execução de prévia."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, StrictInt

from servidor.contracts.input import CenarioEntrada, PeriodoEntrada
from servidor.contracts.output import ResultadoCanonicoDTO
from servidor.contracts.primitives import OrigemValor, StrictModel, UUIDValue

Fingerprint = Annotated[str, Field(strict=True, pattern=r"^[0-9a-f]{64}$")]
BuildSha = Annotated[str, Field(strict=True, pattern=r"^[0-9a-f]{40}$")]


class EstatisticaPrevia(StrictModel):
    kind: Literal["SINGLE_EXECUTION"]
    count: Literal[1]
    seed: None
    repetition_id: UUIDValue
    percentile_method: None


class InputSnapshot(StrictModel):
    cenario: CenarioEntrada
    periodo: PeriodoEntrada
    proveniencia: dict[str, OrigemValor]


class PresentationContract(StrictModel):
    currency: Literal["BRL"]
    locale: Literal["pt-BR"]
    rounding: Literal["HALF_UP"]
    money_digits: Literal[2]
    fraction_percent_digits: Literal[2]


class PreviewEnvelope(StrictModel):
    api_version: Literal["1.0.0"]
    presentation_version: Literal["1.0.0"]
    execution_id: UUIDValue
    request_id: UUIDValue
    study_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: Annotated[StrictInt, Field(ge=1)]
    execution_fingerprint: Fingerprint
    provenance_fingerprint: Fingerprint
    motor_build_sha: BuildSha
    kind: Literal["PREVIA"]
    statistics: EstatisticaPrevia
    input_snapshot: InputSnapshot
    result: ResultadoCanonicoDTO
    presentation: PresentationContract


class ReferenceExample(StrictModel):
    cenario: CenarioEntrada
    periodo: PeriodoEntrada
    proveniencia: dict[str, OrigemValor]
