"""Contrato declarativo: um piloto gratuito, sem provisionamento automático."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def test_blueprint_declara_apenas_web_free_sem_recursos_adicionais():
    blueprint = yaml.safe_load((ROOT / "render.yaml").read_text(encoding="utf-8"))
    assert set(blueprint) == {"services"}
    assert len(blueprint["services"]) == 1
    service = blueprint["services"][0]
    assert set(service) == {
        "type", "name", "runtime", "plan", "dockerfilePath", "dockerContext",
        "healthCheckPath", "autoDeployTrigger", "envVars",
    }
    assert service["type"] == "web"
    assert service["runtime"] == "docker"
    assert service["plan"] == "free"
    assert service["dockerfilePath"] == "./Dockerfile"
    assert service["dockerContext"] == "."
    assert service["healthCheckPath"] == "/api/v1/health"
    assert service["autoDeployTrigger"] == "off"


def test_blueprint_exige_configuracao_manual_sem_segredos_ou_porta_fixa():
    blueprint = yaml.safe_load((ROOT / "render.yaml").read_text(encoding="utf-8"))
    entries = blueprint["services"][0]["envVars"]
    env = {entry["key"]: entry for entry in entries}
    assert len(entries) == len(env)
    manual = {
        "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_MOTOR_BUILD_SHA",
        "SUPABASE_URL", "SUPABASE_JWT_ISSUER", "SUPABASE_JWT_AUDIENCE",
        "SUPABASE_ALLOWED_USER_IDS", "MOTOR_BUILD_SHA", "OPENAI_API_KEY",
        "OPENAI_CHAT_MODEL",
    }
    fixed = {
        "APP_ENV": "production", "CHAT_ENABLED": "true", "HOST": "0.0.0.0",
        "WEB_DIST_DIR": "/app/web/dist",
    }
    assert set(env) == manual | set(fixed)
    for key in manual:
        assert env[key] == {"key": key, "sync": False}
    for key, value in fixed.items():
        assert env[key] == {"key": key, "value": value}
