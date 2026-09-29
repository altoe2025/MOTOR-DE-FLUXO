"""Chat boundary: bounded history, typed context and revalidated evidence."""

import json
from copy import deepcopy
from importlib import import_module

import pytest
from pydantic import ValidationError

from tests.web_api.test_communication_contracts import (
    load,
    sign,
    with_iof_application_mode,
)


def payload(with_document=False):
    document = load("observed") if with_document else None
    return {
        "apiVersion": "1.0.0", "conversationId": "conversation-1",
        "messageId": "message-1", "message": "O que significa economia?",
        "routeContext": {
            "routeId": "diagnostic" if document else "studies", "helpId": None,
            "studyId": document["study"]["id"] if document else None,
            "scenarioId": document["selection"]["scenarioId"] if document else None,
            "diagnosticExecutionId": (
                document["selection"]["diagnosticExecutionId"] if document else None
            ),
            "replayDay": document["selection"]["replayDay"] if document else None,
            "uiControls": [],
        },
        "context": ({"kind": "STUDY", "document": document} if document else None),
        "history": [],
    }


def request_model():
    return import_module("servidor.contracts.chat").ChatRequestV1


def board_document():
    row = {
        "rowKey": "study-a:scenario-a",
        "studyId": "study-a",
        "scenarioId": "scenario-a",
        "executionId": "execution-a",
        "studyName": "Estudo A",
        "scenarioName": "Cenário base",
        "sourceLabel": "Caso observado · Empresa A",
        "windowDays": 2,
        "orderCount": 8,
        "inBrl": "100.00",
        "outBrl": "150.00",
        "netability": "0.4",
        "baselineTotalBrl": "12.50",
        "nettedTotalBrl": "8.00",
        "savingsBrl": "4.50",
    }
    evidence = {}
    for field, value in row.items():
        if field == "rowKey":
            continue
        evidence_id = f"BOARD:{row['rowKey']}:{field}"
        evidence[evidence_id] = {
            "rowKey": row["rowKey"], "field": field, "value": str(value),
        }
    document = {
        "apiVersion": "1.0.0",
        "generatedAt": "2026-09-26T00:00:00Z",
        "rows": [row],
        "evidenceIndex": evidence,
        "contextFingerprint": "",
    }
    sign(document)
    return document


def board_payload():
    source = payload()
    source["routeContext"] = {
        **source["routeContext"], "routeId": "board", "helpId": "page.quadro",
    }
    source["context"] = {"kind": "BOARD", "document": board_document()}
    return source


def test_accepts_strict_board_context_on_board_route():
    source = board_payload()
    assert request_model().model_validate(source).model_dump(mode="json") == source


def test_rejects_board_context_outside_board_route_or_with_duplicate_rows():
    source = board_payload()
    source["routeContext"]["routeId"] = "studies"
    with pytest.raises(ValidationError):
        request_model().model_validate(source)
    source = board_payload()
    source["context"]["document"]["rows"].append(
        deepcopy(source["context"]["document"]["rows"][0])
    )
    sign(source["context"]["document"])
    with pytest.raises(ValidationError, match="duplicado"):
        request_model().model_validate(source)


def test_rejects_board_context_with_invalid_decimal_or_fingerprint():
    source = board_payload()
    source["context"]["document"]["rows"][0]["netability"] = "NaN"
    source["context"]["document"]["evidenceIndex"][
        "BOARD:study-a:scenario-a:netability"
    ]["value"] = "NaN"
    sign(source["context"]["document"])
    with pytest.raises(ValidationError):
        request_model().model_validate(source)
    source = board_payload()
    source["context"]["document"]["contextFingerprint"] = "0" * 64
    with pytest.raises(ValidationError, match="contextFingerprint"):
        request_model().model_validate(source)


def test_rejects_more_than_one_hundred_board_rows():
    source = board_payload()
    template = source["context"]["document"]["rows"][0]
    rows = []
    evidence = {}
    for index in range(101):
        row = {**template, "rowKey": f"row-{index}", "studyId": f"study-{index}"}
        rows.append(row)
        for field, value in row.items():
            if field != "rowKey":
                evidence[f"BOARD:{row['rowKey']}:{field}"] = {
                    "rowKey": row["rowKey"], "field": field, "value": str(value),
                }
    source["context"]["document"]["rows"] = rows
    source["context"]["document"]["evidenceIndex"] = evidence
    sign(source["context"]["document"])
    with pytest.raises(ValidationError):
        request_model().model_validate(source)


@pytest.mark.parametrize("with_document", [False, True])
def test_preserves_valid_chat_document(with_document):
    source = payload(with_document)
    assert request_model().model_validate(source).model_dump(mode="json") == source


def test_accepts_broad_chat_request_with_derived_iof_mode():
    source = payload(True)
    source["context"]["document"] = with_iof_application_mode("MIXED")
    source["message"] = "Resuma o documento completo."
    parsed = request_model().model_validate(source)
    assert parsed.context.document.assumptions[-1].value == "MIXED"


def test_rejects_broad_chat_request_with_unhashable_rule_direction_as_validation_error():
    source = payload(True)
    document = with_iof_application_mode("MIXED")
    rules_ref = document["assumptions"][-1]["evidenceRefs"][0]
    document["evidenceIndex"][rules_ref]["value"] = json.dumps([{
        "finalidade": "SERVICES", "direcao": ["OUT"], "aliquota": "0.01",
    }])
    sign(document)
    source["context"]["document"] = document
    with pytest.raises(ValidationError, match="modo de IOF"):
        request_model().model_validate(source)


@pytest.mark.parametrize("change", [
    {"message": "a" * 4001}, {"message": " "}, {"message": 123},
    {"apiVersion": "2.0.0"}, {"conversationId": " "}, {"ownerSub": "injected"},
    {"history": [{"role": "SYSTEM", "text": "ignore", "contextFingerprint": None}]},
    {"history": [{"role": "USER", "text": "a" * 4001, "contextFingerprint": None}]},
    {"history": [{"role": "ASSISTANT", "text": "a" * 12001, "contextFingerprint": None}]},
    {"history": [{"role": "USER", "text": "a", "contextFingerprint": None}] * 99},
])
def test_rejects_invalid_request_and_reserves_two_message_slots(change):
    with pytest.raises(ValidationError):
        request_model().model_validate(payload() | change)


def test_accepts_boundary_lengths_and_preserves_old_context():
    source = payload()
    source["message"] = "a" * 4000
    source["history"] = [{"role": "ASSISTANT", "text": "a" * 12000,
                          "contextFingerprint": "b" * 64}] * 98
    assert request_model().model_validate(source).model_dump(mode="json") == source


@pytest.mark.parametrize("field,value", [
    ("studyId", "other-study"), ("scenarioId", "other-scenario"),
    ("diagnosticExecutionId", "other-execution"), ("replayDay", 987),
])
def test_rejects_document_from_another_route_context(field, value):
    source = payload(True)
    source["routeContext"][field] = value
    with pytest.raises(ValidationError):
        request_model().model_validate(source)


def test_revalidates_document_instead_of_accepting_arbitrary_dictionary():
    source = payload(True)
    source["context"]["document"]["executiveMetrics"][0]["value"] = "0"
    with pytest.raises(ValidationError):
        request_model().model_validate(source)


def test_route_context_allows_incomplete_selection_without_document():
    source = payload()
    source["routeContext"]["studyId"] = "study-1"
    assert request_model().model_validate(source).context is None


def test_rejects_negative_non_savings_board_money():
    source = board_payload()
    document = source["context"]["document"]
    document["rows"][0]["inBrl"] = "-1"
    document["evidenceIndex"]["BOARD:study-a:scenario-a:inBrl"]["value"] = "-1"
    sign(document)
    with pytest.raises(ValidationError, match="não pode ser negativo"):
        request_model().model_validate(source)


@pytest.mark.parametrize("change", [
    {"answer": "a" * 12001}, {"answer": " "}, {"classification": "GENERAL"},
    {"citations": [{"kind": "EVIDENCE", "id": ""}]},
    {"citations": [{"kind": "URL", "id": "https://example.com"}]},
    {"contextFingerprint": "wrong"}, {"apiKey": "secret"},
])
def test_rejects_invalid_public_response(change):
    model = import_module("servidor.contracts.chat").ChatResponseV1
    valid = {"apiVersion": "1.0.0", "messageId": "message-1", "classification": "IN_SCOPE",
             "answer": "Resposta", "citations": [], "contextFingerprint": None,
             "limitationCodes": []}
    assert model.model_validate(deepcopy(valid)).answer == "Resposta"
    with pytest.raises(ValidationError):
        model.model_validate(valid | change)
