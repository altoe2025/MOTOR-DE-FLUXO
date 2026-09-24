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
