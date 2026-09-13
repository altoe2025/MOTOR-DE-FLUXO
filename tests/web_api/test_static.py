import json
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from servidor.app import create_app
from servidor.auth import AuthenticatedUser
from servidor.config import Settings

USER_ID = UUID("00000000-0000-4000-8000-000000000101")


class Verifier:
    def verify(self, token: str) -> AuthenticatedUser:
        return AuthenticatedUser(USER_ID)


@pytest.fixture
def static_client(tmp_path: Path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>Motor de Fluxo</html>", encoding="utf-8")
    (dist / "assets" / "app.a1b2c3d4.js").write_text(
        "console.log('ok')", encoding="utf-8"
    )
    (dist / "assets" / "index-B6xOV8Ew.js").write_text(
        "console.log('vite')", encoding="utf-8"
    )
    (dist / ".vite").mkdir()
    (dist / ".vite" / "manifest.json").write_text(
        json.dumps(
            {
                "index.html": {
                    "file": "assets/index-B6xOV8Ew.js",
                    "isEntry": True,
                }
            }
        ),
        encoding="utf-8",
    )
    for filename in (
        "app-user-content.js",
        "application-bootstrap.js",
        "app-download.js",
        "app-runtime1.js",
    ):
        (dist / "assets" / filename).write_text("sem hash", encoding="utf-8")
    settings = Settings.model_validate(
        {
            "app_env": "test",
            "supabase_url": "https://projeto.supabase.co",
            "supabase_jwt_issuer": "https://projeto.supabase.co/auth/v1",
            "supabase_jwt_audience": "authenticated",
            "supabase_allowed_user_ids": frozenset({USER_ID}),
            "motor_build_sha": "a" * 40,
            "web_dist_dir": dist,
        }
    )
    with TestClient(
        create_app(settings, Verifier()), raise_server_exceptions=False
    ) as client:
        yield client


@pytest.mark.parametrize(
    "path",
    ["/", "/login", "/auth/callback", "/carteira", "/diagnostico", "/comparar"],
)
def test_rotas_spa_conhecidas_recebem_index_sem_cache_duradouro(static_client, path):
    response = static_client.get(path)

    assert response.status_code == 200
    assert response.text == "<html>Motor de Fluxo</html>"
    assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("asset", ["app.a1b2c3d4.js", "index-B6xOV8Ew.js"])
def test_asset_com_hash_recebe_cache_imutavel(static_client, asset):
    response = static_client.get(f"/assets/{asset}")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


@pytest.mark.parametrize(
    "asset",
    [
        "app-user-content.js",
        "application-bootstrap.js",
        "app-download.js",
        "app-runtime1.js",
    ],
)
def test_asset_sem_hash_nao_recebe_cache_imutavel(static_client, asset):
    response = static_client.get(f"/assets/{asset}")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize(
    "path",
    [
        "/assets/ausente.js",
        "/assets/%2e%2e/index.html",
        "/auth/desconhecida",
        "/rota-desconhecida",
        "/api/v1/ausente",
    ],
)
def test_fallback_nao_vaza_html_para_caminhos_invalidos(static_client, path):
    response = static_client.get(path)

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert "<html>" not in response.text


@pytest.mark.parametrize("link_name", ["index.html", "assets"])
def test_links_para_fora_do_dist_nao_sao_servidos(tmp_path: Path, link_name: str):
    dist = tmp_path / "dist"
    dist.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    target = outside / link_name
    if link_name == "assets":
        target.mkdir()
        (target / "app.a1b2c3d4.js").write_text("segredo", encoding="utf-8")
    else:
        target.write_text("<html>segredo</html>", encoding="utf-8")
    try:
        (dist / link_name).symlink_to(
            target,
            target_is_directory=link_name == "assets",
        )
    except OSError:
        pytest.skip("sistema não permite criar symlink neste ambiente")

    settings = Settings.model_validate(
        {
            "app_env": "test",
            "supabase_url": "https://projeto.supabase.co",
            "supabase_jwt_issuer": "https://projeto.supabase.co/auth/v1",
            "supabase_jwt_audience": "authenticated",
            "supabase_allowed_user_ids": frozenset({USER_ID}),
            "motor_build_sha": "a" * 40,
            "web_dist_dir": dist,
        }
    )
    path = "/assets/app.a1b2c3d4.js" if link_name == "assets" else "/"

    with TestClient(
        create_app(settings, Verifier()), raise_server_exceptions=False
    ) as client:
        response = client.get(path)

    assert response.status_code == 404
    assert "segredo" not in response.text
