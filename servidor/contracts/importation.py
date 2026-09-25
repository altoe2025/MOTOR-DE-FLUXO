"""Contrato público estrito do catálogo técnico da importação."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, field_validator, model_validator

from servidor.contracts.input import RegraIOF
from servidor.contracts.primitives import (
    DateTimeValue,
    DecimalText,
    OrigemValor,
    StrictModel,
    decimal_places,
    decimal_value,
)


class AliquotaFinalidade(StrictModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    direcao: Literal["OUT", "IN"]
    aliquota: DecimalText


class FinalidadeCatalogo(StrictModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    codigo: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    descricao: Annotated[str, Field(strict=True, min_length=1, max_length=240)]
    aliquotas: Annotated[tuple[AliquotaFinalidade, ...], Field(min_length=1, max_length=2)]

    @field_validator("aliquotas")
    @classmethod
    def direcoes_sao_unicas(
        cls, value: tuple[AliquotaFinalidade, ...]
    ) -> tuple[AliquotaFinalidade, ...]:
        direcoes = [item.direcao for item in value]
        if len(direcoes) != len(set(direcoes)):
            raise ValueError("direções repetidas para a finalidade")
        return value


class RegraIOFCatalogo(RegraIOF):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class CustoPadraoCatalogo(StrictModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    iof_out: DecimalText
    iof_in: DecimalText
    carry_cnr: DecimalText
    spread_rail_bps: DecimalText
    custo_fixo_remessa: DecimalText
    custo_oportunidade_aa: DecimalText
    ptax: DecimalText
    iof_por_finalidade: Annotated[
        tuple[RegraIOFCatalogo, ...], Field(max_length=100)
    ]

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
    def validate_unique_iof_rules(self) -> CustoPadraoCatalogo:
        keys = [(rule.finalidade, rule.direcao) for rule in self.iof_por_finalidade]
        if len(keys) != len(set(keys)):
            raise ValueError("regras de IOF repetidas")
        return self


class OrigemCatalogo(OrigemValor):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class CatalogoImportacao(StrictModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    schema_version: Literal["1.0.0"]
    catalog_version: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    status: Literal["CONFIGURADO", "NAO_CONFIGURADO"]
    publicado_em_utc: DateTimeValue
    finalidades: Annotated[tuple[FinalidadeCatalogo, ...], Field(max_length=100)]
    custos_padrao: CustoPadraoCatalogo
    custos_origem: OrigemCatalogo
    custos_calibrados: Literal[False]

    @field_validator("publicado_em_utc")
    @classmethod
    def publicado_com_fuso(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("publicado_em_utc deve conter fuso")
        return value

    @model_validator(mode="after")
    def validar_coerencia(self) -> CatalogoImportacao:
        codigos = [finalidade.codigo for finalidade in self.finalidades]
        if len(codigos) != len(set(codigos)):
            raise ValueError("códigos de finalidade repetidos")
        if self.status == "NAO_CONFIGURADO" and self.finalidades:
            raise ValueError("catálogo não configurado exige finalidades vazias")
        if self.status == "CONFIGURADO" and not self.finalidades:
            raise ValueError("catálogo configurado exige ao menos uma finalidade")
        return self
