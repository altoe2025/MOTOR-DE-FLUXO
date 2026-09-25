"""DTOs estritos de entrada da prévia."""

from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import Field, StrictBool, StrictInt, field_validator, model_validator

from servidor.contracts.primitives import (
    DecimalText,
    Identificador,
    OrigemValor,
    StrictModel,
    UUIDValue,
    decimal_places,
    decimal_value,
    validate_identifier,
)


class CampoDecimal(StrictModel):
    valor: DecimalText
    origem: OrigemValor


class OrdemEntrada(StrictModel):
    """Operação explícita; direção oposta do mesmo cliente continua outra ordem."""

    id: Identificador
    cliente_id: Identificador
    direcao: Literal["OUT", "IN"]
    valor_brl: DecimalText
    dia_conhecida: Annotated[StrictInt, Field(ge=0, le=1095)]
    dia_limite: Annotated[StrictInt, Field(ge=0, le=1095)]
    eh_efx: StrictBool
    finalidade: Annotated[str, Field(strict=True, min_length=1, max_length=128)] | None

    @field_validator("id", "cliente_id")
    @classmethod
    def identifiers_are_exact(cls, value: str) -> str:
        return validate_identifier(value)

    @field_validator("finalidade")
    @classmethod
    def finalidade_is_exact(cls, value: str | None) -> str | None:
        if value is not None and value != value.strip():
            raise ValueError("finalidade não pode ter espaços externos")
        return value

    @field_validator("valor_brl")
    @classmethod
    def validate_money(cls, value: str) -> str:
        number = decimal_value(value)
        if number <= 0 or number > 10**12:
            raise ValueError("valor_brl fora do intervalo permitido")
        if decimal_places(value) > 6:
            raise ValueError("valor_brl aceita no máximo 6 casas decimais")
        return value

    @model_validator(mode="after")
    def validate_deadline(self) -> OrdemEntrada:
        if self.dia_limite < self.dia_conhecida:
            raise ValueError("dia_limite deve ser maior ou igual a dia_conhecida")
        return self


class RegraIOF(StrictModel):
    finalidade: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    direcao: Literal["OUT", "IN"]
    aliquota: DecimalText

    @field_validator("aliquota")
    @classmethod
    def validate_rate(cls, value: str) -> str:
        number = decimal_value(value)
        if not 0 <= number <= 1 or decimal_places(value) > 12:
            raise ValueError("alíquota fora do intervalo ou precisão permitidos")
        return value


class CustoEntrada(StrictModel):
    iof_out: DecimalText
    iof_in: DecimalText
    carry_cnr: DecimalText
    spread_rail_bps: DecimalText
    custo_fixo_remessa: DecimalText
    custo_oportunidade_aa: DecimalText
    ptax: DecimalText
    iof_por_finalidade: Annotated[list[RegraIOF], Field(max_length=100)]

    @field_validator("iof_out", "iof_in", "carry_cnr", "custo_oportunidade_aa")
    @classmethod
    def validate_fraction(cls, value: str) -> str:
        number = decimal_value(value)
        if not 0 <= number <= 1 or decimal_places(value) > 12:
            raise ValueError("taxa fora do intervalo ou precisão permitidos")
        return value

    @field_validator("spread_rail_bps")
    @classmethod
    def validate_spread(cls, value: str) -> str:
        number = decimal_value(value)
        if not 0 <= number <= 10000 or decimal_places(value) > 12:
            raise ValueError("spread fora do intervalo ou precisão permitidos")
        return value

    @field_validator("custo_fixo_remessa")
    @classmethod
    def validate_fixed_cost(cls, value: str) -> str:
        number = decimal_value(value)
        if not 0 <= number <= 10**12 or decimal_places(value) > 6:
            raise ValueError("custo fixo fora do intervalo ou precisão permitidos")
        return value

    @field_validator("ptax")
    @classmethod
    def validate_ptax(cls, value: str) -> str:
        number = decimal_value(value)
        if not 0 < number <= 10**6 or decimal_places(value) > 12:
            raise ValueError("ptax fora do intervalo ou precisão permitidos")
        return value

    @model_validator(mode="after")
    def validate_unique_iof_rules(self) -> CustoEntrada:
        keys = [(rule.finalidade, rule.direcao) for rule in self.iof_por_finalidade]
        if len(keys) != len(set(keys)):
            raise ValueError("regras de IOF repetidas")
        return self


class CenarioEntrada(StrictModel):
    ordens: Annotated[
        list[OrdemEntrada],
        Field(
            max_length=1000,
            description=(
                "Operações explícitas que não devem ser pré-netadas; OUT e IN do "
                "mesmo cliente permanecem entradas distintas para a política P0."
            ),
        ),
    ]
    janela_dias: Annotated[StrictInt, Field(ge=1, le=730)]
    horizonte_dias: Annotated[StrictInt, Field(ge=0, le=730)]
    custo: CustoEntrada

    @model_validator(mode="after")
    def validate_scenario(self) -> CenarioEntrada:
        ids = [order.id for order in self.ordens]
        if len(ids) != len(set(ids)):
            raise ValueError("IDs de ordem repetidos")
        if any(order.dia_conhecida > self.horizonte_dias for order in self.ordens):
            raise ValueError("dia_conhecida fora do horizonte")
        return self


class PeriodoLegado(StrictModel):
    modo: Literal["LEGADO"]


class PeriodoNatural(StrictModel):
    modo: Literal["NATURAL"]
    dias_aquecimento: Annotated[StrictInt, Field(ge=0)]
    periodo_medicao_dias: Annotated[StrictInt, Field(gt=0)]

    @model_validator(mode="after")
    def validate_total(self) -> PeriodoNatural:
        if self.dias_aquecimento + self.periodo_medicao_dias > 731:
            raise ValueError("período total excede 731 dias")
        return self


PeriodoEntrada = Annotated[PeriodoLegado | PeriodoNatural, Field(discriminator="modo")]

_UNCOLLECTED_EFX_POINTER_RE = re.compile(r"^/ordens/[0-9]+/eh_efx$")
_UNCOLLECTED_PURPOSE_POINTER_RE = re.compile(r"^/ordens/[0-9]+/finalidade$")


def _required_provenance_paths(scenario: CenarioEntrada) -> set[str]:
    paths = {
        "/janela_dias",
        "/horizonte_dias",
        "/custo/iof_out",
        "/custo/iof_in",
        "/custo/carry_cnr",
        "/custo/spread_rail_bps",
        "/custo/custo_fixo_remessa",
        "/custo/custo_oportunidade_aa",
        "/custo/ptax",
    }
    for index, _ in enumerate(scenario.ordens):
        paths.update(
            {
                f"/ordens/{index}/valor_brl",
                f"/ordens/{index}/dia_conhecida",
                f"/ordens/{index}/dia_limite",
                f"/ordens/{index}/eh_efx",
                f"/ordens/{index}/finalidade",
            }
        )
    for index, _ in enumerate(scenario.custo.iof_por_finalidade):
        paths.update(
            {
                f"/custo/iof_por_finalidade/{index}/finalidade",
                f"/custo/iof_por_finalidade/{index}/aliquota",
            }
        )
    return paths


def _resolve_pointer(document: object, pointer: str) -> object:
    if not pointer.startswith("/"):
        raise ValueError("JSON Pointer deve começar com /")
    current = document
    try:
        for raw in pointer[1:].split("/"):
            token = raw.replace("~1", "/").replace("~0", "~")
            if isinstance(current, list):
                current = current[int(token)]
            elif isinstance(current, dict):
                current = current[token]
            else:
                raise TypeError("JSON Pointer não pode atravessar valor escalar")
    except (KeyError, IndexError, ValueError, TypeError) as error:
        raise ValueError("JSON Pointer não resolvido") from error
    return current


def _pointer_exists(document: object, pointer: str) -> bool:
    try:
        _resolve_pointer(document, pointer)
    except ValueError:
        return False
    return True


class PreviaRequest(StrictModel):
    api_version: Literal["1.0.0"]
    request_id: UUIDValue
    study_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: Annotated[StrictInt, Field(ge=1)]
    cenario: CenarioEntrada
    periodo: PeriodoEntrada
    proveniencia: dict[str, OrigemValor]

    @model_validator(mode="after")
    def validate_cross_fields(self) -> PreviaRequest:
        scenario_json = self.cenario.model_dump(mode="json")
        required = _required_provenance_paths(self.cenario)
        supplied = set(self.proveniencia)
        missing = required - supplied
        if missing:
            raise ValueError(f"proveniência ausente para {min(missing)}")
        invalid = [
            pointer
            for pointer in supplied
            if not _pointer_exists(scenario_json, pointer)
        ]
        if invalid:
            raise ValueError(f"caminho de proveniência inexistente: {invalid[0]}")
        for pointer, origin in self.proveniencia.items():
            if origin.tipo != "NAO_COLETADO":
                continue
            if _UNCOLLECTED_EFX_POINTER_RE.fullmatch(pointer):
                if _resolve_pointer(scenario_json, pointer) is not False:
                    raise ValueError("NAO_COLETADO exige eh_efx=false")
            elif _UNCOLLECTED_PURPOSE_POINTER_RE.fullmatch(pointer):
                if _resolve_pointer(scenario_json, pointer) is not None:
                    raise ValueError("NAO_COLETADO exige finalidade=null")
            else:
                raise ValueError(
                    "NAO_COLETADO só pode ser usado em /ordens/{i}/eh_efx "
                    "ou /ordens/{i}/finalidade"
                )
        if isinstance(self.periodo, PeriodoNatural):
            total = self.periodo.dias_aquecimento + self.periodo.periodo_medicao_dias
            if any(order.dia_conhecida >= total for order in self.cenario.ordens):
                raise ValueError("ordem conhecida fora do período natural")
            if total > self.cenario.horizonte_dias:
                raise ValueError("período natural excede horizonte informado")
        return self
