from __future__ import annotations

from copy import deepcopy

import pytest

from servidor.contracts.input import PreviaRequest
from servidor.contracts.preview import PreviewEnvelope
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

UUIDS = [f"00000000-0000-4000-8000-{index:012d}" for index in range(1, 40)]
SHA256 = "a" * 64
SHA1 = "b" * 40
SOURCE = {
    "tipo": "DADO_OBSERVADO",
    "fonte": "fixture manual MOT-71",
    "registrado_em_utc": "2026-09-20T12:00:00Z",
}


def _costs() -> dict[str, object]:
    return {
        "iof_out": "0",
        "iof_in": "0",
        "carry_cnr": "0",
        "spread_rail_bps": "0",
        "custo_fixo_remessa": "0",
        "custo_oportunidade_aa": "0",
        "ptax": "1",
        "iof_por_finalidade": [],
    }


def _request(
    orders: list[dict[str, object]], *, window: int, horizon: int
) -> PreviaRequest:
    provenance = {
        path: SOURCE
        for path in (
            "/janela_dias",
            "/horizonte_dias",
            "/custo/iof_out",
            "/custo/iof_in",
            "/custo/carry_cnr",
            "/custo/spread_rail_bps",
            "/custo/custo_fixo_remessa",
            "/custo/custo_oportunidade_aa",
            "/custo/ptax",
        )
    }
    for index in range(len(orders)):
        for field in (
            "valor_brl",
            "dia_conhecida",
            "dia_limite",
            "eh_efx",
            "finalidade",
        ):
            provenance[f"/ordens/{index}/{field}"] = SOURCE
    return PreviaRequest.model_validate(
        {
            "api_version": "1.0.0",
            "request_id": UUIDS[0],
            "study_id": UUIDS[1],
            "scenario_id": UUIDS[2],
            "scenario_revision": 1,
            "cenario": {
                "ordens": orders,
                "janela_dias": window,
                "horizonte_dias": horizon,
                "custo": _costs(),
            },
            "periodo": {"modo": "LEGADO"},
            "proveniencia": provenance,
        }
    )


def _cost(value: str) -> dict[str, str]:
    return {
        "iof": "0",
        "carry": "0",
        "spread": "0",
        "espera": "0",
        "fixo": value,
        "total": value,
    }


def _preview(
    request: PreviaRequest,
    cycles: list[dict[str, object]],
    *,
    gross: str,
    matched: str,
    intra: str,
    inter: str,
    remitted: str,
    baseline: str = "100",
    netted: str = "80",
    repetition_index: int = 10,
) -> PreviewEnvelope:
    savings = str(int(baseline) - int(netted))
    rate = "0" if gross == "0" else str(int(matched) / int(gross))
    legacy_cycles = deepcopy(cycles)
    payload = {
        "api_version": "1.0.0",
        "presentation_version": "1.0.0",
        "execution_id": UUIDS[repetition_index],
        "request_id": str(request.request_id),
        "study_id": str(request.study_id),
        "scenario_id": str(request.scenario_id),
        "scenario_revision": request.scenario_revision,
        "execution_fingerprint": f"{repetition_index % 16:x}" * 64,
        "provenance_fingerprint": SHA256,
        "motor_build_sha": SHA1,
        "kind": "PREVIA",
        "statistics": {
            "kind": "SINGLE_EXECUTION",
            "count": 1,
            "seed": None,
            "repetition_id": UUIDS[repetition_index],
            "percentile_method": None,
        },
        "input_snapshot": {
            "cenario": request.cenario.model_dump(mode="json"),
            "periodo": request.periodo.model_dump(mode="json"),
            "proveniencia": request.proveniencia,
        },
        "result": {
            "manifesto": {
                "run_id": "fixture",
                "schema_version": "2.0.0",
                "versao_motor": "fixture",
                "criado_em_utc": "2026-09-20T12:00:00Z",
                "hash_configuracao": "fixture",
                "run_ids_origem": [],
                "parametros_custo": _costs(),
                "mixes": [],
                "arquetipos": [],
                "horizonte_dias": request.cenario.horizonte_dias,
                "periodo_medicao_dias": request.cenario.horizonte_dias + 1,
                "janela_dias": request.cenario.janela_dias,
                "seeds": [],
                "modo_analise": "AGREGADO",
                "custo_calibrado": False,
                "metodo_percentil": "NAO_APLICAVEL",
                "drenagem": "LEGADO",
                "avisos": [],
            },
            "agregado": {
                "execucao_completa": {
                    "ciclos": legacy_cycles,
                    "baseline": _cost(baseline),
                    "netado": _cost(netted),
                    "economia": savings,
                    "volume_casado_brl": matched,
                    "volume_autonetting_brl": intra,
                    "volume_netting_multilateral_brl": inter,
                    "taxa_netabilidade": rate,
                    "taxa_autonetting": "0",
                    "taxa_netting_multilateral": rate,
                },
                "ids_ordens_medidas": [order.id for order in request.cenario.ordens],
                "volume_bruto_periodo_brl": gross,
                "volume_casado_periodo_brl": matched,
                "volume_autonetting_periodo_brl": intra,
                "volume_netting_multilateral_periodo_brl": inter,
                "volume_remetido_periodo_brl": remitted,
                "baseline_periodo": _cost(baseline),
                "netado_periodo": _cost(netted),
                "economia_periodo_brl": savings,
                "taxa_netabilidade_periodo": rate,
                "taxa_autonetting_periodo": "0",
                "taxa_netting_multilateral_periodo": rate,
                "mecanismos": [
                    {
                        "destino": "INTRA_CLIENTE",
                        "volume_brl": intra,
                        "baseline_atribuido_brl": "0",
                        "custo_netado_brl": "0",
                        "economia_brl": "0",
                    },
                    {
                        "destino": "INTER_CLIENTE",
                        "volume_brl": inter,
                        "baseline_atribuido_brl": "0",
                        "custo_netado_brl": "0",
                        "economia_brl": "0",
                    },
                    {
                        "destino": "REMETIDO",
                        "volume_brl": remitted,
                        "baseline_atribuido_brl": baseline,
                        "custo_netado_brl": netted,
                        "economia_brl": savings,
                    },
                ],
            },
            "clientes": [],
            "ledger_eventos": [],
            "contribuicoes_marginais": [],
            "diagnosticos_experimentais": {},
            "avisos": [],
        },
        "presentation": {
            "currency": "BRL",
            "locale": "pt-BR",
            "rounding": "HALF_UP",
            "money_digits": 2,
            "fraction_percent_digits": 2,
        },
    }
    return PreviewEnvelope.model_validate(payload)


def _order(
    order_id: str,
    client: str,
    direction: str,
    value: str,
    known: int,
    due: int,
    purpose: str,
) -> dict[str, object]:
    return {
        "id": order_id,
        "cliente_id": client,
        "direcao": direction,
        "valor_brl": value,
        "dia_conhecida": known,
        "dia_limite": due,
        "eh_efx": False,
        "finalidade": purpose,
    }


def _fixtures() -> tuple[RepetitionInput, RepetitionInput, RepetitionInput]:
    only_out_request = _request(
        [_order("o1", "astropay", "OUT", "100", 0, 2, "SERVICOS")], window=3, horizon=2
    )
    only_out = _preview(
        only_out_request,
        [
            {
                "dia": 2,
                "alocacoes": [
                    {
                        "ordem_id": "o1",
                        "dia": 2,
                        "valor_brl": "100",
                        "tipo": "REMETIDO",
                        "origem_casamento": None,
                    }
                ],
                "bruto_out": "100",
                "bruto_in": "0",
                "casado": "0",
                "residuo": "100",
                "direcao_residuo": "OUT",
            }
        ],
        gross="100",
        matched="0",
        intra="0",
        inter="0",
        remitted="100",
    )

    uncaptured_request = _request(
        [
            _order("o1", "a", "OUT", "100", 0, 0, "SERVICOS"),
            _order("i1", "b", "IN", "70", 2, 2, "EXPORTACAO"),
        ],
        window=10,
        horizon=2,
    )
    uncaptured = _preview(
        uncaptured_request,
        [
            {
                "dia": 0,
                "alocacoes": [
                    {
                        "ordem_id": "o1",
                        "dia": 0,
                        "valor_brl": "100",
                        "tipo": "REMETIDO",
                        "origem_casamento": None,
                    }
                ],
                "bruto_out": "100",
                "bruto_in": "0",
                "casado": "0",
                "residuo": "100",
                "direcao_residuo": "OUT",
            },
            {
                "dia": 2,
                "alocacoes": [
                    {
                        "ordem_id": "i1",
                        "dia": 2,
                        "valor_brl": "70",
                        "tipo": "REMETIDO",
                        "origem_casamento": None,
                    }
                ],
                "bruto_out": "0",
                "bruto_in": "70",
                "casado": "0",
                "residuo": "70",
                "direcao_residuo": "IN",
            },
        ],
        gross="170",
        matched="0",
        intra="0",
        inter="0",
        remitted="170",
        repetition_index=11,
    )

    mixed_request = _request(
        [
            _order("o1", "astropay", "OUT", "100", 0, 0, "SERVICOS"),
            _order("i1", "nomad", "IN", "60", 0, 0, "EXPORTACAO"),
        ],
        window=1,
        horizon=0,
    )
    mixed = _preview(
        mixed_request,
        [
            {
                "dia": 0,
                "alocacoes": [
                    {
                        "ordem_id": "o1",
                        "dia": 0,
                        "valor_brl": "60",
                        "tipo": "CASADO",
                        "origem_casamento": "INTER_CLIENTE",
                    },
                    {
                        "ordem_id": "i1",
                        "dia": 0,
                        "valor_brl": "60",
                        "tipo": "CASADO",
                        "origem_casamento": "INTER_CLIENTE",
                    },
                    {
                        "ordem_id": "o1",
                        "dia": 0,
                        "valor_brl": "40",
                        "tipo": "REMETIDO",
                        "origem_casamento": None,
                    },
                ],
                "bruto_out": "100",
                "bruto_in": "60",
                "casado": "60",
                "residuo": "40",
                "direcao_residuo": "OUT",
            }
        ],
        gross="160",
        matched="120",
        intra="0",
        inter="120",
        remitted="40",
        repetition_index=12,
    )
    return tuple(
        RepetitionInput(
            request=request, envelope=envelope, duration_ms=duration, selected=True
        )
        for request, envelope, duration in (
            (only_out_request, only_out, 7),
            (uncaptured_request, uncaptured, 8),
            (mixed_request, mixed, 9),
        )
    )  # type: ignore[return-value]


def test_axes_1_to_4_are_derived_from_canonical_request_and_allocations():
    only_out, uncaptured, mixed = _fixtures()
    absent = analyze_diagnostic_repetitions((only_out,))
    assert absent.structural_potential.ceiling_brl.value == "0"
    assert absent.policy_capture.captured_fraction.state == "INCOMPATIBLE"

    axes = analyze_diagnostic_repetitions((uncaptured,))
    assert axes.structural_potential.gross_out_brl.value == "100"
    assert axes.structural_potential.gross_in_brl.value == "70"
    assert axes.structural_potential.ceiling_brl.value == "140"
    assert axes.policy_capture.matched_brl.value == "0"
    assert axes.policy_capture.uncaptured_potential_brl.value == "140"

    axes = analyze_diagnostic_repetitions((mixed,))
    assert axes.policy_capture.matched_brl.value == "120"
    assert axes.cross_border_residual.remitted_brl.value == "40"
    assert [
        (item.key, item.direction, item.value_brl)
        for item in axes.cross_border_residual.by_purpose
    ] == [("SERVICOS", "OUT", "40")]


def test_axes_5_to_7_cover_concentration_timing_queue_and_duration():
    _, _, mixed = _fixtures()
    axes = analyze_diagnostic_repetitions((mixed,))
    assert axes.composition_dependency.hhi.value == "0.53125"
    assert axes.composition_dependency.largest_share.value == "0.625"
    assert [
        item.participant_id for item in axes.composition_dependency.participants
    ] == ["astropay", "nomad"]
    assert axes.temporal_compatibility.same_day_fraction.value == "1"
    assert axes.temporal_compatibility.weighted_wait_days.value == "0"
    assert axes.operational_profile.order_count.value == "2"
    assert axes.operational_profile.cycle_count.value == "1"
    assert axes.operational_profile.maximum_open_queue.value == "2"
    assert axes.operational_profile.due_order_count.value == "2"
    assert axes.operational_profile.processing_duration_ms.value == "9"


def test_deadline_uses_volume_weighted_nearest_rank_and_wait_uses_each_allocation():
    request = _request(
        [
            _order("small", "a", "OUT", "10", 0, 1, "SERVICOS"),
            _order("large", "b", "OUT", "90", 0, 9, "SERVICOS"),
        ],
        window=10,
        horizon=9,
    )
    envelope = _preview(
        request,
        [
            {
                "dia": 1,
                "alocacoes": [
                    {
                        "ordem_id": "small",
                        "dia": 1,
                        "valor_brl": "10",
                        "tipo": "REMETIDO",
                        "origem_casamento": None,
                    }
                ],
                "bruto_out": "100",
                "bruto_in": "0",
                "casado": "0",
                "residuo": "10",
                "direcao_residuo": "OUT",
            },
            {
                "dia": 9,
                "alocacoes": [
                    {
                        "ordem_id": "large",
                        "dia": 9,
                        "valor_brl": "90",
                        "tipo": "REMETIDO",
                        "origem_casamento": None,
                    }
                ],
                "bruto_out": "90",
                "bruto_in": "0",
                "casado": "0",
                "residuo": "90",
                "direcao_residuo": "OUT",
            },
        ],
        gross="100",
        matched="0",
        intra="0",
        inter="0",
        remitted="100",
        repetition_index=13,
    )
    axes = analyze_diagnostic_repetitions(
        (RepetitionInput(request=request, envelope=envelope, duration_ms=3),)
    )
    assert axes.temporal_compatibility.deadline_days.value == "9"
    assert axes.temporal_compatibility.weighted_wait_days.value == "8.2"


def test_fixed_input_keeps_summary_but_never_fabricates_distribution():
    only_out, _, _ = _fixtures()
    summary = summarize_repetition(only_out.request, only_out.envelope, 7)
    assert summary.repetition_id == only_out.envelope.statistics.repetition_id
    assert summary.participant_seeds == {}
    assert summary.baseline_brl == "100"
    robustness = analyze_diagnostic_repetitions((only_out,)).economic_robustness
    assert robustness.baseline_brl.state == "INSUFFICIENT_COVERAGE"
    assert robustness.baseline_brl.reason == "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION"

    divergent_request = only_out.request.model_copy(
        update={
            "cenario": only_out.request.cenario.model_copy(update={"janela_dias": 2})
        }
    )
    with pytest.raises(ValueError, match="snapshot de entrada"):
        summarize_repetition(divergent_request, only_out.envelope, 7)


def test_ten_repetitions_use_empirical_distribution_not_selected_execution():
    _, _, mixed = _fixtures()
    repetitions = []
    for index in range(10):
        baseline = str(101 + index)
        netted = str(100)
        envelope = _preview(
            mixed.request,
            [
                cycle.model_dump(mode="json")
                for cycle in mixed.envelope.result.agregado.execucao_completa.ciclos
            ],
            gross="160",
            matched="120",
            intra="0",
            inter="120",
            remitted="40",
            baseline=baseline,
            netted=netted,
            repetition_index=20 + index,
        )
        repetitions.append(
            RepetitionInput(
                request=mixed.request,
                envelope=envelope,
                duration_ms=index + 1,
                selected=index == 9,
            )
        )
    axes = analyze_diagnostic_repetitions(tuple(repetitions))
    savings = axes.economic_robustness.savings_brl
    assert savings.state == "AVAILABLE"
    assert savings.value.model_dump() == {
        "minimum": "1",
        "p10": "1",
        "p25": "3",
        "p50": "5",
        "p75": "8",
        "p90": "9",
        "maximum": "10",
        "amplitude": "9",
    }
    assert axes.operational_profile.processing_duration_ms.value == "10"


def test_consequences_are_versioned_sorted_and_all_references_resolve():
    _, uncaptured, _ = _fixtures()
    axes = analyze_diagnostic_repetitions((uncaptured,))
    consequences = derive_consequences(axes)
    assert [(item.axis, item.rule_id) for item in consequences] == sorted(
        (item.axis, item.rule_id) for item in consequences
    )
    assert {item.statement_code for item in consequences} == {
        "POTENTIAL_NAO_CAPTURADO",
        "RESIDUO_TRANSFRONTEIRICO",
    }
    validate_evidence_references(axes, consequences)

    invalid = consequences[0].model_copy(
        update={"evidence_refs": ["/axes/unknown/value"]}
    )
    with pytest.raises(ValueError, match="referência de evidência inexistente"):
        validate_evidence_references(axes, (invalid,))


def test_limitations_report_conditions_without_changing_metrics():
    only_out, _, _ = _fixtures()
    axes = analyze_diagnostic_repetitions((only_out,))
    context = LimitationContext(
        axes=axes,
        sampling_kind="FIXED_INPUT",
        generator_recipe_available=False,
        field_coverage_complete=False,
        horizon_truncated=True,
        failed_repetition_count=1,
        costs_have_observed_provenance=False,
    )
    limitations = derive_limitations(context)
    assert [item.code for item in limitations] == sorted(
        item.code for item in limitations
    )
    assert {item.code for item in limitations} == {
        "COSTS_NOT_OBSERVED",
        "FAILED_REPETITIONS",
        "FIELD_COVERAGE_INSUFFICIENT",
        "FIXED_INPUT_NO_DISTRIBUTION",
        "GENERATOR_RECIPE_ABSENT",
        "HORIZON_TRUNCATED",
    }
    validate_evidence_references(axes, limitations)
    assert axes.economic_robustness.baseline_brl.state == "INSUFFICIENT_COVERAGE"


def test_analysis_is_deterministic_bounded_and_does_not_import_motor_privates():
    _, _, mixed = _fixtures()
    first = analyze_diagnostic_repetitions((mixed,))
    second = analyze_diagnostic_repetitions((mixed,))
    assert first == second
    with pytest.raises(ValueError, match="1, 10, 30 ou 100"):
        analyze_diagnostic_repetitions((mixed, mixed))

    import servidor.diagnostics.analysis as module

    motor_dependencies = {
        value.__module__
        for value in vars(module).values()
        if getattr(value, "__module__", "").startswith("motor")
    }
    assert motor_dependencies == {"motor.analise.estatistica"}
