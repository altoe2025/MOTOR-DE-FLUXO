"""Contrato e reconciliação do pacote demonstrativo da MOT-91."""

from __future__ import annotations

import json
from collections import Counter
from decimal import Decimal
from importlib.metadata import PackageNotFoundError
from math import ceil, floor
from pathlib import Path

import pytest

from motor.mixes import TODOS as MIXES
from servidor.contracts.diagnostics import DiagnosticEnvelope, DiagnosticRequest
from servidor.contracts.replay import ReplayDocumentV1, ReplayRequestV1
from servidor.demo import generate_package
from servidor.demo.generate_package import build_package, write_package
from servidor.replay import construir_replay

LABELS = (
    "equilibrado",
    "retail pesado",
    "corporativo pesado",
    "PSP dominante",
    "outbound extremo",
)
WARNING = "Hipótese sintética demonstrativa — não calibrada com carteira real"


def test_pacote_tem_cinco_composicoes_e_repeticoes_reconciliadas() -> None:
    package = build_package()
    assert package["apiVersion"] == package["packageVersion"] == "1.0.0"
    assert package["ownerPlaceholder"] == "$OWNER_SUB"
    assert len(package["companies"]) == len(package["observedCases"]) == len(package["profiles"]) == 12
    assert [item["label"] for item in package["mixes"]] == list(LABELS)
    assert len(package["study"]["scenarios"]) == 5
    assert len(package["study"]["executions"]) == 10  # reserva + terminal por cenário
    assert package["syntheticWarning"] == WARNING
    assert "varredura" not in json.dumps(package, ensure_ascii=False).lower()

    build_shas: set[str] = set()
    for mix, scenario, terminal in zip(
        package["mixes"],
        package["study"]["scenarios"],
        package["study"]["executions"][1::2],
        strict=True,
    ):
        assert mix["scenarioId"] == scenario["id"] == terminal["scenarioId"]
        assert mix["requestedWeights"] == MIXES[mix["id"]]
        effective = scenario["sourceSnapshot"]["generationInputSnapshot"]
        assert (effective["warmup_days"], effective["measurement_days"], effective["window_days"]) == (30, 30, 7)
        assert all(Decimal(participant["monthly_volume_brl"]) <= 4 * Decimal(participant["ticket_median_brl"])
            for participant in effective["participants"])
        for participant, profile in zip(effective["participants"], package["profiles"], strict=True):
            origin = effective["sources"][f"/participants/{participant['id']}/profile"]
            assert origin["kind"] == "ESTIMATIVA_USUARIO"
            assert origin["source"] == f"profile-mvp:{profile['id']}@{profile['documentFingerprint']}:derived"
        assert sum(mix["realizedCounts"].values()) == 12
        assert set(mix["requestedWeights"]) == set(mix["realizedCounts"])
        assert dict(Counter(participant["profile"] for participant in effective["participants"])) == {
            name: count for name, count in mix["realizedCounts"].items() if count
        }
        weight_total = sum(mix["requestedWeights"].values())
        assert all(floor(12 * weight / weight_total) <= mix["realizedCounts"][name]
            <= ceil(12 * weight / weight_total)
            for name, weight in mix["requestedWeights"].items())
        assert terminal["kind"] == "DIAGNOSTIC" and terminal["status"] == "SUCCEEDED"
        request = DiagnosticRequest.model_validate(terminal["requestSnapshot"])
        envelope = DiagnosticEnvelope.model_validate(terminal["envelope"])
        assert request.sampling.count == envelope.statistics.count == 10
        assert len(request.sampling.repetitions) == len(envelope.repetitions) == 10
        assert request.selected_repetition_id == request.sampling.repetitions[0].repetition_id
        assert envelope.statistics.selected_repetition_id == request.selected_repetition_id
        replay = ReplayDocumentV1.model_validate(package["replays"][scenario["id"]])
        expected_motor_version = f"0.1.0+{package['motorBuildSha']}"
        assert envelope.selected_execution.result.manifesto.versao_motor == expected_motor_version
        assert replay.motor_version == expected_motor_version
        assert replay.repetition_id == request.selected_repetition_id
        assert replay.execution_fingerprint == envelope.selected_execution.execution_fingerprint
        assert len(replay.orders) <= 98
        assert replay.period.settlement_end_day <= 365
        assert replay.totals.measured_gross_brl == envelope.selected_execution.result.agregado.volume_bruto_periodo_brl
        regenerated = construir_replay(ReplayRequestV1(
            api_version="1.0.0",
            diagnostic_execution_id=terminal["id"],
            diagnostic_envelope=envelope,
        ))
        assert regenerated == replay
        build_shas.add(envelope.selected_execution.motor_build_sha)
    assert build_shas == {package["motorBuildSha"]}


def test_geracao_e_byte_a_byte_deterministica(tmp_path: Path) -> None:
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    write_package(first)
    write_package(second)
    assert first.read_bytes() == second.read_bytes()
    versioned = Path("web/src/demo/generated/demo-study.v1.json")
    assert first.read_bytes() == versioned.read_bytes()


def test_gerador_recusa_versao_instalada_indisponivel(monkeypatch) -> None:
    def missing(_name: str) -> str:
        raise PackageNotFoundError("motor-de-fluxo")

    monkeypatch.setattr(generate_package, "version", missing, raising=False)
    with pytest.raises(RuntimeError, match="motor-de-fluxo.*instalado"):
        build_package()
