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
        },
        "communication": document, "history": [],
    }


def request_model():
    return import_module("servidor.contracts.chat").ChatRequestV1


@pytest.mark.parametrize("with_document", [False, True])
def test_preserves_valid_chat_document(with_document):
    source = payload(with_document)
    assert request_model().model_validate(source).model_dump(mode="json") == source


def test_accepts_broad_chat_request_with_derived_iof_mode():
    source = payload(True)
    source["communication"] = with_iof_application_mode("MIXED")
    source["message"] = "Resuma o documento completo."
    parsed = request_model().model_validate(source)
    assert parsed.communication.assumptions[-1].value == "MIXED"


def test_rejects_broad_chat_request_with_unhashable_rule_direction_as_validation_error():
    source = payload(True)
    document = with_iof_application_mode("MIXED")
    rules_ref = document["assumptions"][-1]["evidenceRefs"][0]
    document["evidenceIndex"][rules_ref]["value"] = json.dumps([{
        "finalidade": "SERVICES", "direcao": ["OUT"], "aliquota": "0.01",
    }])
    sign(document)
    source["communication"] = document
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
    source["communication"]["executiveMetrics"][0]["value"] = "0"
    with pytest.raises(ValidationError):
        request_model().model_validate(source)


def test_route_context_allows_incomplete_selection_without_document():
    source = payload()
    source["routeContext"]["studyId"] = "study-1"
    assert request_model().model_validate(source).communication is None


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
