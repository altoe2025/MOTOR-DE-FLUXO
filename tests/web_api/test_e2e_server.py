import json
from pathlib import Path

from fastapi.testclient import TestClient

from tests.web_api.run_e2e import CONTROLLED_TOKEN, build_e2e_app


def test_controlled_e2e_server_accepts_only_its_test_token():
    with TestClient(build_e2e_app()) as client:
        accepted = client.get(
            "/api/v1/examples/reference",
            headers={"Authorization": f"Bearer {CONTROLLED_TOKEN}"},
        )
        rejected = client.get(
            "/api/v1/examples/reference",
            headers={"Authorization": "Bearer outro-token"},
        )

    assert accepted.status_code == 200
    assert accepted.json()["cenario"]["ordens"]
    assert accepted.json()["proveniencia"]
    assert rejected.status_code == 401
    assert rejected.json()["error"]["code"] == "SESSAO_INVALIDA"


def test_default_e2e_server_uses_versioned_demo_motor_build(monkeypatch):
    monkeypatch.delenv("MOT_E2E_BUILD_SHA", raising=False)
    fixture = json.loads(Path("web/src/demo/generated/demo-study.v1.json").read_text(encoding="utf-8"))
    app = build_e2e_app()
    assert app.state.settings.motor_build_sha == fixture["motorBuildSha"]


def test_chat_acceptance_uses_controlled_provider_and_real_scope_policy():
    from servidor.chat.prompts import OUT_OF_SCOPE_TEXT
    from tests.web_api.test_chat_contracts import payload

    with TestClient(build_e2e_app()) as client:
        headers = {"Authorization": f"Bearer {CONTROLLED_TOKEN}"}
        response = client.post("/api/v1/chat", json=payload(), headers=headers)
        assert response.status_code == 200
        assert response.json()["citations"] == [{"kind": "HELP", "id": "page.importacao"}]
        assert client.post("/__e2e__/chat/control", json={"mode": "out"}).status_code == 200
        response = client.post("/api/v1/chat", json=payload(), headers=headers)
        assert response.json()["answer"] == OUT_OF_SCOPE_TEXT
        assert client.get("/__e2e__/chat/state").json()["answered"] == 1
