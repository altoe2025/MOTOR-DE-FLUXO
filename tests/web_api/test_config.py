"""Chat configuration is optional and never prints its runtime secret."""

import pytest
from pydantic import ValidationError

from servidor.config import Settings
from tests.web_api.test_auth import settings


def test_chat_disabled_without_credentials():
    configured = settings()
    assert configured.chat_enabled is False
    assert configured.openai_api_key is None


@pytest.mark.parametrize("changes", [
    {}, {"openai_api_key": "runtime-secret"}, {"openai_chat_model": "test-model"},
    {"openai_api_key": " ", "openai_chat_model": "test-model"},
    {"openai_api_key": "runtime-secret", "openai_chat_model": " "},
])
def test_enabled_chat_requires_key_and_model_without_printing_secret(changes):
    with pytest.raises(ValidationError) as caught:
        settings(chat_enabled=True, **changes)
    assert "runtime-secret" not in str(caught.value)
    assert "runtime-secret" not in repr(caught.value)


@pytest.mark.parametrize("field,value", [
    ("openai_chat_timeout_seconds", 0), ("openai_chat_timeout_seconds", -1),
    ("openai_chat_timeout_seconds", float("inf")),
    ("openai_chat_timeout_seconds", float("nan")),
    ("openai_chat_max_output_tokens", 0), ("openai_chat_max_output_tokens", 4097),
])
def test_chat_rejects_invalid_resource_limits_without_secret(field, value):
    with pytest.raises(ValidationError) as caught:
        settings(openai_api_key="runtime-secret", **{field: value})
    assert "runtime-secret" not in str(caught.value)


def test_chat_reads_environment_and_excludes_secret_from_serialization(monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "runtime-secret")
    monkeypatch.setenv("OPENAI_CHAT_MODEL", "test-model")
    monkeypatch.setenv("OPENAI_CHAT_TIMEOUT_SECONDS", "1.5")
    monkeypatch.setenv("OPENAI_CHAT_MAX_OUTPUT_TOKENS", "4096")
    configured = Settings(**settings().model_dump(exclude={
        "chat_enabled", "openai_api_key", "openai_chat_model",
        "openai_chat_timeout_seconds", "openai_chat_max_output_tokens",
    }), _env_file=None)
    assert configured.chat_enabled is True
    assert configured.openai_api_key.get_secret_value() == "runtime-secret"
    assert configured.openai_chat_model == "test-model"
    assert configured.openai_chat_timeout_seconds == 1.5
    assert configured.openai_chat_max_output_tokens == 4096
    assert "runtime-secret" not in repr(configured)
    assert "runtime-secret" not in str(configured.model_dump())
    assert "runtime-secret" not in configured.model_dump_json()
