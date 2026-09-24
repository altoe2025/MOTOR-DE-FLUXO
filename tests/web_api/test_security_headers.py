"""Browser policy applies to SPA, assets and API, including sanitized errors."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from servidor.app import create_app
from tests.web_api.test_auth import settings
from tests.web_api.test_static import Verifier


@pytest.fixture
def client(tmp_path: Path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>Motor</html>", encoding="utf-8")
    (tmp_path / "assets" / "app.a1b2c3d4.js").write_text("export {};", encoding="utf-8")
    app = create_app(settings(web_dist_dir=tmp_path, openai_api_key="runtime-secret"), Verifier())

    with TestClient(app, raise_server_exceptions=False) as configured_client:
        yield configured_client


@pytest.mark.parametrize("path,status", [
    ("/login", 200), ("/auth/callback", 200), ("/assets/app.a1b2c3d4.js", 200),
    ("/api/v1/health", 200), ("/api/v1/session", 401),
    ("/api/v1/missing", 404),
])
def test_security_policy_covers_every_response(client, path, status):
    response = client.get(path)
    assert response.status_code == status
    directives = dict(
        directive.strip().split(" ", 1)
        for directive in response.headers["content-security-policy"].split(";")
        if directive.strip()
    )
    assert directives["default-src"] == "'self'"
    assert directives["script-src"] == "'self'"
    assert directives["connect-src"] == "'self' https://projeto.supabase.co"
    assert directives["img-src"] == "'self' data:"
    assert directives["style-src"] == "'self' 'unsafe-inline'"
    assert directives["worker-src"] == "'self'"
    assert directives["frame-src"] == "'none'"
    assert directives["frame-ancestors"] == "'none'"
    assert directives["object-src"] == "'none'"
    assert directives["base-uri"] == "'self'"
    assert directives["form-action"] == "'self'"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"
    assert "openai" not in str(response.headers).lower()
    assert "runtime-secret" not in str(response.headers)


def test_unexpected_error_keeps_policy_and_hides_detail(client, monkeypatch):
    def unexpected_error(token):
        raise RuntimeError("private detail")

    monkeypatch.setattr(client.app.state.token_verifier, "verify", unexpected_error)
    response = client.get("/api/v1/session", headers={"Authorization": "Bearer valid-token"})
    assert response.status_code == 500
    assert "private detail" not in response.text
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


@pytest.mark.parametrize("url", [
    "https://user:password@projeto.supabase.co", "https://projeto.supabase.co/path",
    "https://projeto.supabase.co?token=secret", "https://projeto.supabase.co#fragment",
    "https://projeto.supabase.co;script-src", "https://projeto.supabase.co evil.example",
    "https://projeto.supabase.co\r\nX-Evil: secret", "https://projeto.supabase.co\t",
    "https://", "https://*.supabase.co", "https://projeto.supabase.co:0",
    "https://projeto.supabase.co:65536", "https://projeto.supabase.co:",
    "https://projeto.supabase.co\\@evil.example", "https://%70rojeto.supabase.co",
    "https://projeto..supabase.co", "https://-projeto.supabase.co",
])
def test_supabase_configuration_rejects_non_origin_or_unsafe_url(url):
    with pytest.raises(ValidationError) as caught:
        settings(supabase_url=url, supabase_jwt_issuer=f"{url}/auth/v1")
    assert "password" not in str(caught.value)
    assert "secret" not in str(caught.value)


def test_configured_origin_and_port_are_the_only_external_connection():
    origin = "https://custom-auth.example:8443"
    configured = settings(supabase_url=origin, supabase_jwt_issuer=f"{origin}/auth/v1")
    with TestClient(create_app(configured, Verifier())) as client:
        response = client.get("/api/v1/health")
    assert "connect-src 'self' https://custom-auth.example:8443;" in response.headers["content-security-policy"]
