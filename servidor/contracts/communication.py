"""Strict projection of published values; this module never calculates the motor.

The fingerprint detects context drift, not authenticity. Evidence identities and
values are checked here; equality with canonical sources belongs to the builder.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import Field, field_validator, model_validator

from servidor.contracts.primitives import DECIMAL_PATTERN, Identificador, StrictModel

Label = Annotated[str, Field(min_length=1, max_length=200)]
Text = Annotated[str, Field(min_length=1, max_length=20_000)]
Revision = Annotated[int, Field(ge=1)]
Day = Annotated[int, Field(ge=0)]
EvidenceRefs = Annotated[list[Identificador], Field(min_length=1, max_length=20)]
UTC_PATTERN = r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$"


class CommunicationMetric(StrictModel):
    code: Identificador
    label: Label
    availability: Literal["AVAILABLE", "UNAVAILABLE"]
    value: Text | None
    unit: Literal["BRL", "FRACTION", "DAYS", "COUNT", "BPS", "TEXT"]
    meaning: Text
    evidenceRefs: EvidenceRefs

    @model_validator(mode="after")
    def validate_availability(self) -> Self:
        if self.availability == "UNAVAILABLE":
            if self.value is not None:
                raise ValueError("UNAVAILABLE exige value null")
        elif self.value is None:
            raise ValueError("AVAILABLE exige value textual")
        elif self.unit != "TEXT" and (
            len(self.value) > 80 or re.fullmatch(DECIMAL_PATTERN, self.value) is None
        ):
            raise ValueError("métrica numérica exige decimal ASCII de até 80 caracteres")
        return self


class CommunicationFact(StrictModel):
    code: Identificador
    label: Label
    value: Text
    evidenceRefs: EvidenceRefs


class CommunicationLimitation(StrictModel):
    code: Identificador
    severity: Literal["INFO", "WARNING"]
    statement: Text
    evidenceRefs: EvidenceRefs


Metrics = Annotated[list[CommunicationMetric], Field(max_length=500)]
Facts = Annotated[list[CommunicationFact], Field(max_length=2_000)]


class CommunicationSection(StrictModel):
    title: Label
    metrics: Metrics
    facts: Facts


class CommunicationReplaySnapshot(StrictModel):
    day: Day
    metrics: Metrics
    facts: Facts


class CommunicationEvidence(StrictModel):
    source: Literal["STUDY", "DIAGNOSTIC", "COMPARISON", "REPLAY"]
    sourceId: Identificador
    studyId: Identificador
    scenarioId: Identificador
    scenarioRevision: Revision
    diagnosticExecutionId: Identificador
    repetitionId: Identificador
    path: Annotated[str, Field(min_length=1, max_length=20_000, pattern=r"^(/([^~]|~[01])*)+$")]
    value: Text | None


class CommunicationStudy(StrictModel):
    id: Identificador
    name: Label
    revision: Revision


class CommunicationSelection(StrictModel):
    scenarioId: Identificador
    scenarioRevision: Revision
    diagnosticExecutionId: Identificador
    repetitionId: Identificador
    comparisonExecutionId: Identificador | None
    replayDay: Day | None


class CommunicationSource(StrictModel):
    family: Literal["OBSERVED", "PROFILE_SIMULATION"]
    label: Label
    synthetic: bool


class CommunicationDocumentV1(StrictModel):
    apiVersion: Literal["1.0.0"]
    presentationVersion: Literal["1.0.0"]
    generatedAt: Annotated[str, Field(pattern=UTC_PATTERN)]
    study: CommunicationStudy
    selection: CommunicationSelection
    source: CommunicationSource
    executiveMetrics: Metrics
    composition: CommunicationSection
    mechanism: CommunicationSection
    economics: CommunicationSection
    robustness: CommunicationSection
    comparison: CommunicationSection | None
    replaySnapshot: CommunicationReplaySnapshot | None
    assumptions: Facts
    provenance: Facts
    limitations: Annotated[list[CommunicationLimitation], Field(max_length=2_000)]
    versions: Facts
    evidenceIndex: Annotated[dict[Identificador, CommunicationEvidence], Field(max_length=10_000)]
    contextFingerprint: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]

    @field_validator("generatedAt")
    @classmethod
    def validate_generated_at(cls, value: str) -> str:
        if re.fullmatch(UTC_PATTERN, value) is None:
            raise ValueError("generatedAt exige instante RFC3339 UTC terminado em Z")
        datetime.fromisoformat(value)
        return value

    @model_validator(mode="after")
    def validate_projection(self) -> Self:
        selection = self.selection
        if self.source.synthetic != (self.source.family == "PROFILE_SIMULATION"):
            raise ValueError("rótulo sintético inconsistente com a família")
        if (self.comparison is None) != (selection.comparisonExecutionId is None):
            raise ValueError("comparação inconsistente com a seleção")
        if (self.replaySnapshot is None) != (selection.replayDay is None):
            raise ValueError("Replay inconsistente com a seleção")
        if self.replaySnapshot is not None and self.replaySnapshot.day != selection.replayDay:
            raise ValueError("dia do Replay inconsistente com a seleção")

        source_ids = {
            "STUDY": self.study.id,
            "DIAGNOSTIC": selection.diagnosticExecutionId,
            "COMPARISON": selection.comparisonExecutionId,
            "REPLAY": selection.diagnosticExecutionId,
        }
        seen = set()
        for evidence in self.evidenceIndex.values():
            if (
                evidence.studyId != self.study.id
                or evidence.scenarioId != selection.scenarioId
                or evidence.scenarioRevision != selection.scenarioRevision
                or evidence.diagnosticExecutionId != selection.diagnosticExecutionId
                or evidence.repetitionId != selection.repetitionId
                or evidence.sourceId != source_ids[evidence.source]
                or (evidence.source == "REPLAY" and self.replaySnapshot is None)
            ):
                raise ValueError("evidência pertence a outro contexto")
            identity = (evidence.source, evidence.sourceId, evidence.path)
            if identity in seen:
                raise ValueError("evidência duplicada para source/sourceId/path")
            seen.add(identity)

        sections = [self.composition, self.mechanism, self.economics, self.robustness]
        if self.comparison is not None:
            sections.append(self.comparison)
        containers: list[CommunicationSection | CommunicationReplaySnapshot] = [*sections]
        if self.replaySnapshot is not None:
            containers.append(self.replaySnapshot)
        metrics = [*self.executiveMetrics, *(m for section in containers for m in section.metrics)]
        facts = [*self.assumptions, *self.provenance, *self.versions,
                 *(fact for section in containers for fact in section.facts)]
        items: list[CommunicationMetric | CommunicationFact | CommunicationLimitation] = [
            *metrics, *facts, *self.limitations,
        ]
        for item in items:
            refs = item.evidenceRefs
            if len(refs) != len(set(refs)) or any(ref not in self.evidenceIndex for ref in refs):
                raise ValueError("referência de evidência ausente ou duplicada")
            values = [self.evidenceIndex[ref].value for ref in refs]
            if isinstance(item, CommunicationMetric) and item.availability == "UNAVAILABLE":
                if None not in values and item.meaning not in values:
                    raise ValueError("indisponibilidade sem evidência de ausência ou motivo")
            else:
                value = item.statement if isinstance(item, CommunicationLimitation) else item.value
                if value not in values:
                    raise ValueError("valor publicado não corresponde à evidência")

        payload = self.model_dump(mode="json", exclude={"generatedAt", "contextFingerprint"})
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        fingerprint = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
        if fingerprint != self.contextFingerprint:
            raise ValueError("contextFingerprint não corresponde ao documento")
        return self
