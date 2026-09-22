from __future__ import annotations

from decimal import Decimal
from uuid import UUID

import pytest

from servidor.contracts.diagnostics import DiagnosticRequest
from servidor.contracts.replay import ReplayRequestV1
from servidor.diagnostics.service import (
    RepetitionTask,
    aggregate_diagnostic,
    execute_repetition,
)
from servidor.generate_reference_fixture import build_reference_request
from servidor.replay import ReplayInconsistente, construir_replay

BUILD_SHA = "a" * 40
DIAGNOSTIC_EXECUTION_ID = UUID("00000000-0000-4000-8000-000000000701")
JOB_ID = UUID("00000000-0000-4000-8000-000000000702")
REPETITION_ID = UUID("00000000-0000-4000-8000-000000000703")


def replay_request(preview: dict[str, object] | None = None) -> ReplayRequestV1:
    preview_payload = preview or build_reference_request()
    request = DiagnosticRequest.model_validate(
        {
            "api_version": "1.0.0",
            "request_id": "00000000-0000-4000-8000-000000000704",
            "idempotency_key": str(JOB_ID),
            "study_id": preview_payload["study_id"],
            "scenario_id": preview_payload["scenario_id"],
            "scenario_revision": preview_payload["scenario_revision"],
            "input_fingerprint": "b" * 64,
            "sampling": {
                "kind": "FIXED_INPUT",
                "count": 1,
                "preview_request": preview_payload,
            },
            "selected_repetition_id": str(REPETITION_ID),
            "provenance": preview_payload["proveniencia"],
        }
    )
    result = execute_repetition(RepetitionTask(request, 0, BUILD_SHA))
    envelope = aggregate_diagnostic(JOB_ID, request, (result,))
    return ReplayRequestV1(
        api_version="1.0.0",
        diagnostic_execution_id=DIAGNOSTIC_EXECUTION_ID,
        diagnostic_envelope=envelope,
    )


def payload_with_orders(
    orders: list[dict[str, object]], *, horizon: int, window: int = 1
) -> dict[str, object]:
    payload = build_reference_request()
    payload["cenario"]["ordens"] = orders
    payload["cenario"]["horizonte_dias"] = horizon
    payload["cenario"]["janela_dias"] = window
    payload["periodo"] = {"modo": "LEGADO"}
    provenance = {
        path: value
        for path, value in payload["proveniencia"].items()
        if not path.startswith("/ordens/")
    }
    origin = next(iter(payload["proveniencia"].values()))
    for index, _ in enumerate(orders):
        for field in ("valor_brl", "dia_conhecida", "dia_limite", "eh_efx", "finalidade"):
            provenance[f"/ordens/{index}/{field}"] = dict(origin)
    payload["proveniencia"] = provenance
    return payload


def order(
    order_id: str,
    client_id: str,
    direction: str,
    value: str,
    known: int,
    deadline: int,
) -> dict[str, object]:
    return {
        "id": order_id,
        "cliente_id": client_id,
        "direcao": direction,
        "valor_brl": value,
        "dia_conhecida": known,
        "dia_limite": deadline,
        "eh_efx": False,
        "finalidade": "ANEXO_V_OUTROS",
    }


def test_replay_publica_todos_os_dias_inclusive_vazios_e_identidades_separadas():
    replay = construir_replay(replay_request())

    assert replay.diagnostic_execution_id == DIAGNOSTIC_EXECUTION_ID
    assert replay.repetition_id == REPETITION_ID
    assert [day.day for day in replay.days] == list(
        range(replay.period.settlement_end_day + 1)
    )
    assert any(not day.events and day.closing is None for day in replay.days)
    assert replay.execution_fingerprint == (
        replay_request().diagnostic_envelope.selected_execution.execution_fingerprint
    )


def test_replay_distingue_posicao_e_contribuicao_das_duas_pontas():
    replay = construir_replay(replay_request())
    position = sum(
        (day.closing.matched_position_brl for day in replay.days if day.closing),
        Decimal(0),
    )

    assert replay.totals.execution_matched_position_brl == position
    assert replay.totals.measured_matched_contribution_brl == Decimal(2) * position
    assert replay.totals.netability_fraction == (
        replay.totals.measured_matched_contribution_brl
        / replay.totals.measured_gross_brl
    )


def test_replay_decompoe_autonetting_antes_do_multilateral():
    payload = build_reference_request()
    orders = payload["cenario"]["ordens"]
    orders[1]["cliente_id"] = orders[0]["cliente_id"]
    replay = construir_replay(replay_request(payload))
    origins = [
        segment.matching_origin
        for day in replay.days
        if day.closing
        for segment in day.closing.flow_segments
    ]

    assert origins
    assert origins == sorted(
        origins, key=lambda origin: 0 if origin == "INTRA_CLIENTE" else 1
    )


def test_replay_natural_marca_aquecimento_medicao_e_liquidacao():
    payload = build_reference_request()
    payload["cenario"]["horizonte_dias"] = 4
    payload["periodo"] = {
        "modo": "NATURAL",
        "dias_aquecimento": 1,
        "periodo_medicao_dias": 1,
    }
    measured = dict(payload["cenario"]["ordens"][0])
    measured.update(
        id="measured-1",
        cliente_id="measured-client",
        dia_conhecida=1,
        dia_limite=4,
        valor_brl="100",
    )
    payload["cenario"]["ordens"].append(measured)
    origin = payload["proveniencia"]["/ordens/0/valor_brl"]
    for field in ("valor_brl", "dia_conhecida", "dia_limite", "eh_efx", "finalidade"):
        payload["proveniencia"][f"/ordens/3/{field}"] = dict(origin)

    replay = construir_replay(replay_request(payload))

    assert replay.period.warmup_days == 1
    assert replay.period.measurement_start_day == 1
    assert replay.period.measurement_end_day == 1
    assert replay.period.settlement_end_day == 4
    assert {order.id: order.cohort for order in replay.orders}["measured-1"] == "MEASUREMENT"
    assert replay.totals.measured_gross_brl == Decimal("100")


def test_replay_falha_fechado_quando_resultado_persistido_foi_adulterado():
    request = replay_request()
    selected = request.diagnostic_envelope.selected_execution
    invalid_result = selected.result.model_copy(
        update={
            "agregado": selected.result.agregado.model_copy(
                update={"volume_casado_periodo_brl": Decimal("1")}
            )
        }
    )
    invalid_selected = selected.model_copy(update={"result": invalid_result})
    invalid_diagnostic = request.diagnostic_envelope.model_copy(
        update={"selected_execution": invalid_selected}
    )

    with pytest.raises(ReplayInconsistente, match="casado"):
        construir_replay(request.model_copy(update={"diagnostic_envelope": invalid_diagnostic}))


def test_replay_publica_todos_os_gatilhos_que_coincidem():
    payload = payload_with_orders(
        [
            order("out", "a", "OUT", "40", 0, 0),
            order("in", "b", "IN", "40", 0, 0),
        ],
        horizon=0,
    )

    replay = construir_replay(replay_request(payload))

    assert replay.days[0].closing is not None
    assert replay.days[0].closing.triggers == ["WINDOW", "DEADLINE", "HORIZON_END"]


def test_replay_preserva_parcial_e_remete_saldo_no_prazo():
    payload = payload_with_orders(
        [
            order("out", "a", "OUT", "100", 0, 2),
            order("in", "b", "IN", "40", 0, 0),
        ],
        horizon=2,
    )

    replay = construir_replay(replay_request(payload))

    assert replay.days[0].end_state.open_out_brl == Decimal("60")
    day_two = replay.days[2]
    assert day_two.closing is not None
    assert day_two.closing.remitted_out_brl == Decimal("60")
    assert day_two.end_state.open_out_brl == 0


def test_replay_segmenta_empate_edf_por_id():
    payload = payload_with_orders(
        [
            order("out-b", "b", "OUT", "50", 0, 0),
            order("out-a", "a", "OUT", "50", 0, 0),
            order("in", "c", "IN", "50", 0, 0),
        ],
        horizon=0,
    )

    replay = construir_replay(replay_request(payload))

    closing = replay.days[0].closing
    assert closing is not None
    assert closing.flow_segments[0].out_order_id == "out-a"


def test_replay_mostra_drenagem_final_de_ordem_com_prazo_alem_do_horizonte():
    payload = payload_with_orders(
        [order("out", "a", "OUT", "75", 0, 5)], horizon=2, window=7
    )

    replay = construir_replay(replay_request(payload))

    closing = replay.days[2].closing
    assert closing is not None
    assert closing.triggers == ["HORIZON_END"]
    assert closing.remitted_out_brl == Decimal("75")
