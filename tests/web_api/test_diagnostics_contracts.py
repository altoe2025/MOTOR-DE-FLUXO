from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from servidor.app import create_schema_app
from servidor.contracts.diagnostics import (
    DiagnosticEnvelope,
    DiagnosticRequest,
    EvidenceMetric,
    JobSnapshot,
    ParticipantShare,
)

FIXTURES = Path(__file__).parents[2] / "contracts" / "fixtures"
UUIDS = [f"00000000-0000-4000-8000-{index:012d}" for index in range(1, 180)]
FINGERPRINT = "a" * 64
SOURCE = {
    "kind": "PADRAO_SINTETICO",
    "source": "Contrato diagnóstico MOT-70",
    "recorded_at": "2026-09-20T12:00:00Z",
}


def fixed_request() -> dict[str, object]:
    preview_request = json.loads((FIXTURES / "reference-request.json").read_text())
    return {
        "api_version": "1.0.0",
        "request_id": UUIDS[0],
        "idempotency_key": UUIDS[1],
        "study_id": preview_request["study_id"],
        "scenario_id": preview_request["scenario_id"],
        "scenario_revision": preview_request["scenario_revision"],
        "input_fingerprint": FINGERPRINT,
        "sampling": {
            "kind": "FIXED_INPUT",
            "count": 1,
            "preview_request": preview_request,
        },
        "selected_repetition_id": UUIDS[4],
        "provenance": {},
    }


def effective_input() -> dict[str, object]:
    participant_id = UUIDS[20]
    required = [
        "/warmup_days",
        "/measurement_days",
        "/window_days",
        "/costs/iof_out",
        "/costs/iof_in",
        "/costs/carry_cnr",
        "/costs/spread_rail_bps",
        "/costs/custo_fixo_remessa",
        "/costs/custo_oportunidade_aa",
        "/costs/ptax",
        f"/participants/{participant_id}/profile",
        f"/participants/{participant_id}/seed",
        f"/participants/{participant_id}/monthly_volume_brl",
        f"/participants/{participant_id}/ticket_median_brl",
        f"/participants/{participant_id}/out_fraction",
        f"/participants/{participant_id}/deadline/mode",
        f"/participants/{participant_id}/eh_efx",
        f"/participants/{participant_id}/purpose_out",
        f"/participants/{participant_id}/purpose_in",
    ]
    return {
        "participants": [
            {
                "id": participant_id,
                "profile": "tesouraria_corporativa",
                "seed": "1",
                "monthly_volume_brl": "1000000",
                "ticket_median_brl": "100000",
                "out_fraction": "0.5",
                "deadline": {"mode": "PROFILE"},
                "eh_efx": False,
                "purpose_out": "DISPONIBILIDADE",
                "purpose_in": "EXPORTACAO",
            }
        ],
        "warmup_days": 0,
        "measurement_days": 30,
        "window_days": 7,
        "costs": {
            "iof_out": "0.035",
            "iof_in": "0.0038",
            "carry_cnr": "0.0004",
            "spread_rail_bps": "0",
            "custo_fixo_remessa": "0",
            "custo_oportunidade_aa": "0",
            "ptax": "5.40",
            "iof_por_finalidade": [],
        },
        "sources": {path: SOURCE for path in required},
    }


def generated_request(count: int = 10) -> dict[str, object]:
    participant_id = UUIDS[20]
    repetitions = [
        {
            "repetition_id": UUIDS[30 + index],
            "participant_seeds": {participant_id: str(index + 100)},
        }
        for index in range(count)
    ]
    payload = fixed_request()
    payload["sampling"] = {
        "kind": "GENERATED_INPUT",
        "count": count,
        "preparation_input": effective_input(),
        "repetitions": repetitions,
    }
    payload["selected_repetition_id"] = (
        repetitions[0]["repetition_id"] if repetitions else UUIDS[29]
    )
    return payload


def job_snapshot() -> dict[str, object]:
    return {
        "api_version": "1.0.0",
        "job_id": UUIDS[10],
        "request_id": UUIDS[0],
        "status": "RUNNING",
        "progress": {
            "completed": 3,
            "failed": 0,
            "total": 10,
            "current_repetition_id": UUIDS[33],
            "phase": "EXECUTING",
            "created_at": "2026-09-20T12:00:00Z",
            "started_at": "2026-09-20T12:00:01Z",
            "updated_at": "2026-09-20T12:00:02Z",
            "finished_at": None,
        },
        "retry_of_job_id": None,
        "error": None,
    }


def test_request_is_strict_and_fixed_input_has_exactly_one_execution():
    assert DiagnosticRequest.model_validate(fixed_request()).sampling.count == 1

    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate({**fixed_request(), "raw_filename": "x.csv"})

    invalid = fixed_request()
    invalid["sampling"]["count"] = 2  # type: ignore[index]
    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate(invalid)


@pytest.mark.parametrize("count", [0, 1, 9, 11, 29, 31, 99, 101])
def test_generated_input_accepts_only_10_30_or_100_repetitions(count: int):
    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate(generated_request(count))


def test_generated_input_preserves_full_unique_seed_plan_and_selection():
    request = DiagnosticRequest.model_validate(generated_request())
    assert request.sampling.kind == "GENERATED_INPUT"
    assert len(request.sampling.repetitions) == 10

    duplicate = generated_request()
    duplicate["sampling"]["repetitions"][1]["participant_seeds"][UUIDS[20]] = "100"  # type: ignore[index]
    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate(duplicate)

    missing_seed = generated_request()
    missing_seed["sampling"]["repetitions"][0]["participant_seeds"] = {}  # type: ignore[index]
    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate(missing_seed)

    absent_selection = generated_request()
    absent_selection["selected_repetition_id"] = UUIDS[19]
    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate(absent_selection)

    missing_selection = generated_request()
    missing_selection.pop("selected_repetition_id")
    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate(missing_selection)


def test_request_rejects_malformed_fingerprint_and_numeric_decimal():
    malformed = fixed_request()
    malformed["input_fingerprint"] = "not-a-sha256"
    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate(malformed)

    numeric = generated_request()
    numeric["sampling"]["preparation_input"]["costs"]["ptax"] = 5.4  # type: ignore[index]
    with pytest.raises(ValidationError):
        DiagnosticRequest.model_validate(numeric)


def test_evidence_metric_discriminates_available_from_absent_states():
    available = {
        "state": "AVAILABLE",
        "value": "12.5",
        "evidence": ["repetitions/0/savings_brl"],
    }
    adapter = TypeAdapter(EvidenceMetric)
    assert adapter.validate_python(available).value == "12.5"

    with pytest.raises(ValidationError):
        adapter.validate_python({**available, "state": "NOT_COLLECTED"})
    with pytest.raises(ValidationError):
        adapter.validate_python(
            {"state": "AVAILABLE", "reason": "missing", "evidence": []}
        )


def test_participant_share_uses_strict_public_client_identifier():
    share = ParticipantShare.model_validate(
        {"participant_id": "astropay", "volume_brl": "100", "share": "1"}
    )
    assert share.participant_id == "astropay"

    for invalid_id in (" astropay", "astropay ", "x" * 129):
        with pytest.raises(ValidationError):
            ParticipantShare.model_validate(
                {"participant_id": invalid_id, "volume_brl": "100", "share": "1"}
            )
    with pytest.raises(ValidationError):
        ParticipantShare.model_validate(
            {
                "participant_id": "astropay",
                "volume_brl": "100",
                "share": "1",
                "extra": "forbidden",
            }
        )


def test_job_progress_rejects_impossible_counts_and_non_monotonic_timestamps():
    assert JobSnapshot.model_validate(job_snapshot()).progress.completed == 3

    impossible = job_snapshot()
    impossible["progress"]["completed"] = 11  # type: ignore[index]
    with pytest.raises(ValidationError):
        JobSnapshot.model_validate(impossible)

    backwards = job_snapshot()
    backwards["progress"]["updated_at"] = "2026-09-20T11:59:59Z"  # type: ignore[index]
    with pytest.raises(ValidationError):
        JobSnapshot.model_validate(backwards)

    impossible_terminal = job_snapshot()
    impossible_terminal["status"] = "SUCCEEDED"
    with pytest.raises(ValidationError):
        JobSnapshot.model_validate(impossible_terminal)


def test_envelope_keeps_summaries_bounded_and_one_selected_full_execution():
    preview = json.loads((FIXTURES / "reference-result.json").read_text())
    summaries = [
        {
            "repetition_id": UUIDS[index + 20],
            "participant_seeds": {},
            "input_fingerprint": "b" * 64,
            "execution_fingerprint": "c" * 64,
            "baseline_brl": "100",
            "netted_brl": "80",
            "savings_brl": "20",
            "netability_fraction": "0.2",
            "duration_ms": 5,
        }
        for index in range(10)
    ]
    summaries[0]["repetition_id"] = preview["statistics"]["repetition_id"]
    summaries[0]["execution_fingerprint"] = preview["execution_fingerprint"]
    metric = {"state": "AVAILABLE", "value": "0", "evidence": []}
    distribution = {
        "state": "AVAILABLE",
        "value": {
            "minimum": "0",
            "p10": "0",
            "p25": "0",
            "p50": "0",
            "p75": "0",
            "p90": "0",
            "maximum": "0",
            "amplitude": "0",
        },
        "evidence": [],
    }
    payload = {
        "api_version": "1.0.0",
        "schema_version": "1.0.0",
        "job_id": UUIDS[10],
        "request_fingerprint": FINGERPRINT,
        "statistics": {
            "kind": "DISTRIBUTION",
            "count": 10,
            "selected_repetition_id": summaries[0]["repetition_id"],
            "percentile_method": "EMPIRICAL_NEAREST_RANK",
        },
        "axes": {
            "structural_potential": {"gross_out_brl": metric, "gross_in_brl": metric, "imbalance_brl": metric, "ceiling_brl": metric},
            "policy_capture": {"matched_brl": metric, "intra_client_brl": metric, "inter_client_brl": metric, "uncaptured_potential_brl": metric, "captured_fraction": metric},
            "temporal_compatibility": {"deadline_days": metric, "same_day_fraction": metric, "weighted_wait_days": metric, "window_closures": metric, "deadline_closures": metric, "horizon_closures": metric},
            "cross_border_residual": {"remitted_brl": metric, "out_brl": metric, "in_brl": metric, "by_day": [], "by_purpose": []},
            "composition_dependency": {"hhi": metric, "largest_share": metric, "participants": []},
            "economic_robustness": {"baseline_brl": distribution, "netted_brl": distribution, "savings_brl": distribution, "netability_fraction": distribution},
            "operational_profile": {"order_count": metric, "cycle_count": metric, "maximum_open_queue": metric, "due_order_count": metric, "weighted_wait_days": metric, "processing_duration_ms": metric},
        },
        "repetitions": summaries,
        "selected_execution": preview,
        "consequences": [],
        "limitations": [],
        "provenance": {"request_paths": {}, "evidence_refs": []},
    }
    envelope = DiagnosticEnvelope.model_validate(payload)
    assert len(envelope.repetitions) == 10
    assert str(envelope.selected_execution.execution_id) == preview["execution_id"]

    wrong_selection = copy.deepcopy(payload)
    wrong_selection["statistics"]["selected_repetition_id"] = summaries[1][
        "repetition_id"
    ]
    with pytest.raises(ValidationError):
        DiagnosticEnvelope.model_validate(wrong_selection)

    fixed_with_fake_distribution = copy.deepcopy(payload)
    fixed_with_fake_distribution["statistics"] = {
        "kind": "SINGLE_EXECUTION",
        "count": 1,
        "selected_repetition_id": summaries[0]["repetition_id"],
        "percentile_method": None,
    }
    fixed_with_fake_distribution["repetitions"] = summaries[:1]
    with pytest.raises(ValidationError):
        DiagnosticEnvelope.model_validate(fixed_with_fake_distribution)

    unavailable = {
        "state": "INSUFFICIENT_COVERAGE",
        "reason": "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION",
        "evidence": [],
    }
    fixed = copy.deepcopy(fixed_with_fake_distribution)
    fixed["axes"]["economic_robustness"] = {
        "baseline_brl": unavailable,
        "netted_brl": unavailable,
        "savings_brl": unavailable,
        "netability_fraction": unavailable,
    }
    assert DiagnosticEnvelope.model_validate(fixed).statistics.count == 1

    too_many = copy.deepcopy(payload)
    too_many["statistics"]["count"] = 100
    too_many["repetitions"] = summaries * 11
    with pytest.raises(ValidationError):
        DiagnosticEnvelope.model_validate(too_many)

    with pytest.raises(ValidationError):
        DiagnosticEnvelope.model_validate({**payload, "file_payload": "secret"})

    invalid_summary_seed = copy.deepcopy(payload)
    invalid_summary_seed["repetitions"][0]["participant_seeds"] = {
        "not-a-uuid": "1"
    }
    with pytest.raises(ValidationError):
        DiagnosticEnvelope.model_validate(invalid_summary_seed)


def test_schema_app_publishes_five_diagnostic_operations_with_real_models():
    schema = create_schema_app().openapi()
    operations = {
        ("/api/v1/diagnosticos", "post"): ("DiagnosticRequest", "JobSnapshot"),
        ("/api/v1/diagnosticos/{job_id}", "get"): (None, "JobSnapshot"),
        ("/api/v1/diagnosticos/{job_id}/resultado", "get"): (None, "DiagnosticEnvelope"),
        ("/api/v1/diagnosticos/{job_id}/cancelamentos", "post"): (None, "JobSnapshot"),
        ("/api/v1/diagnosticos/{job_id}/retries", "post"): ("DiagnosticRetryRequest", "JobSnapshot"),
    }
    for (path, method), (request_model, response_model) in operations.items():
        operation = schema["paths"][path][method]
        response = operation["responses"]["200" if method == "get" else "202"]
        assert response["content"]["application/json"]["schema"]["$ref"].endswith(
            f"/{response_model}"
        )
        if request_model is not None:
            request = operation["requestBody"]["content"]["application/json"]["schema"]
            assert request["$ref"].endswith(f"/{request_model}")
