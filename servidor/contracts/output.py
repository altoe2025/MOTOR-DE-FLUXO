"""DTOs explícitos do JSON canônico publicado pelo motor."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    BeforeValidator,
    Field,
    PlainSerializer,
    WithJsonSchema,
    model_validator,
)

from motor.analise.aritmetica import somar_exato, subtrair_exato
from servidor.contracts.input import CustoEntrada
from servidor.contracts.primitives import DECIMAL_PATTERN, StrictModel, decimal_value


def _parse_decimal_output(value: object) -> Decimal:
    if not isinstance(value, str):
        raise ValueError("decimal de saída deve ser texto")  # noqa: TRY004 - Pydantic validator contract
    if len(value) > 80:
        raise ValueError("decimal de saída excede 80 caracteres")
    return decimal_value(value)


_DECIMAL_SCHEMA = {"type": "string", "maxLength": 80, "pattern": DECIMAL_PATTERN}
DecimalSaida = Annotated[
    Decimal,
    BeforeValidator(_parse_decimal_output),
    PlainSerializer(lambda value: format(value, "f"), return_type=str),
    WithJsonSchema(_DECIMAL_SCHEMA, mode="validation"),
    WithJsonSchema(_DECIMAL_SCHEMA, mode="serialization"),
]


class CustosDTO(StrictModel):
    iof: DecimalSaida
    carry: DecimalSaida
    spread: DecimalSaida
    espera: DecimalSaida
    fixo: DecimalSaida
    total: DecimalSaida


class AlocacaoDTO(StrictModel):
    ordem_id: str
    dia: int
    valor_brl: DecimalSaida
    tipo: Literal["CASADO", "REMETIDO"]
    origem_casamento: Literal["INTRA_CLIENTE", "INTER_CLIENTE"] | None

    @model_validator(mode="after")
    def validar_origem(self):
        if self.tipo == "CASADO" and self.origem_casamento is None:
            raise ValueError("CASADO exige origem_casamento")
        if self.tipo == "REMETIDO" and self.origem_casamento is not None:
            raise ValueError("REMETIDO não aceita origem_casamento")
        return self


class CicloDTO(StrictModel):
    dia: int
    alocacoes: list[AlocacaoDTO]
    bruto_out: DecimalSaida
    bruto_in: DecimalSaida
    casado: DecimalSaida
    residuo: DecimalSaida
    direcao_residuo: Literal["OUT", "IN"]


class ResultadoLegadoDTO(StrictModel):
    ciclos: list[CicloDTO]
    baseline: CustosDTO
    netado: CustosDTO
    economia: DecimalSaida
    volume_casado_brl: DecimalSaida
    volume_autonetting_brl: DecimalSaida
    volume_netting_multilateral_brl: DecimalSaida
    taxa_netabilidade: DecimalSaida
    taxa_autonetting: DecimalSaida
    taxa_netting_multilateral: DecimalSaida


class ResultadoMecanismoDTO(StrictModel):
    destino: Literal["INTRA_CLIENTE", "INTER_CLIENTE", "REMETIDO"]
    volume_brl: DecimalSaida
    baseline_atribuido_brl: DecimalSaida
    custo_netado_brl: DecimalSaida
    economia_brl: DecimalSaida

    @model_validator(mode="after")
    def validar_economia(self):
        if self.economia_brl != subtrair_exato(
            self.baseline_atribuido_brl, self.custo_netado_brl,
        ):
            raise ValueError("economia do mecanismo não reconcilia")
        return self


class AgregadoDTO(StrictModel):
    execucao_completa: ResultadoLegadoDTO
    ids_ordens_medidas: list[str]
    volume_bruto_periodo_brl: DecimalSaida
    volume_casado_periodo_brl: DecimalSaida
    volume_autonetting_periodo_brl: DecimalSaida
    volume_netting_multilateral_periodo_brl: DecimalSaida
    volume_remetido_periodo_brl: DecimalSaida
    baseline_periodo: CustosDTO
    netado_periodo: CustosDTO
    economia_periodo_brl: DecimalSaida
    taxa_netabilidade_periodo: DecimalSaida
    taxa_autonetting_periodo: DecimalSaida
    taxa_netting_multilateral_periodo: DecimalSaida
    mecanismos: Annotated[
        list[ResultadoMecanismoDTO], Field(min_length=3, max_length=3)
    ]

    @model_validator(mode="after")
    def validar_decomposicao(self):
        if (
            self.volume_autonetting_periodo_brl
            + self.volume_netting_multilateral_periodo_brl
            != self.volume_casado_periodo_brl
        ):
            raise ValueError("volumes por mecanismo não reconciliam")
        if (
            self.taxa_autonetting_periodo
            + self.taxa_netting_multilateral_periodo
            != self.taxa_netabilidade_periodo
        ):
            raise ValueError("taxas por mecanismo não reconciliam")
        if [m.destino for m in self.mecanismos] != [
            "INTRA_CLIENTE", "INTER_CLIENTE", "REMETIDO",
        ]:
            raise ValueError("mecanismos fora da ordem canônica")
        por_destino = {m.destino: m for m in self.mecanismos}
        if (
            por_destino["INTRA_CLIENTE"].volume_brl
            != self.volume_autonetting_periodo_brl
            or por_destino["INTER_CLIENTE"].volume_brl
            != self.volume_netting_multilateral_periodo_brl
            or por_destino["REMETIDO"].volume_brl
            != self.volume_remetido_periodo_brl
        ):
            raise ValueError("volumes dos mecanismos não reconciliam")
        if somar_exato(m.baseline_atribuido_brl for m in self.mecanismos) != (
            self.baseline_periodo.total
        ):
            raise ValueError("baseline dos mecanismos não reconcilia")
        if somar_exato(m.custo_netado_brl for m in self.mecanismos) != (
            self.netado_periodo.total
        ):
            raise ValueError("custo dos mecanismos não reconcilia")
        if somar_exato(m.economia_brl for m in self.mecanismos) != (
            self.economia_periodo_brl
        ):
            raise ValueError("economia dos mecanismos não reconcilia")
        return self


class ManifestoDTO(StrictModel):
    run_id: str
    schema_version: Literal["2.0.0"]
    versao_motor: str
    criado_em_utc: str
    hash_configuracao: str
    run_ids_origem: list[str]
    parametros_custo: CustoEntrada
    mixes: list[str]
    arquetipos: list[str]
    horizonte_dias: int
    periodo_medicao_dias: int
    janela_dias: int
    seeds: list[int]
    modo_analise: Literal["AGREGADO"]
    custo_calibrado: bool
    metodo_percentil: str
    drenagem: str
    avisos: list[str]


class DiagnosticosExperimentaisDTO(StrictModel):
    pass


class ResultadoCanonicoDTO(StrictModel):
    manifesto: ManifestoDTO
    agregado: AgregadoDTO
    clientes: Annotated[list[object], Field(max_length=0)]
    ledger_eventos: Annotated[list[object], Field(max_length=0)]
    contribuicoes_marginais: Annotated[list[object], Field(max_length=0)]
    diagnosticos_experimentais: DiagnosticosExperimentaisDTO
    avisos: list[str]
