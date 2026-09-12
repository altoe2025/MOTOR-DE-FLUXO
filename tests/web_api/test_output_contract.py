"""DTOs de saída espelham o JSON público e barram alterações silenciosas."""

import json
from copy import deepcopy
from datetime import UTC, datetime

import pytest
from pydantic import TypeAdapter, ValidationError

from motor.analise import (
    ConfiguracaoAnalise,
    ModoAnalise,
    analisar,
    criar_manifesto,
    resultado_para_json,
)
from motor.dominio import carregar_cenario
from servidor.contracts.output import DecimalSaida, ResultadoCanonicoDTO


def canonical_payload():
    scenario = carregar_cenario("motor/cenarios/exemplo_amanda.yaml")
    manifesto = criar_manifesto(
        parametros_custo=scenario.custo,
        mixes=(),
        arquetipos=(),
        horizonte_dias=scenario.horizonte_dias,
        periodo_medicao_dias=scenario.horizonte_dias,
        janela_dias=scenario.janela_dias,
        seeds=(),
        modo_analise=ModoAnalise.AGREGADO,
        custo_calibrado=False,
        metodo_percentil="NAO_APLICAVEL",
        drenagem="LEGADO",
        relogio=lambda: datetime(2026, 9, 11, tzinfo=UTC),
        versao_motor="0.1.0+test",
    )
    result = analisar(scenario, ConfiguracaoAnalise(ModoAnalise.AGREGADO), manifesto)
    return json.loads(resultado_para_json(result))


def test_public_motor_json_roundtrips_without_decimal_loss():
    payload = canonical_payload()
    dto = ResultadoCanonicoDTO.model_validate(payload)
    assert dto.model_dump(mode="json") == payload


def test_output_decimal_schema_matches_transport_grammar():
    schema = TypeAdapter(DecimalSaida).json_schema(mode="serialization")
    assert schema["type"] == "string"
    assert schema["maxLength"] == 80
    assert schema["pattern"] == r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$"


@pytest.mark.parametrize(
    "mutation",
    [
        "numeric_decimal",
        "exponent_decimal",
        "leading_zero_decimal",
        "extra_field",
        "individual_result",
        "experimental_value",
    ],
)
def test_output_contract_rejects_noncanonical_or_individual_data(mutation):
    payload = deepcopy(canonical_payload())
    if mutation == "numeric_decimal":
        payload["agregado"]["economia_periodo_brl"] = 1026000.0
    elif mutation == "exponent_decimal":
        payload["agregado"]["economia_periodo_brl"] = "1e3"
    elif mutation == "leading_zero_decimal":
        payload["agregado"]["economia_periodo_brl"] = "01"
    elif mutation == "extra_field":
        payload["agregado"]["inventado"] = "1"
    elif mutation == "individual_result":
        payload["clientes"] = [{}]
    else:
        payload["diagnosticos_experimentais"]["limite_intra_cliente_brl"] = "1"
    with pytest.raises(ValidationError):
        ResultadoCanonicoDTO.model_validate(payload)
