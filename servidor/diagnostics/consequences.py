"""Regras versionadas de consequências e limitações do diagnóstico."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from servidor.contracts.diagnostics import (
    AvailableEvidenceMetric,
    DiagnosticAxes,
    DiagnosticConsequence,
    DiagnosticLimitation,
)


def _value(metric: object) -> Decimal | None:
    if not isinstance(metric, AvailableEvidenceMetric):
        return None
    return Decimal(metric.value) if isinstance(metric.value, str) else None


def derive_consequences(axes: DiagnosticAxes) -> tuple[DiagnosticConsequence, ...]:
    consequences: list[DiagnosticConsequence] = []
    if (
        _value(axes.structural_potential.gross_out_brl) == 0
        or _value(axes.structural_potential.gross_in_brl) == 0
    ):
        consequences.append(
            DiagnosticConsequence(
                rule_id="opposite-direction-absent",
                rule_version="1.0.0",
                axis="STRUCTURAL_POTENTIAL",
                statement_code="DIRECAO_OPOSTA_AUSENTE",
                evidence_refs=[
                    "/axes/structural_potential/gross_out_brl",
                    "/axes/structural_potential/gross_in_brl",
                ],
            )
        )
    if (_value(axes.policy_capture.uncaptured_potential_brl) or Decimal(0)) > 0:
        consequences.append(
            DiagnosticConsequence(
                rule_id="uncaptured-potential-positive",
                rule_version="1.0.0",
                axis="POLICY_CAPTURE",
                statement_code="POTENTIAL_NAO_CAPTURADO",
                evidence_refs=["/axes/policy_capture/uncaptured_potential_brl"],
            )
        )
    if (_value(axes.cross_border_residual.remitted_brl) or Decimal(0)) > 0:
        consequences.append(
            DiagnosticConsequence(
                rule_id="cross-border-residual-positive",
                rule_version="1.0.0",
                axis="CROSS_BORDER_RESIDUAL",
                statement_code="RESIDUO_TRANSFRONTEIRICO",
                evidence_refs=["/axes/cross_border_residual/remitted_brl"],
            )
        )
    savings = axes.economic_robustness.savings_brl
    if isinstance(savings, AvailableEvidenceMetric) and savings.value.amplitude != "0":
        consequences.append(
            DiagnosticConsequence(
                rule_id="economic-dispersion-positive",
                rule_version="1.0.0",
                axis="ECONOMIC_ROBUSTNESS",
                statement_code="DISPERSAO_ECONOMICA_OBSERVADA",
                evidence_refs=["/axes/economic_robustness/savings_brl"],
            )
        )
    result = tuple(sorted(consequences, key=lambda item: (item.axis, item.rule_id)))
    validate_evidence_references(axes, result)
    return result


@dataclass(frozen=True)
class LimitationContext:
    axes: DiagnosticAxes
    sampling_kind: Literal["FIXED_INPUT", "GENERATED_INPUT"]
    generator_recipe_available: bool
    field_coverage_complete: bool
    horizon_truncated: bool
    failed_repetition_count: int
    costs_have_observed_provenance: bool

    def __post_init__(self) -> None:
        if self.failed_repetition_count < 0:
            raise ValueError("failed_repetition_count deve ser não negativo")


def derive_limitations(context: LimitationContext) -> tuple[DiagnosticLimitation, ...]:
    limitations: list[DiagnosticLimitation] = []
    if context.sampling_kind == "FIXED_INPUT":
        limitations.append(
            DiagnosticLimitation(
                code="FIXED_INPUT_NO_DISTRIBUTION",
                severity="INFO",
                condition="FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION",
                evidence_refs=["/axes/economic_robustness/baseline_brl"],
            )
        )
    if not context.generator_recipe_available:
        limitations.append(
            DiagnosticLimitation(
                code="GENERATOR_RECIPE_ABSENT",
                severity="WARNING",
                condition="GENERATOR_RECIPE_NOT_AVAILABLE",
                evidence_refs=["/axes/structural_potential/gross_out_brl"],
            )
        )
    if not context.field_coverage_complete:
        limitations.append(
            DiagnosticLimitation(
                code="FIELD_COVERAGE_INSUFFICIENT",
                severity="WARNING",
                condition="REQUIRED_FIELD_COVERAGE_INCOMPLETE",
                evidence_refs=["/axes/structural_potential/gross_out_brl"],
            )
        )
    if context.horizon_truncated:
        limitations.append(
            DiagnosticLimitation(
                code="HORIZON_TRUNCATED",
                severity="WARNING",
                condition="ORDER_DRAINED_BEFORE_OWN_DEADLINE",
                evidence_refs=["/axes/temporal_compatibility/horizon_closures"],
            )
        )
    if context.failed_repetition_count:
        limitations.append(
            DiagnosticLimitation(
                code="FAILED_REPETITIONS",
                severity="WARNING",
                condition=f"FAILED_REPETITION_COUNT={context.failed_repetition_count}",
                evidence_refs=["/axes/economic_robustness/baseline_brl"],
            )
        )
    if not context.costs_have_observed_provenance:
        limitations.append(
            DiagnosticLimitation(
                code="COSTS_NOT_OBSERVED",
                severity="WARNING",
                condition="COST_PROVENANCE_IS_NOT_OBSERVED",
                evidence_refs=["/axes/economic_robustness/netted_brl"],
            )
        )
    result = tuple(sorted(limitations, key=lambda item: item.code))
    validate_evidence_references(context.axes, result)
    return result


def _metric_references(model: BaseModel, prefix: str = "/axes") -> set[str]:
    references: set[str] = set()
    for name in model.__class__.model_fields:
        value = getattr(model, name)
        path = f"{prefix}/{name}"
        if hasattr(value, "state"):
            references.add(path)
        elif isinstance(value, BaseModel):
            references.update(_metric_references(value, path))
    return references


def validate_evidence_references(
    axes: DiagnosticAxes, items: Iterable[DiagnosticConsequence | DiagnosticLimitation]
) -> None:
    available = _metric_references(axes)
    for item in items:
        for reference in item.evidence_refs:
            if reference not in available:
                raise ValueError(f"referência de evidência inexistente: {reference}")
