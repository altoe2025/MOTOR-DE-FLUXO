"""UI observations stay bounded and separate from catalog rules and financial evidence."""
import pytest
from pydantic import ValidationError

from servidor.catalogs.product_help import load_product_help_catalog
from servidor.chat.tools import ReadOnlyTools
from servidor.contracts.chat import ChatRequestV1
from tests.web_api.test_chat_contracts import payload


def source(controls):
    value = payload()
    value['routeContext']['uiControls'] = controls
    return ChatRequestV1.model_validate(value)


def test_interface_tool_explains_without_financial_document_and_reports_observed_state():
    request = source([{'helpId': 'page.chat', 'enabledCount': 0, 'disabledCount': 1}])
    tools = ReadOnlyTools(request, load_product_help_catalog())
    result = tools.execute('consultar_interface', '{"helpId":"page.chat"}')
    assert result['available'] is True
    assert result['observedState'] == {'enabledCount': 0, 'disabledCount': 1}
    assert result['data']['purpose']
    tools.validate_references([], [], served_only=True)


def test_unobserved_control_is_unknown_not_assumed_enabled():
    result = ReadOnlyTools(source([]), load_product_help_catalog()).execute(
        'consultar_interface', '{"helpId":"page.chat"}')
    assert result['observedState'] is None


def test_legacy_requests_without_ui_state_remain_accepted():
    value = payload()
    value['routeContext'].pop('uiControls', None)
    assert ChatRequestV1.model_validate(value).routeContext.uiControls == []


@pytest.mark.parametrize('controls', [
    [{'helpId': 'page.chat', 'enabledCount': -1, 'disabledCount': 1}],
    [{'helpId': 'page.chat', 'enabledCount': 0, 'disabledCount': 0}],
    [{'helpId': 'page.chat', 'enabledCount': 1, 'disabledCount': 0, 'value': 'private'}],
    [{'helpId': 'page.chat', 'enabledCount': 1, 'disabledCount': 0}] * 201,
    [{'helpId': 'page.chat', 'enabledCount': 1, 'disabledCount': 0}] * 2,
])
def test_rejects_unbounded_ambiguous_or_private_ui_state(controls):
    with pytest.raises(ValidationError):
        source(controls)
