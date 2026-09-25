"""Execution identity tracks numerical inputs separately from their evidence."""

import json
from copy import deepcopy
from decimal import localcontext

import pytest

from servidor.contracts.input import PreviaRequest
from servidor.identity import (
    canon_decimal,
    execution_fingerprint,
    provenance_fingerprint,
)

BUILD = "a" * 40


def request(payload):
    return PreviaRequest.model_validate_json(json.dumps(payload))


@pytest.mark.parametrize(
    "field,value",
    [
        ("valor_brl", "10800001.00"),
        ("cliente_id", "outro-cliente"),
        ("id", "outro-id"),
        ("finalidade", "outra-finalidade"),
        ("eh_efx", True),
        ("dia_limite", 1),
        ("direcao", "IN"),
    ],
)
def test_order_semantics_change_execution_identity(reference_payload, field, value):
    changed = deepcopy(reference_payload)
    changed["cenario"]["ordens"][0][field] = value
    assert execution_fingerprint(
        request(reference_payload), BUILD
    ) != execution_fingerprint(request(changed), BUILD)


def test_null_purpose_has_stable_distinct_execution_identity(reference_payload):
    changed = deepcopy(reference_payload)
    changed["cenario"]["ordens"][0]["finalidade"] = None
    changed["proveniencia"]["/ordens/0/finalidade"]["tipo"] = "NAO_COLETADO"
    null_request = request(changed)
    assert execution_fingerprint(null_request, BUILD) == execution_fingerprint(
        request(deepcopy(changed)), BUILD
    )
    assert execution_fingerprint(null_request, BUILD) != execution_fingerprint(
        request(reference_payload), BUILD
    )


def test_reordering_and_decimal_scale_do_not_change_identity(reference_payload):
    changed = deepcopy(reference_payload)
    changed["cenario"]["ordens"][0]["valor_brl"] = "10800000.000"
    changed["cenario"]["ordens"].reverse()
    # Origins remain valid paths and do not participate in numerical identity.
    assert execution_fingerprint(
        request(reference_payload), BUILD
    ) == execution_fingerprint(request(changed), BUILD)


def test_request_metadata_does_not_change_numerical_identity(reference_payload):
    changed = deepcopy(reference_payload)
    changed["request_id"] = "00000000-0000-4000-8000-000000000099"
    changed["scenario_revision"] = 2
    assert execution_fingerprint(
        request(reference_payload), BUILD
    ) == execution_fingerprint(request(changed), BUILD)


def test_build_changes_identity(reference_payload):
    value = request(reference_payload)
    assert execution_fingerprint(value, BUILD) != execution_fingerprint(value, "b" * 40)


@pytest.mark.parametrize(
    "mutation",
    ["window", "cost", "legacy_to_natural"],
)
def test_scenario_and_temporal_policy_change_execution_identity(reference_payload, mutation):
    changed = deepcopy(reference_payload)
    if mutation == "window":
        changed["cenario"]["janela_dias"] = 2
    elif mutation == "cost":
        changed["cenario"]["custo"]["spread_rail_bps"] = "26"
    else:
        changed["periodo"] = {
            "modo": "NATURAL",
            "dias_aquecimento": 0,
            "periodo_medicao_dias": 1,
        }
    assert execution_fingerprint(
        request(reference_payload), BUILD
    ) != execution_fingerprint(request(changed), BUILD)


def test_source_changes_only_evidence_identity(reference_payload):
    changed = deepcopy(reference_payload)
    changed["proveniencia"]["/ordens/0/valor_brl"]["fonte"] = "Estimativa revista"
    a, b = request(reference_payload), request(changed)
    assert execution_fingerprint(a, BUILD) == execution_fingerprint(b, BUILD)
    assert provenance_fingerprint(a.proveniencia) != provenance_fingerprint(
        b.proveniencia
    )


def test_decimal_normalization_is_independent_of_context():
    with localcontext() as context:
        context.prec = 2
        assert (
            canon_decimal("12345678901234567890.1234500")
            == "12345678901234567890.12345"
        )
        assert canon_decimal("-0.000") == "0"
