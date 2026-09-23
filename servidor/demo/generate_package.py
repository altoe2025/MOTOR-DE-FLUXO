"""Gera cinco composições sintéticas pelas fronteiras públicas vigentes.

O SHA fixa a base técnica da receita. Alterações no motor exigem revisão explícita
da receita e regeneração; o commit que contém o próprio JSON não muda esse SHA.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal, localcontext
from functools import partial
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid5

from motor.arquetipos import TODOS as ARCHETYPES
from motor.mixes import TODOS as MIXES
from servidor.contracts.diagnostics import DiagnosticEnvelope, DiagnosticRequest
from servidor.contracts.input import (
    CenarioEntrada,
    CustoEntrada,
    PeriodoNatural,
    PreviaRequest,
)
from servidor.contracts.preparation import (
    EffectiveInput,
    EffectiveParticipant,
    PreparationRequest,
    PreparationResponse,
    required_source_paths,
)
from servidor.contracts.replay import ReplayRequestV1
from servidor.diagnostics.service import RepetitionResult, aggregate_diagnostic
from servidor.identity import canon_decimal
from servidor.motor_adapter import executar_previa
from servidor.preparation import preparar_carteira
from servidor.replay import construir_replay

VERSION: Literal["1.0.0"] = "1.0.0"
GENERATED_AT = "2026-09-23T12:00:00Z"
CLOCK = datetime(2026, 9, 23, 12, tzinfo=UTC)
BUILD_SHA = "5cb78f0b6ddd45b8b63f170153e6be8cd1928497"
OWNER = "$OWNER_SUB"
WARNING = "Hipótese sintética demonstrativa — não calibrada com carteira real"
NAMESPACE = UUID("1e204d1f-3a0e-47ba-975a-ea9ec7e8aab1")
MIX_LABELS = (
    ("equilibrado", "equilibrado"),
    ("retail_pesado", "retail pesado"),
    ("corporativo_pesado", "corporativo pesado"),
    ("psp_dominante", "PSP dominante"),
    ("outbound_extremo", "outbound extremo"),
)
COST_DECIMALS = {
    "iof_out": "0.035",
    "iof_in": "0.0038",
    "carry_cnr": "0.0004",
    "spread_rail_bps": "25",
    "custo_fixo_remessa": "0",
    "custo_oportunidade_aa": "0",
    "ptax": "5.40",
}
COSTS = {**COST_DECIMALS, "iof_por_finalidade": []}


def _id(value: str) -> str:
    return str(uuid5(NAMESPACE, value))


def _json(value: object) -> str:
    def normalize(item: object) -> object:
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, dict):
            return {key: normalize(child) for key, child in item.items()}
        if isinstance(item, (list, tuple)):
            return [normalize(child) for child in item]
        return item
    return json.dumps(normalize(value), ensure_ascii=False, sort_keys=True,
        separators=(",", ":"), allow_nan=False)


def _hash(value: object) -> str:
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def _seed(value: str) -> str:
    return str(int.from_bytes(hashlib.sha256(value.encode()).digest()[:8], "big") & (2**63 - 1))


def _fraction(value: float) -> str:
    return format(Decimal(str(value)).quantize(Decimal("0.000000000001")), "f").rstrip("0").rstrip(".")


def _source() -> dict[str, str]:
    return {
        "kind": "PADRAO_SINTETICO",
        "source": "demo-recipe-v1",
        "recorded_at": GENERATED_AT,
    }


def _case_source() -> dict[str, str]:
    return {
        "kind": "SYNTHETIC_DEFAULT",
        "source": "demo-recipe-v1",
        "version": VERSION,
        "recordedAt": GENERATED_AT,
        "rule": "synthetic-example",
    }


def _company_case_profile(index: int) -> tuple[dict, dict, dict]:
    company_id = _id(f"company:{index}")
    case_id = _id(f"case:{index}")
    profile_id = _id(f"profile:{index}")
    origin = _case_source()
    company = {
        "id": company_id, "ownerSub": OWNER,
        "displayName": f"Empresa sintética {index:02d}", "aliases": [],
        "createdAt": GENERATED_AT, "updatedAt": GENERATED_AT, "revision": 1,
    }
    dates = ("2026-08-01", "2026-08-10", "2026-08-20")
    deadlines = ("2026-08-06", "2026-08-15", "2026-08-25")
    orders = [{
        "id": _id(f"case-order:{index}:{position}"),
        "clientId": company_id, "direction": "OUT" if position < 2 else "IN",
        "knownDate": day, "deadlineDate": deadlines[position],
        "valueBrl": "80000", "purposeCode": "ANEXO_V_DISPONIBILIDADE",
        "efxStatus": "NOT_COLLECTED", "provenance": [origin],
    } for position, day in enumerate(dates)]
    case = {
        "schemaVersion": "2.0.0", "id": case_id, "ownerSub": OWNER,
        "companyId": company_id, "status": "CONFIRMED", "revision": 1,
        "window": {"startDate": "2026-08-01", "endDate": "2026-08-30", "closingDate": "2026-08-30"},
        "orders": orders,
        "controlTotals": [
            {"code": "GROSS_OUT_BRL", "valueBrl": "160000", "provenance": origin},
            {"code": "GROSS_IN_BRL", "valueBrl": "80000", "provenance": origin},
        ],
        "sourceManifest": {
            "adapterId": "demo-synthetic", "adapterVersion": VERSION,
            "sourceKind": "SYNTHETIC", "files": [],
        },
        "normalization": {
            "rulesetId": "demo-synthetic", "rulesetVersion": VERSION,
            "normalizedAt": GENERATED_AT,
        },
        "quality": {"blockers": [], "warnings": []}, "corrections": [],
        "observedOutcome": None, "confirmedAt": GENERATED_AT,
    }
    evidence = [f"case:{case_id}@1"]
    def available(value: object) -> dict:
        return {"state": "AVAILABLE", "value": value, "evidence": evidence}
    unavailable = {
        "state": "INSUFFICIENT_COVERAGE",
        "reason": "São necessários ao menos dois meses civis cobertos.",
        "evidence": evidence,
    }
    coverage = {
        "caseCount": 1, "firstDate": "2026-08-01", "lastDate": "2026-08-30",
        "totalWindowDays": 30, "coveredDays": 30, "overlapDays": 0, "gapDays": 0,
        "windows": [{
            "caseId": case_id, "caseRevision": 1, "startDate": "2026-08-01",
            "endDate": "2026-08-30", "durationDays": 30,
        }],
    }
    with localcontext() as context:
        context.prec = 40
        out_fraction = format(Decimal(2) / Decimal(3), "f")
        in_fraction = format(Decimal(1) / Decimal(3), "f")
    selected = [{
        "caseId": case_id, "caseRevision": 1,
        "caseFingerprint": _hash({**case, "orders": sorted(orders, key=lambda order: order["id"])}),
        "window": case["window"],
    }]
    profile = {
        "schemaVersion": VERSION, "id": profile_id, "ownerSub": OWNER,
        "companyId": company_id, "version": 1, "createdAt": GENERATED_AT,
        "method": {
            "id": "operational-profile-v1", "version": VERSION,
            "percentileMethod": "NEAREST_RANK",
        },
        "selectedCases": selected,
        "selectionFingerprint": _hash([{
            "caseId": case_id, "caseRevision": 1,
            "caseFingerprint": selected[0]["caseFingerprint"],
        }]),
        "compatibility": {"compatible": True, "blockers": [], "warnings": []},
        "coverage": coverage,
        "metrics": {
            "volume": {"outBrl": available("160000"), "inBrl": available("80000"), "totalBrl": available("240000")},
            "frequency": {"orderCount": available(3), "ordersPerCoveredDay": available("0.1"), "ordersPer30Days": available("3")},
            "ticketsBrl": {key: available("80000") for key in ("min", "p25", "p50", "p75", "max")},
            "direction": available({
                "out": {"volumeBrl": "160000", "fraction": out_fraction},
                "in": {"volumeBrl": "80000", "fraction": in_fraction},
            }),
            "deadlineDays": {key: available("5") for key in ("p50ByCount", "p90ByCount", "p50ByVolume", "p90ByVolume")},
            "purposes": {
                "byCode": available([{
                    "code": "ANEXO_V_DISPONIBILIDADE", "volumeBrl": "240000",
                    "orderCount": 3, "volumeFraction": "1", "orderFraction": "1",
                }]),
                "knownCoverage": available({"volumeFraction": "1", "orderFraction": "1"}),
                "missing": available({"volumeBrl": "0", "orderCount": 0}),
            },
            "windows": available(coverage),
            "seasonality": {
                "observations": available([{
                    "month": "2026-08", "volumeBrl": "240000", "orderCount": 3,
                    "coveredDays": 30, "averageVolumePerCoveredDay": "8000",
                    "averageOrdersPerCoveredDay": "0.1",
                }]),
                "comparison": unavailable,
            },
        },
        "provenance": {
            "caseEvidence": evidence, "sourceFiles": [],
            "normalizationVersions": ["demo-synthetic@1.0.0"], "fields": [origin],
        },
    }
    profile["documentFingerprint"] = _hash(profile)
    return company, case, profile


def _allocate(mix: dict[str, float]) -> list[str]:
    total = sum(mix.values())
    exact = {name: 12 * weight / total for name, weight in mix.items()}
    counts = {name: int(value) for name, value in exact.items()}
    remainder = 12 - sum(counts.values())
    ranked = sorted(mix, key=lambda name: (-(exact[name] - counts[name]), name))
    for name in ranked[:remainder]:
        counts[name] += 1
    return [name for name in sorted(counts) for _ in range(counts[name])]


def _effective(mix_name: str, profiles: list[dict]) -> EffectiveInput:
    archetypes = _allocate(MIXES[mix_name])
    participants = []
    profile_by_participant = {}
    for index, (archetype_name, profile) in enumerate(zip(archetypes, profiles, strict=True), 1):
        archetype = ARCHETYPES[archetype_name]
        participant_id = _id(f"participant:{index}")
        profile_by_participant[participant_id] = profile
        participants.append({
            "id": participant_id, "profile": archetype_name,
            "seed": _seed(f"demo-v1:{mix_name}:base:{index}"),
            "monthly_volume_brl": "240000", "ticket_median_brl": "80000",
            "out_fraction": _fraction(archetype.p_out),
            "deadline": {"mode": "PROFILE"}, "eh_efx": archetype.eh_efx,
            "purpose_out": archetype.finalidade_out,
            "purpose_in": archetype.finalidade_in,
        })
    bare = {
        "participants": participants, "warmup_days": 30, "measurement_days": 30,
        "window_days": 7, "costs": COSTS, "sources": {},
    }
    # O contrato público fornece a lista exata de origens exigidas.
    temporary = EffectiveInput.model_construct(
        participants=[EffectiveParticipant.model_validate(item) for item in participants],
        warmup_days=30, measurement_days=30, window_days=7,
        costs=CustoEntrada.model_validate(COSTS), sources={},
    )
    sources = {path: _source() for path in required_source_paths(temporary)}
    for participant_id, profile in profile_by_participant.items():
        sources[f"/participants/{participant_id}/profile"] = {
            "kind": "ESTIMATIVA_USUARIO",
            "source": f"profile-mvp:{profile['id']}@{profile['documentFingerprint']}:derived",
            "recorded_at": GENERATED_AT,
        }
    bare["sources"] = sources
    return EffectiveInput.model_validate(bare)


def _preview_request(
    *, effective: EffectiveInput, preparation: PreparationResponse, mix_name: str,
    repetition_index: int, study_id: str, scenario_id: str,
) -> PreviaRequest:
    scenario = CenarioEntrada(
        ordens=preparation.orders, janela_dias=7, horizonte_dias=60, custo=effective.costs,
    )
    paths = ["/janela_dias", "/horizonte_dias"]
    paths.extend(f"/custo/{field}" for field in COSTS if field != "iof_por_finalidade")
    for index in range(len(preparation.orders)):
        paths.extend(f"/ordens/{index}/{field}" for field in (
            "valor_brl", "dia_conhecida", "dia_limite", "eh_efx", "finalidade",
        ))
    origin = {
        "tipo": "PADRAO_SINTETICO", "fonte": "demo-recipe-v1",
        "registrado_em_utc": GENERATED_AT,
    }
    return PreviaRequest.model_validate({
        "api_version": VERSION, "request_id": _id(f"preview-request:{mix_name}:{repetition_index}"),
        "study_id": study_id, "scenario_id": scenario_id, "scenario_revision": 1,
        "cenario": scenario.model_dump(mode="json"),
        "periodo": {"modo": "NATURAL", "dias_aquecimento": 30, "periodo_medicao_dias": 30},
        "proveniencia": {path: origin for path in paths},
    })


def _normalized_source(source: dict) -> dict:
    recipe = source["source"]["recipe"]
    normalized_recipe = {
        **recipe,
        "seeds": sorted(recipe["seeds"], key=lambda value: (len(value), value)),
        "composition": sorted(({
            **item,
            **{key: canon_decimal(item[key]) for key in (
                "total_brl", "out_brl", "in_brl",
            )},
            "out_fraction": None if item["out_fraction"] is None
                else canon_decimal(item["out_fraction"]),
        } for item in recipe["composition"]), key=lambda item: item["participant_id"] or ""),
    }
    orders = sorted(({
        **order, "valor_brl": canon_decimal(order["valor_brl"]),
    } for order in source["orders"]), key=lambda item: item["id"])
    return {
        "source": {"kind": "SYNTHETIC", "recipe": normalized_recipe},
        "orders": orders, "provenance": source["provenance"],
    }


def _fingerprint_source(source: dict) -> str:
    return _hash(_normalized_source(source))


def _scenario_input_fingerprint(scenario: dict) -> str:
    source = scenario["sourceSnapshot"]
    return _hash({
        "portfolio": {
            **_normalized_source(source),
            "sourceFingerprint": source["sourceFingerprint"],
        },
        "premises": {
            "costs": {
                **{key: canon_decimal(value) for key, value in COST_DECIMALS.items()},
                "iof_por_finalidade": [],
            },
            "windowDays": 7,
        },
        "period": scenario["period"],
    })


def _scenario(
    mix_name: str, label: str, effective: EffectiveInput,
    preparation: PreparationResponse,
) -> dict:
    scenario_id = _id(f"scenario:{mix_name}")
    source = {
        "source": {"kind": "SYNTHETIC", "recipe": {
            "exampleId": "perfil-operacional-mvp",
            "seeds": [participant.seed for participant in effective.participants],
            "composition": [item.model_dump(mode="json") for item in preparation.composition],
            "preparationVersion": VERSION,
            "generatorVersion": preparation.generator_version,
            "motorBuildSha": BUILD_SHA,
            "generationFingerprint": preparation.generation_fingerprint,
        }},
        "capturedAt": GENERATED_AT,
        "orders": [item.model_dump(mode="json") for item in preparation.orders],
        "provenance": [_case_source()],
        "observedOutcome": None,
        "generationInputSnapshot": effective.model_dump(mode="json"),
    }
    source["sourceFingerprint"] = _fingerprint_source(source)
    scenario = {
        "id": scenario_id, "revision": 1, "name": label,
        "sourceSnapshot": source, "premises": {"costs": COSTS, "windowDays": 7},
        "period": {"httpPeriod": PeriodoNatural(
            modo="NATURAL", dias_aquecimento=30, periodo_medicao_dias=30,
        ).model_dump(mode="json")},
    }
    scenario["inputFingerprint"] = _scenario_input_fingerprint(scenario)
    return scenario


def _repetitions(mix_name: str, effective: EffectiveInput) -> list[dict]:
    # O deslocamento é parte explícita da receita: com aquecimento, o primeiro
    # conjunto corporativo atravessa a borda da coorte e não atende ao teto do
    # diagnóstico vigente. A distribuição contém os mesmos dez conjuntos.
    offset = 1 if mix_name == "corporativo_pesado" else 0
    return [{
        "repetition_id": _id(f"repetition:{mix_name}:{index}"),
        "participant_seeds": {
            str(participant.id): _seed(f"demo-v1:{mix_name}:{participant.id}:{(index + offset) % 10}")
            for participant in effective.participants
        },
    } for index in range(10)]


def _diagnostic(
    mix_name: str, scenario: dict, effective: EffectiveInput, study_id: str,
) -> tuple[dict, dict, dict]:
    repetitions = _repetitions(mix_name, effective)
    diagnostic_id = _id(f"diagnostic:{mix_name}")
    job_id = _id(f"job:{mix_name}")
    request = DiagnosticRequest.model_validate({
        "api_version": VERSION, "request_id": _id(f"diagnostic-request:{mix_name}"),
        "idempotency_key": job_id, "study_id": study_id,
        "scenario_id": scenario["id"], "scenario_revision": 1,
        "input_fingerprint": scenario["inputFingerprint"],
        "sampling": {
            "kind": "GENERATED_INPUT", "count": 10,
            "preparation_input": effective.model_dump(mode="json"),
            "repetitions": repetitions,
        },
        "selected_repetition_id": repetitions[0]["repetition_id"],
        "provenance": {},
    })
    results = []
    for index, repetition in enumerate(repetitions):
        snapshot = effective.model_dump(mode="json")
        for participant in snapshot["participants"]:
            participant["seed"] = repetition["participant_seeds"][participant["id"]]
        prepared_input = EffectiveInput.model_validate(snapshot)
        preparation = preparar_carteira(PreparationRequest(
            preparation_version=VERSION,
            request_id=UUID(repetition["repetition_id"]),
            study_id=UUID(study_id), scenario_id=UUID(scenario["id"]),
            scenario_revision=1, expected_build_sha=BUILD_SHA, input=prepared_input,
        ), build_sha=BUILD_SHA, relogio=lambda: CLOCK,
            id_factory=partial(UUID, _id(f"preparation:{mix_name}:{index}")))
        preview_request = _preview_request(
            effective=prepared_input, preparation=preparation, mix_name=mix_name,
            repetition_index=index, study_id=study_id, scenario_id=scenario["id"],
        )
        preview = executar_previa(preview_request, build_sha=BUILD_SHA, relogio=lambda: CLOCK)
        preview = preview.model_copy(update={
            "execution_id": UUID(repetition["repetition_id"]),
            "statistics": preview.statistics.model_copy(update={
                "repetition_id": UUID(repetition["repetition_id"]),
            }),
        })
        results.append(RepetitionResult(
            request=preview_request, envelope=preview, duration_ms=0,
            participant_seeds=repetition["participant_seeds"],
            input_fingerprint=scenario["inputFingerprint"], selected=index == 0,
        ))
    envelope = aggregate_diagnostic(UUID(job_id), request, tuple(results))
    DiagnosticEnvelope.model_validate(envelope.model_dump(mode="json"))
    replay = construir_replay(ReplayRequestV1(
        api_version=VERSION, diagnostic_execution_id=UUID(diagnostic_id),
        diagnostic_envelope=envelope,
    ))
    if len(replay.orders) > 98 or replay.period.settlement_end_day > 365:
        raise ValueError(f"Replay demonstrativo excede limite visual: {mix_name}")
    common = {
        "kind": "DIAGNOSTIC", "attemptId": _id(f"attempt:{mix_name}"),
        "scenarioId": scenario["id"], "scenarioRevision": 1,
        "inputFingerprint": scenario["inputFingerprint"],
        "requestSnapshot": request.model_dump(mode="json"),
        "sourceSnapshot": scenario["sourceSnapshot"],
        "premisesSnapshot": scenario["premises"],
        "periodSnapshot": scenario["period"], "jobId": job_id,
        "createdAt": GENERATED_AT,
    }
    queued = {
        **common, "id": _id(f"reservation:{mix_name}"), "status": "QUEUED",
        "envelope": None, "error": None, "finishedAt": None,
    }
    terminal = {
        **common, "id": diagnostic_id, "status": "SUCCEEDED",
        "envelope": envelope.model_dump(mode="json"),
        "error": None, "finishedAt": GENERATED_AT,
    }
    return queued, terminal, replay.model_dump(mode="json")


def build_package() -> dict:
    """Materializa contratos canônicos; não lê CSV nem estado de usuário."""
    trio = [_company_case_profile(index) for index in range(1, 13)]
    companies = [item[0] for item in trio]
    cases = [item[1] for item in trio]
    profiles = [item[2] for item in trio]
    study_id = _id("study")
    scenarios = []
    executions: list[dict] = []
    replays = {}
    mixes = []
    for mix_name, label in MIX_LABELS:
        effective = _effective(mix_name, profiles)
        preparation = preparar_carteira(PreparationRequest(
            preparation_version=VERSION,
            request_id=UUID(_id(f"base-preparation:{mix_name}")),
            study_id=UUID(study_id), scenario_id=UUID(_id(f"scenario:{mix_name}")),
            scenario_revision=1, expected_build_sha=BUILD_SHA, input=effective,
        ), build_sha=BUILD_SHA, relogio=lambda: CLOCK,
            id_factory=partial(UUID, _id(f"base-preparation-result:{mix_name}")))
        if any(Decimal(item.cadence_monthly) > 4 for item in preparation.parameters):
            raise ValueError(f"Cadência mensal excede quatro ordens: {mix_name}")
        scenario = _scenario(mix_name, label, effective, preparation)
        queued, terminal, replay = _diagnostic(mix_name, scenario, effective, study_id)
        scenarios.append(scenario)
        executions.extend((queued, terminal))
        replays[scenario["id"]] = replay
        counts = Counter(participant.profile for participant in effective.participants)
        mixes.append({
            "id": mix_name, "label": label, "scenarioId": scenario["id"],
            "requestedWeights": MIXES[mix_name],
            "realizedCounts": {name: counts.get(name, 0) for name in sorted(MIXES[mix_name])},
        })
    study = {
        "schemaVersion": "3.0.0", "id": study_id, "ownerSub": OWNER,
        "name": "Estudo demonstrativo sintético", "revision": 1,
        "baseScenarioId": scenarios[0]["id"], "scenarios": scenarios,
        "evidenceSnapshots": [{
            "kind": "OPERATIONAL_PROFILE", "capturedAt": GENERATED_AT,
            "profile": profile,
        } for profile in profiles],
        "executions": executions, "createdAt": GENERATED_AT,
        "updatedAt": GENERATED_AT, "deletedAt": None,
    }
    recipe = {
        "version": VERSION, "participants": 12, "warmupDays": 30,
        "measurementDays": 30, "windowDays": 7,
        "monthlyOrderCapPerParticipant": 4,
        "selectedRepetitionCriterion": "FIRST_PLANNED_REPETITION",
        "repetitionSeedOffsetByMix": {name: (1 if name == "corporativo_pesado" else 0)
            for name, _ in MIX_LABELS},
        "mixes": mixes,
    }
    return {
        "apiVersion": VERSION, "packageVersion": VERSION,
        "generatedAt": GENERATED_AT, "motorBuildSha": BUILD_SHA,
        "recipeFingerprint": _hash(recipe), "ownerPlaceholder": OWNER,
        "syntheticWarning": WARNING, "recipe": recipe,
        "companies": companies, "observedCases": cases, "profiles": profiles,
        "mixes": mixes, "study": study, "replays": replays,
    }


def write_package(path: Path) -> None:
    package = build_package()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(package, ensure_ascii=False, sort_keys=True,
        indent=2, allow_nan=False) + "\n").encode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write_package(args.output)


if __name__ == "__main__":
    main()
