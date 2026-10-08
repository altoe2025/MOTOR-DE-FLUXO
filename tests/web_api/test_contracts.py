"""HTTP transport rejects coercion and invalid scenario semantics before execution."""

import json
from copy import deepcopy
from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import TypeAdapter, ValidationError

from servidor.contracts.input import CampoDecimal, CenarioEntrada, PreviaRequest
from servidor.contracts.primitives import DateTimeValue, UUIDValue
from servidor.motor_adapter import construir_cenario


def test_reference_preserves_decimal_text(reference_payload):
    request = PreviaRequest.model_validate_json(json.dumps(reference_payload))
    assert request.model_dump(mode="json")["cenario"] == reference_payload["cenario"]


def test_request_preserves_null_purpose_and_not_collected_provenance(reference_payload):
    path = "/ordens/0/finalidade"
    reference_payload["cenario"]["ordens"][0]["finalidade"] = None
    reference_payload["proveniencia"][path]["tipo"] = "NAO_COLETADO"
    request = PreviaRequest.model_validate(reference_payload)
    assert request.cenario.ordens[0].finalidade is None
    assert request.model_dump(mode="json")["cenario"]["ordens"][0]["finalidade"] is None


def test_not_collected_rejects_textual_purpose(reference_payload):
    reference_payload["proveniencia"]["/ordens/0/finalidade"]["tipo"] = "NAO_COLETADO"
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate(reference_payload)


@pytest.mark.parametrize("purpose", ["", "  ", " SERVICOS", "SERVICOS "])
def test_order_purpose_still_rejects_empty_or_external_spaces(reference_payload, purpose):
    reference_payload["cenario"]["ordens"][0]["finalidade"] = purpose
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate(reference_payload)


def test_iof_rule_still_requires_textual_purpose(reference_payload):
    reference_payload["cenario"]["custo"]["iof_por_finalidade"] = [
        {"finalidade": None, "direcao": "OUT", "aliquota": "0.01"}
    ]
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate(reference_payload)


def test_input_preserves_opposite_legs_from_the_same_client(reference_payload):
    scenario = deepcopy(reference_payload["cenario"])
    out_order = deepcopy(scenario["ordens"][0])
    in_order = deepcopy(scenario["ordens"][1])
    out_order.update(id="same-client-out", cliente_id="same-client", direcao="OUT")
    in_order.update(id="same-client-in", cliente_id="same-client", direcao="IN")
    scenario["ordens"] = [out_order, in_order]

    entry = CenarioEntrada.model_validate(scenario)
    adapted = construir_cenario(entry)

    assert [order.id for order in adapted.ordens] == [
        "same-client-out",
        "same-client-in",
    ]
    assert [order.cliente_id for order in adapted.ordens] == [
        "same-client",
        "same-client",
    ]
    assert [order.direcao.value for order in adapted.ordens] == ["OUT", "IN"]
    description = CenarioEntrada.model_json_schema()["properties"]["ordens"][
        "description"
    ]
    assert "não devem ser pré-netadas" in description


def test_decimal_field_keeps_one_value_and_its_origin(reference_payload):
    origin = next(iter(reference_payload["proveniencia"].values()))
    field = CampoDecimal.model_validate({"valor": "1.2300", "origem": origin})
    assert field.valor == "1.2300"
    with pytest.raises(ValidationError):
        CampoDecimal.model_validate(
            {"valor": "1.23", "minimo": "1", "maximo": "2", "origem": origin}
        )


def test_observed_origin_is_accepted_for_imported_amount(reference_payload):
    reference_payload["proveniencia"]["/ordens/0/valor_brl"][
        "tipo"
    ] = "DADO_OBSERVADO"

    request = PreviaRequest.model_validate(reference_payload)

    assert request.proveniencia["/ordens/0/valor_brl"].tipo == "DADO_OBSERVADO"


def test_not_collected_is_accepted_for_false_efx(reference_payload):
    path = "/ordens/0/eh_efx"
    reference_payload["cenario"]["ordens"][0]["eh_efx"] = False
    reference_payload["proveniencia"][path]["tipo"] = "NAO_COLETADO"

    request = PreviaRequest.model_validate(reference_payload)

    assert request.proveniencia[path].tipo == "NAO_COLETADO"


@pytest.mark.parametrize("path", ["/janela_dias", "/ordens/0/valor_brl"])
def test_not_collected_is_rejected_outside_efx(reference_payload, path):
    reference_payload["proveniencia"][path]["tipo"] = "NAO_COLETADO"

    with pytest.raises(ValidationError):
        PreviaRequest.model_validate(reference_payload)


def test_not_collected_rejects_true_efx(reference_payload):
    path = "/ordens/0/eh_efx"
    reference_payload["cenario"]["ordens"][0]["eh_efx"] = True
    reference_payload["proveniencia"][path]["tipo"] = "NAO_COLETADO"

    with pytest.raises(ValidationError):
        PreviaRequest.model_validate(reference_payload)


def test_unknown_provenance_kind_is_rejected(reference_payload):
    reference_payload["proveniencia"]["/ordens/0/valor_brl"][
        "tipo"
    ] = "DESCONHECIDO"

    with pytest.raises(ValidationError):
        PreviaRequest.model_validate(reference_payload)


def test_server_primitives_accept_already_typed_values():
    uuid_value = UUID("00000000-0000-4000-8000-000000000001")
    instant = datetime(2026, 9, 11, tzinfo=UTC)
    assert TypeAdapter(UUIDValue).validate_python(uuid_value) == uuid_value
    assert TypeAdapter(DateTimeValue).validate_python(instant) == instant


@pytest.mark.parametrize(
    "value",
    [
        10800000,
        10800000.0,
        True,
        "NaN",
        "Infinity",
        "1e4",
        "1,00",
        " 1",
        "01",
        "0",
        "-1",
        "1000000000001",
        "1.0000001",
    ],
)
def test_order_money_rejects_invalid_transport_or_limits(reference_payload, value):
    reference_payload["cenario"]["ordens"][0]["valor_brl"] = value
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate_json(json.dumps(reference_payload))


@pytest.mark.parametrize("value", [True, "1", 1.5])
def test_integer_fields_do_not_coerce(reference_payload, value):
    reference_payload["cenario"]["janela_dias"] = value
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate_json(json.dumps(reference_payload))


@pytest.mark.parametrize(
    "mutation",
    [
        "duplicate_id",
        "extra_field",
        "inverted_deadline",
        "zero_ptax",
        "duplicate_iof",
        "unknown_pointer",
        "missing_origin",
        "naive_timestamp",
    ],
)
def test_rejects_ambiguous_or_unsupported_input(reference_payload, mutation):
    c = reference_payload["cenario"]
    origins = reference_payload["proveniencia"]
    path = next(iter(origins))
    if mutation == "duplicate_id":
        c["ordens"][1]["id"] = c["ordens"][0]["id"]
    elif mutation == "extra_field":
        c["seed"] = 1
    elif mutation == "inverted_deadline":
        c["ordens"][0]["dia_conhecida"] = 1
    elif mutation == "zero_ptax":
        c["custo"]["ptax"] = "0"
    elif mutation == "duplicate_iof":
        rule = {"finalidade": "TODO-anexo-v", "direcao": "OUT", "aliquota": "0.035"}
        c["custo"]["iof_por_finalidade"] = [rule, deepcopy(rule)]
        for index in range(2):
            for field in ("finalidade", "aliquota"):
                origins[f"/custo/iof_por_finalidade/{index}/{field}"] = deepcopy(
                    origins[path]
                )
    elif mutation == "unknown_pointer":
        origins["/inexistente"] = deepcopy(origins[path])
    elif mutation == "missing_origin":
        del origins[path]
    elif mutation == "naive_timestamp":
        origins[path]["registrado_em_utc"] = "2026-09-11T00:00:00"
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate_json(json.dumps(reference_payload))


def test_empty_portfolio_is_valid(reference_payload):
    reference_payload["cenario"]["ordens"] = []
    reference_payload["proveniencia"] = {
        k: v
        for k, v in reference_payload["proveniencia"].items()
        if not k.startswith("/ordens/")
    }
    assert (
        PreviaRequest.model_validate_json(json.dumps(reference_payload)).cenario.ordens
        == []
    )


def test_natural_period_excludes_entries_at_end(reference_payload):
    reference_payload["periodo"] = {
        "modo": "NATURAL",
        "dias_aquecimento": 0,
        "periodo_medicao_dias": 1,
    }
    reference_payload["cenario"]["ordens"][0].update(dia_conhecida=1, dia_limite=2)
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate_json(json.dumps(reference_payload))
