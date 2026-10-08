"""Manual paid smoke only: explicit opt-in, dedicated key/model, synthetic input.

Never enable in ordinary CI. Run explicitly with MOTOR_CHAT_REAL_OPT_IN=1,
MOTOR_CHAT_REAL_API_KEY and MOTOR_CHAT_REAL_MODEL set outside shell history.
"""

import asyncio
import os
from copy import deepcopy

import pytest

from servidor.catalogs.product_help import load_product_help_catalog
from servidor.chat.openai_provider import OpenAIChatProvider
from servidor.chat.service import respond
from servidor.contracts.chat import ChatRequestV1
from tests.web_api.test_auth import settings
from tests.web_api.test_chat_contracts import board_payload, payload
from tests.web_api.test_communication_contracts import sign


@pytest.mark.skipif(
    os.environ.get("MOTOR_CHAT_REAL_OPT_IN") != "1" or bool(os.environ.get("CI")),
    reason="real provider is manual opt-in only and disabled in CI",
)
def test_real_provider_synthetic_interface_follow_up_and_board_questions():
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

    follow_up = payload()
    follow_up["messageId"] = "message-2"
    follow_up["message"] = "E por quê?"
    follow_up["routeContext"]["routeId"] = "import"
    follow_up["routeContext"]["helpId"] = "page.importacao"
    board = board_payload()
    board["messageId"] = "message-3"
    board["message"] = "Qual cenário tem maior economia entre os selecionados?"
    document = board["context"]["document"]
    second = {**deepcopy(document["rows"][0]), "rowKey": "study-b:scenario-b",
              "studyId": "study-b", "scenarioId": "scenario-b", "executionId": "execution-b",
              "studyName": "Estudo B", "scenarioName": "Cenário B", "savingsBrl": "6.25"}
    document["rows"].append(second)
    for field, value in second.items():
        if field != "rowKey":
            document["evidenceIndex"][f"BOARD:{second['rowKey']}:{field}"] = {
                "rowKey": second["rowKey"], "field": field, "value": str(value),
            }
    sign(document)

    async def run():
        provider = OpenAIChatProvider(configured)
        try:
            catalog = load_product_help_catalog()
            first = await respond(ChatRequestV1.model_validate(source), provider=provider,
                                  timeout_seconds=60, catalog=catalog)
            follow_up["history"] = [
                {"role": "USER", "text": source["message"], "contextFingerprint": None},
                {"role": "ASSISTANT", "text": first.answer, "contextFingerprint": None},
            ]
            second_response = await respond(
                ChatRequestV1.model_validate(follow_up), provider=provider,
                timeout_seconds=60, catalog=catalog,
            )
            board_response = await respond(
                ChatRequestV1.model_validate(board), provider=provider,
                timeout_seconds=60, catalog=catalog,
            )
            for question, help_id in [
                ('O que faz o botão Criar variação?', 'control.alavancas.criar'),
                ('O que faz Rodar todas e por que pode estar desabilitado?',
                 'control.diagnostico.rodar-todas'),
                ('O que faz Limpar quadro? Apaga os estudos?', 'control.quadro.limpar'),
            ]:
                interface = payload()
                interface['message'] = question
                interface['routeContext']['helpId'] = help_id
                answer = await respond(ChatRequestV1.model_validate(interface), provider=provider,
                                       timeout_seconds=60, catalog=catalog)
                assert answer.classification == 'IN_SCOPE'
                assert any(item.kind == 'HELP' and item.id == help_id for item in answer.citations)
            return first, second_response, board_response
        finally:
            await provider.aclose()

    response, follow_up_response, board_response = asyncio.run(run())
    assert response.classification == "IN_SCOPE"
    assert response.answer
    assert any(item.kind == "HELP" and item.id == "page.importacao"
               for item in response.citations)
    assert follow_up_response.classification == "IN_SCOPE"
    assert follow_up_response.answer and follow_up_response.citations
    assert board_response.classification == "IN_SCOPE"
    assert board_response.answer
    assert any(item.kind == "EVIDENCE" and item.id.startswith("BOARD:")
               for item in board_response.citations)
    if key in "".join(item.model_dump_json() for item in (
            response, follow_up_response, board_response)):
        pytest.fail("provider credential appeared in public response", pytrace=False)
