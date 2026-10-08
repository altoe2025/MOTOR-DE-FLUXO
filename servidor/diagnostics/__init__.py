"""Análise pura e determinística do diagnóstico robusto."""

from servidor.diagnostics.analysis import (
    RepetitionInput,
    analyze_diagnostic_repetitions,
    summarize_repetition,
)
from servidor.diagnostics.consequences import (
    LimitationContext,
    derive_consequences,
    derive_limitations,
    validate_evidence_references,
)

__all__ = (
    "LimitationContext",
    "RepetitionInput",
    "analyze_diagnostic_repetitions",
    "derive_consequences",
    "derive_limitations",
    "summarize_repetition",
    "validate_evidence_references",
)
