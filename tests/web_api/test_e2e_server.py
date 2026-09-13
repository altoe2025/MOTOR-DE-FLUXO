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
