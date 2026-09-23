"""Shared trust-boundary fixtures for read-only communication projections."""

import hashlib
import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from servidor.contracts.communication import CommunicationDocumentV1

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "contracts/fixtures/communication"


def load(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def sign(document):
    payload = {k: v for k, v in document.items() if k not in ("generatedAt", "contextFingerprint")}
    document["contextFingerprint"] = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


@pytest.mark.parametrize("name", ["observed", "synthetic", "unicode"])
def test_preserves_shared_document_decimals_availability_and_fingerprint(name):
    document = load(name)
    parsed = CommunicationDocumentV1.model_validate(document)
    assert parsed.model_dump(mode="json") == document
    assert parsed.executiveMetrics[0].value == "12345678901234567890.0123456789"
    assert parsed.executiveMetrics[1].value is None
    signed = deepcopy(document)
    sign(signed)
    assert signed["contextFingerprint"] == document["contextFingerprint"]


@pytest.mark.parametrize("case", load("invalid-cases"), ids=lambda case: case["name"])
def test_rejects_shared_invalid_documents_even_with_recomputed_fingerprint(case):
    document = deepcopy(load(case["base"]))
    parent = document
    for key in case["path"][:-1]:
        parent = parent[key]
    parent[case["path"][-1]] = case["value"]
    if case["path"] != ["contextFingerprint"]:
        sign(document)
    with pytest.raises(ValidationError):
        CommunicationDocumentV1.model_validate(document)


def test_generated_at_is_excluded_from_context_fingerprint():
    document = load("observed")
    document["generatedAt"] = "2026-09-24T01:02:03Z"
    assert CommunicationDocumentV1.model_validate(document).contextFingerprint == load("observed")["contextFingerprint"]


def test_published_schema_matches_python_trust_boundary():
    schema = json.loads((ROOT / "web/src/communication/communicationDocument.schema.json").read_text(encoding="utf-8"))
    assert schema == CommunicationDocumentV1.model_json_schema()
