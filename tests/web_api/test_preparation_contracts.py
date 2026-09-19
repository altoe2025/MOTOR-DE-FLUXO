"""Contratos estritos da preparação de carteiras autoradas e sintéticas."""

from copy import deepcopy

import pytest
from pydantic import ValidationError

import servidor.contracts as public_contracts
from servidor.contracts.preparation import PreparationRequest, PreparationResponse

PARTICIPANT_ID = "00000000-0000-4000-8000-000000000013"


def _source(kind: str = "PADRAO_SINTETICO") -> dict[str, object]:
    return {
        "kind": kind,
        "source": "Fixture sintética MOT-23",
        "recorded_at": "2026-09-13T00:00:00Z",
    }


def _participant(participant_id: str = PARTICIPANT_ID) -> dict[str, object]:
    return {
        "id": participant_id,
        "profile": "remessa_outbound_massiva",
        "seed": "1",
        "monthly_volume_brl": "10000",
        "ticket_median_brl": "1000",
        "out_fraction": "0.5",
        "deadline": {"mode": "FIXED", "days": 7},
        "eh_efx": True,
        "purpose_out": "ANEXO_V_REMESSA_TERCEIRO",
        "purpose_in": "ANEXO_V_DISPONIBILIDADE",
    }


def _participant_source_paths(participant_id: str) -> set[str]:
    prefix = f"/participants/{participant_id}"
    return {
        f"{prefix}/profile",
        f"{prefix}/seed",
        f"{prefix}/monthly_volume_brl",
        f"{prefix}/ticket_median_brl",
        f"{prefix}/out_fraction",
        f"{prefix}/deadline/mode",
        f"{prefix}/deadline/days",
        f"{prefix}/eh_efx",
        f"{prefix}/purpose_out",
        f"{prefix}/purpose_in",
    }


def _request_payload() -> dict[str, object]:
    source_paths = {
        *_participant_source_paths(PARTICIPANT_ID),
        "/warmup_days",
        "/measurement_days",
        "/window_days",
        "/costs/iof_out",
        "/costs/iof_in",
        "/costs/carry_cnr",
        "/costs/spread_rail_bps",
        "/costs/custo_fixo_remessa",
        "/costs/custo_oportunidade_aa",
        "/costs/ptax",
    }
    return {
        "preparation_version": "1.0.0",
        "request_id": "00000000-0000-4000-8000-000000000010",
        "study_id": "00000000-0000-4000-8000-000000000011",
        "scenario_id": "00000000-0000-4000-8000-000000000012",
        "scenario_revision": 1,
        "expected_build_sha": "a" * 40,
        "input": {
            "participants": [_participant()],
            "warmup_days": 0,
            "measurement_days": 30,
            "window_days": 7,
            "costs": {
                "iof_out": "0.035",
                "iof_in": "0.0038",
                "carry_cnr": "0.0004",
                "spread_rail_bps": "0",
                "custo_fixo_remessa": "0",
                "custo_oportunidade_aa": "0",
                "ptax": "5.40",
                "iof_por_finalidade": [],
            },
            "sources": {path: _source() for path in source_paths},
        },
    }


def _response_payload(request: PreparationRequest) -> dict[str, object]:
    return {
        "preparation_version": "1.0.0",
        "preparation_id": "00000000-0000-4000-8000-000000000014",
        "request_id": str(request.request_id),
        "study_id": str(request.study_id),
        "scenario_id": str(request.scenario_id),
        "scenario_revision": request.scenario_revision,
        "created_at": "2026-09-13T00:00:00Z",
        "motor_build_sha": "a" * 40,
        "generator_version": "dimensionamento-v1",
        "generation_fingerprint": "b" * 64,
        "input_snapshot": request.input.model_dump(mode="json"),
        "orders": [
            {
                "id": "ordem-1",
                "cliente_id": "cliente-1",
                "direcao": "OUT",
                "valor_brl": "1234.560000",
                "dia_conhecida": 0,
                "dia_limite": 7,
                "eh_efx": True,
                "finalidade": "ANEXO_V_REMESSA_TERCEIRO",
            }
        ],
        "parameters": [
            {
                "participant_id": PARTICIPANT_ID,
                "sigma": "0.5",
                "cadence_monthly": "8.824969025845",
                "expected_period_brl": "10000",
                "deadline_min": 7,
                "deadline_max": 7,
            }
        ],
        "composition": [
            {
                "participant_id": PARTICIPANT_ID,
                "order_count": 1,
                "out_brl": "1234.560000",
                "in_brl": "0",
                "total_brl": "1234.560000",
                "out_fraction": "1",
            },
            {
                "participant_id": None,
                "order_count": 1,
                "out_brl": "1234.560000",
                "in_brl": "0",
                "total_brl": "1234.560000",
                "out_fraction": "1",
            },
        ],
        "derived_provenance": {
            f"/parameters/{PARTICIPANT_ID}/cadence_monthly": {
                "rule": "dimensionamento-v1",
                "inputs": [
                    f"/participants/{PARTICIPANT_ID}/monthly_volume_brl",
                    f"/participants/{PARTICIPANT_ID}/ticket_median_brl",
                ],
            }
        },
    }


def _request_input(payload: dict[str, object]) -> dict[str, object]:
    return payload["input"]  # type: ignore[return-value]


def _request_participant(payload: dict[str, object]) -> dict[str, object]:
    return _request_input(payload)["participants"][0]  # type: ignore[index]


def test_request_valido_preserva_seed_decimal_e_periodo_sem_coercao():
    payload = _request_payload()
    _request_participant(payload)["seed"] = "9223372036854775807"

    request = PreparationRequest.model_validate(payload)

    participant = request.input.participants[0]
    assert participant.seed == "9223372036854775807"
    assert participant.monthly_volume_brl == "10000"
    assert participant.ticket_median_brl == "1000"
    assert request.input.warmup_days == 0
    assert request.input.measurement_days == 30
    assert request.input.window_days == 7


@pytest.mark.parametrize("seed", [1, -1, "-1", "9223372036854775808", True])
def test_request_rejeita_seed_nao_canonica_ou_fora_do_limite(seed: object):
    payload = _request_payload()
    _request_participant(payload)["seed"] = seed

    with pytest.raises(ValidationError):
        PreparationRequest.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("monthly_volume_brl", 10000),
        ("monthly_volume_brl", "1.0000001"),
        ("monthly_volume_brl", "0"),
        ("ticket_median_brl", "0.001"),
        ("ticket_median_brl", "1000000000001"),
        ("out_fraction", "0.0000000000001"),
        ("out_fraction", "1.1"),
    ],
)
def test_request_rejeita_decimal_com_tipo_precisao_ou_limite_invalido(
    field: str, value: object
):
    payload = _request_payload()
    _request_participant(payload)[field] = value

    with pytest.raises(ValidationError):
        PreparationRequest.model_validate(payload)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("participants", 0, "deadline", "days"), 366),
        (("warmup_days",), True),
        (("measurement_days",), 366),
        (("window_days",), 731),
    ],
)
def test_request_rejeita_periodo_fora_dos_limites_e_bool_como_inteiro(
    path: tuple[object, ...], value: object
):
    payload = _request_payload()
    current: object = _request_input(payload)
    for segment in path[:-1]:
        current = current[segment]  # type: ignore[index]
    current[path[-1]] = value  # type: ignore[index]

    with pytest.raises(ValidationError):
        PreparationRequest.model_validate(payload)


def test_request_rejeita_mais_de_cem_participantes():
    payload = _request_payload()
    input_payload = _request_input(payload)
    participants = input_payload["participants"]  # type: ignore[assignment]
    sources = input_payload["sources"]  # type: ignore[assignment]
    for index in range(14, 114):
        participant_id = f"00000000-0000-4000-8000-{index:012d}"
        participants.append(_participant(participant_id))
        for path in _participant_source_paths(participant_id):
            sources[path] = _source()

    with pytest.raises(ValidationError):
        PreparationRequest.model_validate(payload)


@pytest.mark.parametrize("mutation", ["missing", "extra"])
def test_request_exige_fontes_exatas(mutation: str):
    payload = _request_payload()
    sources = _request_input(payload)["sources"]
    if mutation == "missing":
        del sources[f"/participants/{PARTICIPANT_ID}/profile"]
    else:
        sources["/participants/desconhecido/profile"] = _source()

    with pytest.raises(ValidationError):
        PreparationRequest.model_validate(payload)


def test_request_aceita_origem_explicita_da_seed_determinante():
    payload = _request_payload()
    seed_path = f"/participants/{PARTICIPANT_ID}/seed"
    _request_input(payload)["sources"][seed_path] = _source()

    request = PreparationRequest.model_validate(payload)

    assert request.input.sources[seed_path].kind == "PADRAO_SINTETICO"


def test_request_exige_origem_da_seed_determinante():
    payload = _request_payload()
    seed_path = f"/participants/{PARTICIPANT_ID}/seed"
    sources = _request_input(payload)["sources"]
    sources[seed_path] = _source()
    del sources[seed_path]

    with pytest.raises(ValidationError):
        PreparationRequest.model_validate(payload)


def test_request_e_resposta_rejeitam_campos_extras_em_qualquer_nivel():
    request_payload = _request_payload()
    _request_participant(request_payload)["unexpected"] = True
    with pytest.raises(ValidationError):
        PreparationRequest.model_validate(request_payload)

    request = PreparationRequest.model_validate(_request_payload())
    response_payload = _response_payload(request)
    response_payload["preview"] = {"kind": "PREVIA"}
    with pytest.raises(ValidationError):
        PreparationResponse.model_validate(response_payload)


def test_response_retorna_ordens_canonicas_composicao_versao_e_fingerprint():
    request = PreparationRequest.model_validate(_request_payload())

    response = PreparationResponse.model_validate(_response_payload(request))

    assert response.preparation_version == "1.0.0"
    assert response.generation_fingerprint == "b" * 64
    assert response.orders[0].valor_brl == "1234.560000"
    assert response.composition[-1].participant_id is None
    assert response.composition[-1].total_brl == "1234.560000"
    assert not hasattr(response, "result")


def test_barrel_publico_exporta_somente_os_envelopes_de_preparacao():
    assert public_contracts.PreparationRequest is PreparationRequest
    assert public_contracts.PreparationResponse is PreparationResponse
    assert "EffectiveInput" not in public_contracts.__all__
    assert "CatalogResponse" not in public_contracts.__all__
    assert "Capabilities" not in public_contracts.__all__


def test_response_rejeita_fingerprint_tipo_e_formato_invalidos():
    request = PreparationRequest.model_validate(_request_payload())

    for invalid in (1, "B" * 64, "b" * 63):
        payload = deepcopy(_response_payload(request))
        payload["generation_fingerprint"] = invalid
        with pytest.raises(ValidationError):
            PreparationResponse.model_validate(payload)
