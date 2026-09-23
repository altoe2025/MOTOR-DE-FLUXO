"""Contrato público estrito do catálogo técnico da importação."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, field_validator, model_validator

from servidor.contracts.input import CustoEntrada
from servidor.contracts.primitives import (
    DateTimeValue,
    DecimalText,
    OrigemValor,
    StrictModel,
)


class AliquotaFinalidade(StrictModel):
    direcao: Literal["OUT", "IN"]
    aliquota: DecimalText


class FinalidadeCatalogo(StrictModel):
    codigo: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    descricao: Annotated[str, Field(strict=True, min_length=1, max_length=240)]
    aliquotas: Annotated[list[AliquotaFinalidade], Field(min_length=1, max_length=2)]

    @field_validator("aliquotas")
    @classmethod
    def direcoes_sao_unicas(
        cls, value: list[AliquotaFinalidade]
    ) -> list[AliquotaFinalidade]:
        direcoes = [item.direcao for item in value]
        if len(direcoes) != len(set(direcoes)):
            raise ValueError("direções repetidas para a finalidade")
        return value


class CatalogoImportacao(StrictModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    schema_version: Literal["1.0.0"]
    catalog_version: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    status: Literal["CONFIGURADO", "NAO_CONFIGURADO"]
    publicado_em_utc: DateTimeValue
    finalidades: Annotated[list[FinalidadeCatalogo], Field(max_length=100)]
    custos_padrao: CustoEntrada
    custos_origem: OrigemValor
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
