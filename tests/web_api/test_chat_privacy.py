"""Exercise the real authenticated route and provider serializer without network."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from servidor.app import create_app
from servidor.auth import AuthenticatedUser
from servidor.chat.openai_provider import OpenAIChatProvider
from tests.web_api.scan_credentials import (
    find_runtime_privacy_findings,
    find_secret_findings,
)
from tests.web_api.test_auth import settings
from tests.web_api.test_chat_contracts import payload
from tests.web_api.test_chat_http import no_network  # noqa: F401
from tests.web_api.test_communication_contracts import sign
from tests.web_api.test_openai_provider import answer, call, envelope, message
from tests.web_api.test_replay_http import USER_ID

TOKEN = "synthetic-private-bearer-C6"
KEY = "sk-" + "proj-" + "synthetic-provider-secret-C6-123456"
QUESTION = "Como funciona a importação? Pergunta privada fictícia C6."
ANSWER = "Resposta privada fictícia C6: a importação revisa a planilha local."
STUDY = "Estudo reservado fictício çã C6"
RAW = "PK-RAW-XLSX-SYNTHETIC-C6"
UNSELECTED = "Unselected-private-financial-C6-987654321"


class CanaryVerifier:
    def verify(self, token):
        if token != TOKEN:
            raise AssertionError("unexpected synthetic credential")
        return AuthenticatedUser(USER_ID)


def private_source():
    source = payload(True)
    source["message"] = QUESTION
    source["communication"]["study"]["name"] = STUDY
    sign(source["communication"])
    return source


def private_canaries():
    return {"bearer": TOKEN, "owner": str(USER_ID), "key": KEY, "question": QUESTION,
            "answer": ANSWER, "study-name": STUDY, "raw-xlsx": RAW,
            "unselected": UNSELECTED, "financial-value": "12345678901234567890.0123456789"}


def exchange(source, responses, caplog):
    recorded = []

    async def handler(request):
        recorded.append(request)
        result = responses[len(recorded) - 1]
        if isinstance(result, Exception):
            raise result
        return result if isinstance(result, httpx.Response) else httpx.Response(200, json=result)

    configured = settings(chat_enabled=True, openai_api_key=KEY,
                          openai_chat_model="synthetic-test-model")
    provider = OpenAIChatProvider(configured, transport=httpx.MockTransport(handler))
    app = create_app(configured, CanaryVerifier(), chat_provider=provider)
    with caplog.at_level("DEBUG"), TestClient(app) as client:
        result = client.post("/api/v1/chat", headers={"Authorization": "Bearer " + TOKEN},
                             json=source)
        assert client.get("/api/v1/health").status_code == 200
        client.portal.call(provider.aclose)
    return result, recorded


def test_provider_wire_omits_identity_raw_workbook_and_unrequested_financial_data(caplog):
    source = private_source()
    result, requests = exchange(source, [
        envelope(message({"classification": "IN_SCOPE"})),
        envelope(call()), envelope(message(answer(answer=ANSWER))),
    ], caplog)
    assert result.status_code == 200
    assert result.json()["answer"] == ANSWER
    assert len(requests) == 3
    private = private_canaries()
    forbidden = {kind: private[kind] for kind in (
        "bearer", "owner", "raw-xlsx", "unselected", "study-name", "financial-value",
    )}
    for request in requests:
        body = request.content.decode()
        assert find_runtime_privacy_findings({"provider-body": body}, canaries=forbidden) == []
        assert KEY not in body
        # The provider credential belongs only in its outbound authorization header.
        assert request.headers["authorization"] == "Bearer " + KEY
        assert TOKEN not in str(request.headers)
        data = json.loads(body)
        assert data["store"] is False
        assert not {"conversation", "previous_response_id"} & data.keys()
    assert find_runtime_privacy_findings({"runtime.log": caplog.text},
                                         canaries=private) == []
    public_forbidden = {kind: value for kind, value in private.items() if kind != "answer"}
    assert find_runtime_privacy_findings({"response.json": result.text},
                                         canaries=public_forbidden) == []


def test_metric_tool_publishes_only_requested_value_and_keeps_runtime_logs_private(caplog):
    source = private_source()
    doc = source["communication"]
    unrequested_value = "98765432109876.123456"
    doc["executiveMetrics"].append({
        **doc["executiveMetrics"][0], "code": "unrequested", "value": unrequested_value,
        "evidenceRefs": ["unrequested"],
    })
    doc["evidenceIndex"]["unrequested"] = {
        **doc["evidenceIndex"]["gross"], "path": "/metrics/unrequested", "value": unrequested_value,
    }
    sign(doc)
    result, requests = exchange(source, [
        envelope(message({"classification": "IN_SCOPE"})),
        envelope(call(name="consultar_metrica", args={"metricCode": "gross"})),
        envelope(message(answer(answer=ANSWER, citations=[{"kind": "METRIC", "id": "gross"}]))),
    ], caplog)
    assert result.status_code == 200
    wire = "\n".join(request.content.decode() for request in requests)
    assert unrequested_value not in wire
    assert "12345678901234567890.0123456789" in requests[-1].content.decode()
    assert "12345678901234567890.0123456789" not in requests[0].content.decode()
    assert "12345678901234567890.0123456789" not in requests[1].content.decode()
    assert find_runtime_privacy_findings({"runtime.log": caplog.text},
                                         canaries=private_canaries()) == []


@pytest.mark.parametrize("stage", ["classify", "answer", "tool-output"])
@pytest.mark.parametrize("failure_kind", ["http", "refusal", "malformed", "timeout"])
def test_provider_failures_never_publish_or_log_private_envelopes(stage, failure_kind, caplog):
    private = private_canaries()
    leaked = json.dumps(private, ensure_ascii=False)
    failures = {
        "http": httpx.Response(429, text=leaked),
        "refusal": envelope({"type": "message", "role": "assistant", "status": "completed",
                             "content": [{"type": "refusal", "refusal": leaked}]}),
        "malformed": httpx.Response(200, text=leaked),
        "timeout": httpx.ReadTimeout(leaked),
    }
    responses = []
    if stage != "classify":
        responses.append(envelope(message({"classification": "IN_SCOPE"})))
    if stage == "tool-output":
        responses.append(envelope(call()))
    responses.append(failures[failure_kind])
    result, requests = exchange(private_source(), responses, caplog)
    assert result.status_code == 503
    assert len(requests) == len(responses)
    assert result.json()["error"]["code"] == "CHAT_INDISPONIVEL"
    artifacts = {"runtime.log": caplog.text, "public-error.json": result.text}
    assert find_runtime_privacy_findings(artifacts, canaries=private) == []
    assert find_secret_findings(artifacts) == []


@pytest.mark.parametrize("field,value", [
    ("ownerSub", str(USER_ID)), ("rawXlsx", RAW), ("unselectedStudy", UNSELECTED),
    (KEY, QUESTION),
])
def test_rejected_client_fields_never_reach_provider_or_public_errors(field, value, caplog):
    source = private_source() | {field: value}
    result, requests = exchange(source, [], caplog)
    assert result.status_code == 422
    assert requests == []
    assert find_runtime_privacy_findings(
        {"runtime.log": caplog.text, "public-error.json": result.text},
        canaries=private_canaries(),
    ) == []
