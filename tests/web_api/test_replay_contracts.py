from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from servidor.contracts.replay import ReplayClosingV1, ReplayFlowSegmentV1


def _segment(value: str = "40") -> ReplayFlowSegmentV1:
    return ReplayFlowSegmentV1(
        closing_day=3,
        out_order_id="out-1",
        in_order_id="in-1",
        value_brl=value,
        matching_origin="INTER_CLIENTE",
        meaning="ILLUSTRATIVE_AGGREGATE_DECOMPOSITION",
    )


def _closing(**changes: object) -> dict[str, object]:
    value: dict[str, object] = {
        "triggers": ["WINDOW"],
        "gross_out_brl": "40",
        "gross_in_brl": "40",
        "matched_position_brl": "40",
        "matched_contribution_brl": "80",
        "intra_client_position_brl": "0",
        "inter_client_position_brl": "40",
        "remitted_out_brl": "0",
        "remitted_in_brl": "0",
        "flow_segments": [_segment().model_dump(mode="json")],
    }
    value.update(changes)
    return value


def test_fechamento_aceita_gatilhos_simultaneos_em_ordem_canonica():
    closing = ReplayClosingV1.model_validate(
        _closing(triggers=["WINDOW", "DEADLINE", "HORIZON_END"])
    )

    assert closing.triggers == ["WINDOW", "DEADLINE", "HORIZON_END"]


@pytest.mark.parametrize(
    "changes, message",
    [
        ({"triggers": ["DEADLINE", "WINDOW"]}, "ordem canônica"),
        ({"matched_contribution_brl": "40"}, "duas pontas"),
        ({"inter_client_position_brl": "39"}, "fases"),
        ({"flow_segments": [_segment("39").model_dump(mode="json")]}, "segmentos"),
    ],
)
def test_fechamento_rejeita_contrato_que_nao_reconcilia(changes, message):
    with pytest.raises(ValidationError, match=message):
        ReplayClosingV1.model_validate(_closing(**changes))


def test_decimal_do_replay_permanece_exato():
    closing = ReplayClosingV1.model_validate(
        _closing(
            gross_out_brl="0.3",
            gross_in_brl="0.3",
            matched_position_brl="0.3",
            matched_contribution_brl="0.6",
            inter_client_position_brl="0.3",
            flow_segments=[_segment("0.3").model_dump(mode="json")],
        )
    )

    assert closing.matched_contribution_brl == Decimal("0.6")

