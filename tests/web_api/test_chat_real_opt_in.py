"""Manual paid smoke only: explicit opt-in, dedicated key/model, synthetic input.

Never enable in ordinary CI. Run explicitly with MOTOR_CHAT_REAL_OPT_IN=1,
MOTOR_CHAT_REAL_API_KEY and MOTOR_CHAT_REAL_MODEL set outside shell history.
"""

import asyncio
import os

import pytest

from servidor.catalogs.product_help import load_product_help_catalog
from servidor.chat.openai_provider import OpenAIChatProvider
from servidor.chat.service import respond
from servidor.contracts.chat import ChatRequestV1
from tests.web_api.test_auth import settings
from tests.web_api.test_chat_contracts import payload


@pytest.mark.skipif(
    os.environ.get("MOTOR_CHAT_REAL_OPT_IN") != "1" or bool(os.environ.get("CI")),
    reason="real provider is manual opt-in only and disabled in CI",
)
def test_real_provider_synthetic_interface_question():
    key = os.environ.get("MOTOR_CHAT_REAL_API_KEY")
    model = os.environ.get("MOTOR_CHAT_REAL_MODEL")
    if not key or not model:
        pytest.fail("real smoke requires its dedicated credential and model", pytrace=False)
    configured = settings(chat_enabled=True, openai_api_key=key, openai_chat_model=model,
                          openai_chat_max_output_tokens=512, openai_chat_timeout_seconds=30)
    source = payload()
    source["message"] = "No Motor de Fluxo, para que serve a tela de importação?"
    source["routeContext"]["routeId"] = "import"
    source["routeContext"]["helpId"] = "page.importacao"

    async def run():
        provider = OpenAIChatProvider(configured)
        try:
            return await respond(ChatRequestV1.model_validate(source), provider=provider,
                                 timeout_seconds=60, catalog=load_product_help_catalog())
        finally:
            await provider.aclose()

    response = asyncio.run(run())
    assert response.classification == "IN_SCOPE"
    assert response.answer
    assert any(item.kind == "HELP" and item.id == "page.importacao"
               for item in response.citations)
    if key in response.model_dump_json():
        pytest.fail("provider credential appeared in public response", pytrace=False)
