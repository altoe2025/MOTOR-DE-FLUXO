"""HTTP chat plumbing uses injected fakes; no provider network is allowed."""

import asyncio
import json
import socket
from importlib import import_module

import pytest
from fastapi.testclient import TestClient

from servidor.app import create_app, create_schema_app
from tests.web_api.test_auth import settings
from tests.web_api.test_chat_contracts import payload
from tests.web_api.test_replay_http import Verifier

AUTH = {"Authorization": "Bearer valid-token"}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    original_connect = socket.socket.connect
    original_getaddrinfo = socket.getaddrinfo

    def local_event_loop_only(sock, address):
        # Windows asyncio creates its wakeup socket pair via loopback.
        if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1"}:
            return original_connect(sock, address)
        raise AssertionError("chat contract tests must never connect to a network")

    def forbidden(*args, **kwargs):
        raise AssertionError("chat contract tests must never connect to a network")

    def local_dns_only(host, *args, **kwargs):
        if host not in {"127.0.0.1", "::1", "localhost"}:
            raise AssertionError("chat tests must never resolve external DNS")
        return original_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", local_event_loop_only)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket, "getaddrinfo", local_dns_only)


class FakeProvider:
    def __init__(self, failure=None, classification="IN_SCOPE", delay=0, answer=None):
        self.failure = failure
        self.classification = classification
        self.delay = delay
        self.answer_data = answer
        self.calls = []

    async def classify(self, request):
        self.calls.append(("classify", request))
        await asyncio.sleep(self.delay)
        if self.failure:
            raise self.failure
        scope = import_module("servidor.chat.scope")
        return scope.ScopeDecision(classification=self.classification)

    async def answer(self, request):
        self.calls.append(("answer", request))
        service = import_module("servidor.chat.service")
        if self.answer_data is not None:
            return service.ProviderAnswer.model_construct(**self.answer_data)
        return service.ProviderAnswer(answer="A importação revisa uma planilha local.",
                                      citations=[{"kind": "HELP", "id": "page.importacao"}],
                                      limitationCodes=[])


def app(provider=None, enabled=True, timeout=30):
    return create_app(settings(
        chat_enabled=enabled, openai_api_key="runtime-secret",
        openai_chat_model="test-model", openai_chat_timeout_seconds=timeout,
    ), Verifier(), chat_provider=provider)


def test_unconfigured_chat_is_authenticated_and_does_not_block_health_or_session():
    with TestClient(create_app(settings(), Verifier())) as client:
        assert client.post("/api/v1/chat", json=payload()).status_code == 401
        assert client.post("/api/v1/chat", json=payload(), headers={
            "Authorization": "Bearer wrong-token",
        }).status_code == 401
        response = client.post("/api/v1/chat", json=payload(), headers=AUTH)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "CHAT_INDISPONIVEL"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-request-id"] == response.json()["error"]["request_id"]
        assert client.get("/api/v1/health").status_code == 200
        assert client.get("/api/v1/session", headers=AUTH).status_code == 200


def test_injected_provider_receives_validated_context_and_returns_correlated_response(caplog):
    fake = FakeProvider()
    source = payload(True)
    source["message"] = "pergunta-privada"
    with caplog.at_level("INFO", logger="servidor.http"), TestClient(app(fake)) as client:
        response = client.post("/api/v1/chat", json=source, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {
        "apiVersion": "1.0.0", "messageId": "message-1", "classification": "IN_SCOPE",
        "answer": "A importação revisa uma planilha local.",
        "citations": [{"kind": "HELP", "id": "page.importacao"}],
        "contextFingerprint": source["communication"]["contextFingerprint"],
        "limitationCodes": [],
    }
    assert [call[0] for call in fake.calls] == ["classify", "answer"]
    assert fake.calls[1][1].chat.model_dump(mode="json") == source
    assert response.headers["cache-control"] == "no-store"
    assert "pergunta-privada" not in caplog.text
    assert "runtime-secret" not in caplog.text + response.text


@pytest.mark.parametrize("enabled,provider", [(False, None), (False, FakeProvider())])
def test_disabled_chat_fails_closed(enabled, provider):
    with TestClient(app(provider, enabled)) as client:
        response = client.post("/api/v1/chat", json=payload(), headers=AUTH)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "CHAT_INDISPONIVEL"
    if provider is not None:
        assert provider.calls == []


@pytest.mark.parametrize("fake", [
    FakeProvider(failure=RuntimeError("runtime-secret pergunta-privada")),
    FakeProvider(delay=0.1),
    FakeProvider(answer={"answer": "a" * 12001, "citations": [], "limitationCodes": []}),
])
def test_failure_timeout_and_invalid_provider_output_are_sanitized(fake, caplog):
    with TestClient(app(fake, timeout=0.01)) as client:
        response = client.post("/api/v1/chat", json=payload(), headers=AUTH)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "CHAT_INDISPONIVEL"
    assert "runtime-secret" not in response.text + caplog.text
    assert "pergunta-privada" not in response.text + caplog.text


@pytest.mark.parametrize("classification", ["OUT_OF_SCOPE", "MIXED", "INSUFFICIENT_EVIDENCE"])
def test_c4_scope_policies_are_applied_by_server(classification):
    fake = FakeProvider(classification=classification)
    with TestClient(app(fake)) as client:
        response = client.post("/api/v1/chat", json=payload(), headers=AUTH)
    assert response.status_code == 200
    assert response.json()["classification"] == classification
    assert [call[0] for call in fake.calls] == (
        ["classify", "answer"] if classification == "MIXED" else ["classify"]
    )


@pytest.mark.parametrize("headers", [{}, {"content-length": "1"}])
def test_stream_body_limit_does_not_trust_content_length(headers):
    fake = FakeProvider()
    content = json.dumps(payload()).encode() + b" " * (1024 * 1024)
    with TestClient(app(fake)) as client:
        response = client.post("/api/v1/chat", content=iter([content[:100], content[100:]]),
                               headers=AUTH | headers)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "LIMITE_EXCEDIDO"
    assert fake.calls == []


def test_accepts_exactly_one_mib_and_rejects_declared_oversize_before_parsing():
    fake = FakeProvider()
    body = json.dumps(payload()).encode()
    with TestClient(app(fake)) as client:
        accepted = client.post("/api/v1/chat", content=body.ljust(1024 * 1024), headers=AUTH)
        oversized = client.post("/api/v1/chat", content=b"invalid", headers=AUTH | {
            "content-length": str(1024 * 1024 + 1),
        })
    assert accepted.status_code == 200
    assert oversized.status_code == 413
    assert len(fake.calls) == 2


@pytest.mark.parametrize("content,length,status,code", [
    (b"{", None, 400, "JSON_INVALIDO"), (b"\xff", None, 400, "JSON_INVALIDO"),
    (b"{}", "invalid", 400, "JSON_INVALIDO"), (b"{}", "-1", 400, "JSON_INVALIDO"),
    (json.dumps(payload() | {"message": "a" * 4001}).encode(), None, 422, "ENTRADA_INVALIDA"),
    (json.dumps(payload() | {"private-key-name": "secret-value"}).encode(),
     None, 422, "ENTRADA_INVALIDA"),
], ids=["malformed-json", "invalid-utf8", "invalid-length", "negative-length",
        "question-limit", "private-extra-field"])
def test_invalid_payload_never_reaches_provider_or_leaks_input(content, length, status, code):
    fake = FakeProvider()
    headers = AUTH | ({"content-length": length} if length is not None else {})
    with TestClient(app(fake)) as client:
        response = client.post("/api/v1/chat", content=content, headers=headers)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert fake.calls == []
    assert "private-key-name" not in response.text
    assert "secret-value" not in response.text


def test_openapi_exposes_bearer_and_chat_request_response():
    schema = create_schema_app().openapi()
    route = schema["paths"]["/api/v1/chat"]["post"]
    assert route["security"] == [{"HTTPBearer": []}]
    assert route["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ChatRequestV1",
    }
    assert route["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ChatResponseV1",
    }
    assert "503" in route["responses"]
