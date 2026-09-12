"""DTOs explícitos do JSON canônico publicado pelo motor."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, PlainSerializer, WithJsonSchema

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
    taxa_netabilidade: DecimalSaida


class AgregadoDTO(StrictModel):
    execucao_completa: ResultadoLegadoDTO
    ids_ordens_medidas: list[str]
    volume_bruto_periodo_brl: DecimalSaida
    volume_casado_periodo_brl: DecimalSaida
    volume_remetido_periodo_brl: DecimalSaida
    baseline_periodo: CustosDTO
    netado_periodo: CustosDTO
    economia_periodo_brl: DecimalSaida
    taxa_netabilidade_periodo: DecimalSaida


class ManifestoDTO(StrictModel):
    run_id: str
    schema_version: str
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
    limite_intra_cliente_brl: None
    volume_casado_incremental_brl: None
    taxa_netabilidade_incremental: None


class ResultadoCanonicoDTO(StrictModel):
    manifesto: ManifestoDTO
    agregado: AgregadoDTO
    clientes: Annotated[list[object], Field(max_length=0)]
    ledger_eventos: Annotated[list[object], Field(max_length=0)]
    contribuicoes_marginais: Annotated[list[object], Field(max_length=0)]
    diagnosticos_experimentais: DiagnosticosExperimentaisDTO
    avisos: list[str]
