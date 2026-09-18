"""O esquema é gerável sem segredos, rede ou execução do motor."""

import json
from asyncio import run
from uuid import UUID

import httpx

from servidor.app import create_schema_app
from servidor.auth import AuthenticatedUser
from servidor.config import Settings
from servidor.export_openapi import export_openapi


def post_preview(payload):
    async def request():
        transport = httpx.ASGITransport(app=create_schema_app())
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            return await client.post(
                "/api/v1/previas",
                json=payload,
                headers={"Authorization": "Bearer schema-test"},
            )

    return run(request())


def test_openapi_exports_stable_contracts(tmp_path):
    first = tmp_path / "one.json"
    second = tmp_path / "two.json"
    export_openapi(first)
    export_openapi(second)
    assert first.read_bytes() == second.read_bytes()
    schema = json.loads(first.read_text(encoding="utf-8"))
    assert "PreviaRequest" in schema["components"]["schemas"]
    assert "PreviewEnvelope" in schema["components"]["schemas"]
    assert "HealthResponse" in schema["components"]["schemas"]
    assert "SessionResponse" in schema["components"]["schemas"]
    assert "/api/v1/health" in schema["paths"]
    assert "/api/v1/session" in schema["paths"]


def test_preview_identity_fields_are_constrained_in_schema(tmp_path):
    destination = tmp_path / "openapi.json"
    export_openapi(destination)
    properties = json.loads(destination.read_text(encoding="utf-8"))["components"][
        "schemas"
    ]["PreviewEnvelope"]["properties"]
    assert properties["scenario_revision"]["minimum"] == 1
    assert properties["execution_fingerprint"]["pattern"] == "^[0-9a-f]{64}$"
    assert properties["provenance_fingerprint"]["pattern"] == "^[0-9a-f]{64}$"
    assert properties["motor_build_sha"]["pattern"] == "^[0-9a-f]{40}$"


def test_http_rejects_numeric_money_before_placeholder_handler(reference_payload):
    reference_payload["cenario"]["ordens"][0]["valor_brl"] = 10800000.0
    response = post_preview(reference_payload)
    assert response.status_code == 422


def test_valid_preview_request_reaches_closed_schema_handler(reference_payload):
    response = post_preview(reference_payload)
    assert response.status_code == 501


def test_aplicacao_real_serve_o_mesmo_openapi_canonico_com_bearer():
    from servidor.app import create_app

    user_id = UUID("00000000-0000-4000-8000-000000000101")

    class Verifier:
        def verify(self, token: str) -> AuthenticatedUser:
            return AuthenticatedUser(user_id)

    settings = Settings.model_validate(
        {
            "app_env": "test",
            "supabase_url": "https://projeto.supabase.co",
            "supabase_jwt_issuer": "https://projeto.supabase.co/auth/v1",
            "supabase_jwt_audience": "authenticated",
            "supabase_allowed_user_ids": frozenset({user_id}),
            "motor_build_sha": "a" * 40,
        }
    )

    canonical = create_schema_app().openapi()
    served = create_app(settings, Verifier()).openapi()

    assert served == canonical
    assert "HTTPBearer" in canonical["components"]["securitySchemes"]
    assert "security" not in canonical["paths"]["/api/v1/health"]["get"]
    for path, method in (
        ("/api/v1/session", "get"),
        ("/api/v1/examples/reference", "get"),
        ("/api/v1/previas", "post"),
    ):
        assert canonical["paths"][path][method]["security"] == [{"HTTPBearer": []}]
    preview = canonical["paths"]["/api/v1/previas"]["post"]
    assert preview["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/PreviaRequest"
    }
    assert preview["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/PreviewEnvelope"
    }


def test_catalogo_importacao_consta_no_openapi_canonico(tmp_path):
    destination = tmp_path / "openapi.json"
    export_openapi(destination)
    schema = json.loads(destination.read_text(encoding="utf-8"))
    operation = schema["paths"]["/api/v1/catalogos/importacao"]["get"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert operation["responses"]["200"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/CatalogoImportacao"}
    catalog = schema["components"]["schemas"]["CatalogoImportacao"]
    assert catalog["additionalProperties"] is False
    assert catalog["properties"]["catalog_version"]["pattern"] == "^[0-9a-f]{64}$"
    assert catalog["properties"]["custos_calibrados"]["const"] is False
