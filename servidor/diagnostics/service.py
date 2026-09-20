"""Execução serializável e agregação pura de diagnósticos."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from time import perf_counter_ns
from typing import Literal
from uuid import UUID

from servidor.contracts.diagnostics import (
    DiagnosticEnvelope,
    DiagnosticProvenance,
    DiagnosticRequest,
    DistributionStatistics,
    FixedInputPlan,
    GeneratedInputPlan,
    RepetitionSummary,
    SingleExecutionStatistics,
)
from servidor.contracts.input import CenarioEntrada, PeriodoNatural, PreviaRequest
from servidor.contracts.preparation import EffectiveInput, PreparationRequest
from servidor.contracts.preview import PreviewEnvelope
from servidor.contracts.primitives import OrigemValor
from servidor.diagnostics.analysis import (
    RepetitionInput,
    analyze_diagnostic_repetitions,
    summarize_repetition,
)
from servidor.diagnostics.consequences import (
    LimitationContext,
    derive_consequences,
    derive_limitations,
)
from servidor.motor_adapter import executar_previa
from servidor.preparation import preparar_carteira


@dataclass(frozen=True)
class RepetitionTask:
    request: DiagnosticRequest
    repetition_index: int
    build_sha: str


@dataclass(frozen=True)
class RepetitionResult:
    request: PreviaRequest
    envelope: PreviewEnvelope
    duration_ms: int
    participant_seeds: dict[str, str]
    input_fingerprint: str
    selected: bool


def _origin(
    source_kind: Literal["PADRAO_SINTETICO", "ESTIMATIVA_USUARIO"],
    source: str,
    recorded_at: datetime,
) -> OrigemValor:
    return OrigemValor(
        tipo=source_kind,
        fonte=source,
        registrado_em_utc=recorded_at,
    )


def _source_origin(effective: EffectiveInput, path: str) -> OrigemValor:
    source = effective.sources[path]
    return _origin(source.kind, source.source, source.recorded_at)


def _generated_preview_request(
    request: DiagnosticRequest,
    sampling: GeneratedInputPlan,
    repetition_index: int,
    build_sha: str,
) -> tuple[PreviaRequest, dict[str, str]]:
    repetition = sampling.repetitions[repetition_index]
    document = sampling.preparation_input.model_dump(mode="json")
    participants = document["participants"]
    if not isinstance(participants, list):
        raise TypeError("participants serializado em formato inválido")
    for participant in participants:
        if not isinstance(participant, dict):
            raise TypeError("participant serializado em formato inválido")
        participant["seed"] = repetition.participant_seeds[str(participant["id"])]
    effective = EffectiveInput.model_validate(document)
    preparation = preparar_carteira(
        PreparationRequest(
            preparation_version="1.0.0",
            request_id=repetition.repetition_id,
            study_id=request.study_id,
            scenario_id=request.scenario_id,
            scenario_revision=request.scenario_revision,
            expected_build_sha=build_sha,
            input=effective,
        ),
        build_sha=build_sha,
    )
    horizon_days = effective.warmup_days + effective.measurement_days
    scenario = CenarioEntrada(
        ordens=preparation.orders,
        janela_dias=effective.window_days,
        horizonte_dias=horizon_days,
        custo=effective.costs,
    )
    provenance: dict[str, OrigemValor] = {
        "/janela_dias": _source_origin(effective, "/window_days"),
        "/horizonte_dias": _source_origin(effective, "/measurement_days"),
    }
    cost_fields = (
        "iof_out",
        "iof_in",
        "carry_cnr",
        "spread_rail_bps",
        "custo_fixo_remessa",
        "custo_oportunidade_aa",
        "ptax",
    )
    for field in cost_fields:
        provenance[f"/custo/{field}"] = _source_origin(effective, f"/costs/{field}")
    for index, rule in enumerate(effective.costs.iof_por_finalidade):
        purpose = rule.finalidade.replace("~", "~0").replace("/", "~1")
        source = _source_origin(
            effective, f"/costs/iof_por_finalidade/{purpose}/{rule.direcao}"
        )
        provenance[f"/custo/iof_por_finalidade/{index}/finalidade"] = source
        provenance[f"/custo/iof_por_finalidade/{index}/aliquota"] = source
    participant_origins = {
        str(participant.id): _source_origin(
            effective, f"/participants/{participant.id}/seed"
        )
        for participant in effective.participants
    }
    for index, order in enumerate(preparation.orders):
        source = participant_origins[order.cliente_id]
        for field in (
            "valor_brl",
            "dia_conhecida",
            "dia_limite",
            "eh_efx",
            "finalidade",
        ):
            provenance[f"/ordens/{index}/{field}"] = source
    return (
        PreviaRequest(
            api_version="1.0.0",
            request_id=request.request_id,
            study_id=request.study_id,
            scenario_id=request.scenario_id,
            scenario_revision=request.scenario_revision,
            cenario=scenario,
            periodo=PeriodoNatural(
                modo="NATURAL",
                dias_aquecimento=effective.warmup_days,
                periodo_medicao_dias=effective.measurement_days,
            ),
            proveniencia=provenance,
        ),
        dict(repetition.participant_seeds),
    )


def execute_repetition(task: RepetitionTask) -> RepetitionResult:
    """Worker top-level, puro para o coordenador e compatível com spawn do Windows."""
    sampling = task.request.sampling
    if isinstance(sampling, FixedInputPlan):
        preview_request = sampling.preview_request
        participant_seeds: dict[str, str] = {}
        repetition_id = task.request.selected_repetition_id
    else:
        preview_request, participant_seeds = _generated_preview_request(
            task.request, sampling, task.repetition_index, task.build_sha
        )
        repetition_id = sampling.repetitions[task.repetition_index].repetition_id
    started = perf_counter_ns()
    envelope = executar_previa(
        preview_request,
        build_sha=task.build_sha,
        relogio=lambda: datetime.now(UTC),
    )
    duration_ms = max(0, (perf_counter_ns() - started) // 1_000_000)
    envelope = envelope.model_copy(
        update={
            "execution_id": repetition_id,
            "statistics": envelope.statistics.model_copy(
                update={"repetition_id": repetition_id}
            ),
        }
    )
    return RepetitionResult(
        request=preview_request,
        envelope=envelope,
        duration_ms=duration_ms,
        participant_seeds=participant_seeds,
        input_fingerprint=task.request.input_fingerprint,
        selected=repetition_id == task.request.selected_repetition_id,
    )


def _summary(result: RepetitionResult, *, generated_input: bool) -> RepetitionSummary:
    fixed = summarize_repetition(result.request, result.envelope, result.duration_ms)
    if not generated_input:
        return fixed
    return fixed.model_copy(
        update={
            "participant_seeds": result.participant_seeds,
            "input_fingerprint": result.input_fingerprint,
        }
    )


def aggregate_diagnostic(
    job_id: UUID,
    request: DiagnosticRequest,
    results: tuple[RepetitionResult, ...],
) -> DiagnosticEnvelope:
    """Monta o único envelope publicado depois de todas as repetições."""
    repetitions = tuple(
        RepetitionInput(
            request=result.request,
            envelope=result.envelope,
            duration_ms=result.duration_ms,
            participant_seeds=result.participant_seeds,
            input_fingerprint=result.input_fingerprint,
            selected=result.selected,
        )
        for result in results
    )
    axes = analyze_diagnostic_repetitions(repetitions)
    selected = next(result for result in results if result.selected)
    sampling = request.sampling
    statistics = (
        SingleExecutionStatistics(
            kind="SINGLE_EXECUTION",
            count=1,
            selected_repetition_id=request.selected_repetition_id,
            percentile_method=None,
        )
        if isinstance(sampling, FixedInputPlan)
        else DistributionStatistics(
            kind="DISTRIBUTION",
            count=sampling.count,
            selected_repetition_id=request.selected_repetition_id,
            percentile_method="EMPIRICAL_NEAREST_RANK",
        )
    )
    limitations = derive_limitations(
        LimitationContext(
            axes=axes,
            sampling_kind=sampling.kind,
            generator_recipe_available=isinstance(sampling, GeneratedInputPlan),
            field_coverage_complete=True,
            horizon_truncated=False,
            failed_repetition_count=0,
            costs_have_observed_provenance=bool(request.provenance)
            and all(
                origin.tipo == "DADO_OBSERVADO"
                for origin in request.provenance.values()
            ),
        )
    )
    return DiagnosticEnvelope(
        api_version="1.0.0",
        schema_version="1.0.0",
        job_id=job_id,
        request_fingerprint=request.input_fingerprint,
        statistics=statistics,
        axes=axes,
        repetitions=[
            _summary(result, generated_input=isinstance(sampling, GeneratedInputPlan))
            for result in results
        ],
        selected_execution=selected.envelope,
        consequences=list(derive_consequences(axes)),
        limitations=list(limitations),
        provenance=DiagnosticProvenance(
            request_paths=request.provenance,
            evidence_refs=sorted(request.provenance),
        ),
    )
