"""Contratos fechados para autoria efetiva, preparação e catálogo."""

import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from servidor.app import create_schema_app
from servidor.contracts.preparation import (
    Capabilities,
    CatalogResponse,
    PreparationRequest,
    PreparationResponse,
)

PARTICIPANT_ID = "00000000-0000-4000-8000-000000000013"
PROFILE_IDS = (
    "remessa_outbound_massiva",
    "psp_inbound",
    "cripto_native_sem_fiat",
    "payroll_fornecedor",
    "exportador",
    "tesouraria_corporativa",
)
EXAMPLE_LABELS = {
    "equilibrado": "Composição diversificada",
    "retail_pesado": "Muitas operações frequentes de menor valor",
    "corporativo_pesado": "Empresas de maior volume",
    "psp_dominante": "Recebimentos concentrados em plataformas",
    "outbound_extremo": "Pagamentos ao exterior predominantes",
}


def _assert_invalid(payload: dict[str, object]) -> ValidationError:
    with pytest.raises(ValidationError) as captured:
        PreparationRequest.model_validate(payload)
    return captured.value


def _participant(payload: dict[str, object]) -> dict[str, object]:
    return payload["input"]["participants"][0]  # type: ignore[index]


def _input(payload: dict[str, object]) -> dict[str, object]:
    return payload["input"]  # type: ignore[return-value]


def _sources(payload: dict[str, object]) -> dict[str, object]:
    return _input(payload)["sources"]  # type: ignore[return-value]


def _add_participant(payload: dict[str, object], index: int) -> None:
    original_id = PARTICIPANT_ID
    new_id = f"00000000-0000-4000-8000-{index:012d}"
    participant = deepcopy(_participant(payload))
    participant["id"] = new_id
    _input(payload)["participants"].append(participant)  # type: ignore[union-attr]
    sources = _sources(payload)
    for path, origin in list(sources.items()):
        prefix = f"/participants/{original_id}/"
        if path.startswith(prefix):
            sources[path.replace(prefix, f"/participants/{new_id}/")] = deepcopy(origin)


def _catalog_payload(authored_request) -> dict[str, object]:
    profiles = [
        {
            "id": profile,
            "ticket_median_brl": "1000",
            "sigma": "0.5",
            "cadence_monthly": "1",
            "monthly_volume_brl": "1133.148453",
            "out_fraction": "0.5",
            "deadline_min": 0,
            "deadline_max": 30,
            "eh_efx": False,
            "purpose_out": "ANEXO_V_DISPONIBILIDADE",
            "purpose_in": "ANEXO_V_DISPONIBILIDADE",
        }
        for profile in PROFILE_IDS
    ]
    weights = {profile: "1" for profile in PROFILE_IDS}
    examples = []
    for example_index, (example_id, label) in enumerate(EXAMPLE_LABELS.items()):
        participants = [
            {
                "template_id": f"{example_id}-{participant_index}",
                "profile": PROFILE_IDS[participant_index % len(PROFILE_IDS)],
                "seed": str(example_index * 12 + participant_index),
            }
            for participant_index in range(12)
        ]
        examples.append(
            {
                "id": example_id,
                "label": label,
                "weights": weights,
                "participants": participants,
            }
        )
    return {
        "catalog_version": "1.0.0",
        "motor_build_sha": "a" * 40,
        "profiles": profiles,
        "examples": examples,
        "costs": authored_request.input.costs.model_dump(mode="json"),
        "source": "motor.arquetipos.TODOS; motor.mixes.TODOS; motor.varredura.PARAMETROS_VARREDURA",
        "recorded_at": "2026-09-13T00:00:00Z",
    }


def test_authored_fixture_is_valid_and_deepcopied(authored_payload):
    dto = PreparationRequest.model_validate(authored_payload)
    assert dto.input.participants[0].monthly_volume_brl == "10000"
    authored_payload["input"]["participants"][0]["seed"] = "99"
    stored = json.loads(
        Path("contracts/fixtures/authored-input.json").read_text(encoding="utf-8")
    )
    assert stored["input"]["participants"][0]["seed"] == "1"


def test_seed_preserva_inteiro_acima_do_limite_js(authored_payload):
    authored_payload["input"]["participants"][0]["seed"] = "9223372036854775807"
    dto = PreparationRequest.model_validate(authored_payload)
    assert dto.input.participants[0].seed == "9223372036854775807"


@pytest.mark.parametrize("seed", [1, -1, "-1", "9223372036854775808", True])
def test_seed_rejeita_tipo_sinal_e_limite(authored_payload, seed):
    _participant(authored_payload)["seed"] = seed
    _assert_invalid(authored_payload)


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
def test_decimais_rejeitam_tipo_precisao_e_limites(authored_payload, field, value):
    _participant(authored_payload)[field] = value
    _assert_invalid(authored_payload)


def test_rejeita_perfil_desconhecido(authored_payload):
    _participant(authored_payload)["profile"] = "perfil_inexistente"
    _assert_invalid(authored_payload)


def test_rejeita_ids_de_participante_duplicados(authored_payload):
    duplicate = deepcopy(_participant(authored_payload))
    _input(authored_payload)["participants"].append(duplicate)  # type: ignore[union-attr]
    _assert_invalid(authored_payload)


def test_rejeita_cento_e_um_participantes(authored_payload):
    for index in range(14, 114):
        _add_participant(authored_payload, index)
    _assert_invalid(authored_payload)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("participants", 0, "deadline", "days"), 366),
        (("warmup_days",), True),
        (("measurement_days",), 366),
        (("window_days",), 731),
    ],
)
def test_rejeita_prazos_e_booleano_como_inteiro(authored_payload, path, value):
    current = _input(authored_payload)
    for segment in path[:-1]:
        current = current[segment]  # type: ignore[index,assignment]
    current[path[-1]] = value  # type: ignore[index]
    _assert_invalid(authored_payload)


def test_rejeita_soma_temporal_731(authored_payload):
    _input(authored_payload)["warmup_days"] = 365
    _input(authored_payload)["measurement_days"] = 366
    _assert_invalid(authored_payload)


@pytest.mark.parametrize("mutation", ["missing", "extra"])
def test_rejeita_fontes_ausentes_ou_extras(authored_payload, mutation):
    sources = _sources(authored_payload)
    if mutation == "missing":
        del sources[f"/participants/{PARTICIPANT_ID}/profile"]
    else:
        sources["/participants/desconhecido/profile"] = deepcopy(next(iter(sources.values())))
    error = _assert_invalid(authored_payload)
    safe_errors = error.errors(include_input=False, include_context=False)
    expected_code = "ORIGEM_AUSENTE" if mutation == "missing" else "ORIGEM_INVALIDA"
    expected_id = PARTICIPANT_ID if mutation == "missing" else "desconhecido"
    assert safe_errors == [
        {
            "type": expected_code,
            "loc": ("input", "participants", expected_id, "profile"),
            "msg": (
                "Origem obrigatória ausente."
                if mutation == "missing"
                else "Caminho de origem não reconhecido."
            ),
        }
    ]
    assert "desconhecido" not in safe_errors[0]["msg"]


@pytest.mark.parametrize("field", ["purpose_out", "purpose_in"])
def test_rejeita_finalidade_com_espaco_externo(authored_payload, field):
    _participant(authored_payload)[field] = " finalidade "
    _assert_invalid(authored_payload)


def test_rejeita_regra_iof_duplicada(authored_payload):
    rule = {"finalidade": "ANEXO_V_DISPONIBILIDADE", "direcao": "IN", "aliquota": "0.0038"}
    costs = _input(authored_payload)["costs"]
    costs["iof_por_finalidade"] = [rule, deepcopy(rule)]  # type: ignore[index]
    _assert_invalid(authored_payload)


def test_rejeita_extra_em_objeto_aninhado(authored_payload):
    _participant(authored_payload)["nome"] = "não pertence ao contrato efetivo"
    _assert_invalid(authored_payload)


def test_modelos_de_resposta_catalogo_e_capacidades_sao_fechados(authored_request):
    with pytest.raises(ValidationError):
        Capabilities.model_validate({"preparation_version": "1.0.0"})
    with pytest.raises(ValidationError):
        CatalogResponse.model_validate({"catalog_version": "1.0.0"})
    with pytest.raises(ValidationError):
        PreparationResponse.model_validate(
            {
                "preparation_version": "1.0.0",
                "request_id": str(authored_request.request_id),
                "campo_extra": True,
            }
        )


def test_contratos_completos_de_resposta_catalogo_e_capacidades_sao_validos(
    authored_request,
):
    capabilities = Capabilities.model_validate(
        {
            "preparation_version": "1.0.0",
            "preview_version": "1.0.0",
            "presentation_version": "1.0.0",
            "motor_schema_version": "1.0.0",
            "generator_version": "dimensionamento-v1",
            "catalog_version": "1.0.0",
            "motor_build_sha": "a" * 40,
            "max_orders": 1000,
            "max_expected_orders": 500,
        }
    )
    catalog = CatalogResponse.model_validate(_catalog_payload(authored_request))
    response = PreparationResponse.model_validate(
        {
            "preparation_version": "1.0.0",
            "preparation_id": "00000000-0000-4000-8000-000000000014",
            "request_id": str(authored_request.request_id),
            "study_id": str(authored_request.study_id),
            "scenario_id": str(authored_request.scenario_id),
            "scenario_revision": authored_request.scenario_revision,
            "created_at": "2026-09-13T00:00:00Z",
            "motor_build_sha": "a" * 40,
            "generator_version": "dimensionamento-v1",
            "catalog_version": "1.0.0",
            "generation_fingerprint": "b" * 64,
            "input_snapshot": authored_request.input.model_dump(mode="json"),
            "orders": [],
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
                    "order_count": 0,
                    "out_brl": "0",
                    "in_brl": "0",
                    "total_brl": "0",
                    "out_fraction": None,
                },
                {
                    "participant_id": None,
                    "order_count": 0,
                    "out_brl": "0",
                    "in_brl": "0",
                    "total_brl": "0",
                    "out_fraction": None,
                },
            ],
            "derived_provenance": {
                f"/parameters/{PARTICIPANT_ID}/cadence_monthly": {
                    "rule": "dimensionamento-v1",
                    "inputs": [
                        f"/participants/{PARTICIPANT_ID}/monthly_volume_brl",
                        f"/participants/{PARTICIPANT_ID}/ticket_median_brl",
                        "/catalog/remessa_outbound_massiva",
                    ],
                }
            },
        }
    )

    assert len(catalog.profiles) == 6
    assert len(catalog.examples) == 5
    assert all(len(example.participants) == 12 for example in catalog.examples)
    assert capabilities.max_expected_orders == 500
    assert response.input_snapshot == authored_request.input


def test_catalogo_rejeita_mediana_abaixo_de_um_centavo(authored_request):
    payload = _catalog_payload(authored_request)
    payload["profiles"][0]["ticket_median_brl"] = "0.001"  # type: ignore[index]
    with pytest.raises(ValidationError):
        CatalogResponse.model_validate(payload)


def test_openapi_expoe_contratos_e_rotas_de_preparacao():
    schema = create_schema_app().openapi()
    schemas = schema["components"]["schemas"]
    for name in (
        "EffectiveInput",
        "EffectiveParticipant",
        "PreparationRequest",
        "PreparationResponse",
        "CatalogResponse",
        "Capabilities",
        "DerivedEvidence",
        "RealizedComposition",
    ):
        assert name in schemas

    assert schema["paths"]["/api/v1/capabilities"]["get"]["security"] == [
        {"HTTPBearer": []}
    ]
    assert schema["paths"]["/api/v1/examples/catalog"]["get"]["security"] == [
        {"HTTPBearer": []}
    ]
    preparation = schema["paths"]["/api/v1/preparacoes"]["post"]
    assert preparation["security"] == [{"HTTPBearer": []}]
    assert preparation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/PreparationRequest"
    }
    assert preparation["responses"]["200"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/PreparationResponse"}


def test_openapi_preserva_api_geral_e_versiona_preparacao_separadamente():
    schema = create_schema_app().openapi()
    assert schema["info"]["version"] == "1.0.0"
    assert schema["components"]["schemas"]["PreparationRequest"]["properties"][
        "preparation_version"
    ]["const"] == "1.0.0"
