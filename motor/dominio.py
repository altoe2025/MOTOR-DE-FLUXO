"""Domínio do motor de fluxo: entidades imutáveis compartilhadas por todas as camadas.

Este módulo não importa nenhum outro módulo do projeto — é o contrato que
netting.py, custo.py e simulacao.py leem, nunca escrevem. Ver a regra de
importação em CLAUDE.md.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any, Mapping

import yaml


class Direcao(Enum):
    OUT = "OUT"  # tem reais no Brasil, precisa de moeda fora
    IN = "IN"  # tem moeda fora, precisa de reais no Brasil


@dataclass(frozen=True)
class Ordem:
    id: str
    cliente_id: str
    direcao: Direcao
    valor_brl: Decimal
    dia_conhecida: int  # quando o produto fica sabendo da ordem
    dia_limite: int  # quando ela obrigatoriamente executa
    eh_efx: bool
    finalidade: str  # código do Anexo V da Res. BCB 277

    def __post_init__(self) -> None:
        if self.valor_brl <= 0:
            raise ValueError(f"valor_brl deve ser positivo, recebeu {self.valor_brl!r}")
        if self.dia_limite < self.dia_conhecida:
            raise ValueError(
                f"dia_limite ({self.dia_limite}) não pode ser anterior a "
                f"dia_conhecida ({self.dia_conhecida})"
            )


@dataclass(frozen=True)
class ParametrosCusto:
    iof_out: Decimal  # alíquota PADRÃO de saída, quando a finalidade não tem regra própria
    iof_in: Decimal  # idem, entrada
    carry_cnr: Decimal  # 0.0004
    spread_rail_bps: Decimal
    custo_fixo_remessa: Decimal
    custo_oportunidade_aa: Decimal
    ptax: Decimal  # 5.40

    # Alíquotas de IOF específicas por (finalidade do Anexo V, direção). Câmbio de
    # importação e de exportação tem tratamento próprio, então duas alíquotas
    # chapadas por direção não bastam. O que não estiver aqui cai em
    # iof_out/iof_in — é opt-in, e um cenário que não declare nada se comporta
    # exatamente como antes deste campo existir.
    #
    # A chave é o PAR: a mesma finalidade pode ter alíquotas diferentes conforme
    # o dinheiro entra ou sai.
    #
    # Convenção: trate como imutável depois de construído (dataclass frozen não
    # congela o dict por dentro). Ver motor/custo.py:aliquota_iof.
    iof_por_finalidade: Mapping[tuple[str, Direcao], Decimal] = field(default_factory=dict)


@dataclass(frozen=True)
class Cenario:
    ordens: tuple[Ordem, ...]
    janela_dias: int  # W da política P0
    horizonte_dias: int
    custo: ParametrosCusto


@dataclass(frozen=True)
class Arquetipo:
    nome: str
    p_out: float  # probabilidade de uma ordem ser OUT, em [0,1]
    ticket_mediana_brl: Decimal  # mediana da distribuição lognormal de valor por ordem
    ticket_sigma: float  # dispersão (sigma do log) da distribuição de ticket
    cadencia_mensal: float  # nº esperado de ordens por mês (pode ser fracionário)
    buffer_dias_min: int  # menor prazo possível entre dia_conhecida e dia_limite
    buffer_dias_max: int  # maior prazo possível
    visibilidade_dias_min: int  # menor antecedência com que a ordem é conhecida
    visibilidade_dias_max: int  # maior antecedência
    eh_efx: bool
    finalidade: str  # código único do Anexo V para este arquétipo, nesta etapa

    def __post_init__(self) -> None:
        assert 0.0 <= self.p_out <= 1.0
        assert self.ticket_mediana_brl > 0
        assert self.cadencia_mensal > 0
        assert 0 <= self.buffer_dias_min <= self.buffer_dias_max
        assert 0 <= self.visibilidade_dias_min <= self.visibilidade_dias_max


@dataclass(frozen=True)
class Ciclo:
    dia: int
    ordens: tuple[Ordem, ...]
    bruto_out: Decimal
    bruto_in: Decimal
    casado: Decimal  # min(bruto_out, bruto_in)
    residuo: Decimal  # abs(bruto_out - bruto_in)
    direcao_residuo: Direcao


def _decimal(valor: Any) -> Decimal:
    return Decimal(str(valor))


def carregar_cenario(path: str) -> Cenario:
    """Lê um cenário de um arquivo YAML. Não é pura — faz I/O de disco."""
    dados = yaml.safe_load(Path(path).read_text(encoding="utf-8"))

    custo_dados = dados["custo"]
    custo = ParametrosCusto(
        iof_out=_decimal(custo_dados["iof_out"]),
        iof_in=_decimal(custo_dados["iof_in"]),
        carry_cnr=_decimal(custo_dados["carry_cnr"]),
        spread_rail_bps=_decimal(custo_dados["spread_rail_bps"]),
        custo_fixo_remessa=_decimal(custo_dados["custo_fixo_remessa"]),
        custo_oportunidade_aa=_decimal(custo_dados["custo_oportunidade_aa"]),
        ptax=_decimal(custo_dados["ptax"]),
    )

    ordens = tuple(
        Ordem(
            id=o["id"],
            cliente_id=o["cliente_id"],
            direcao=Direcao(o["direcao"]),
            valor_brl=_decimal(o["valor_brl"]),
            dia_conhecida=int(o["dia_conhecida"]),
            dia_limite=int(o["dia_limite"]),
            eh_efx=bool(o["eh_efx"]),
            finalidade=str(o["finalidade"]),
        )
        for o in dados["ordens"]
    )

    return Cenario(
        ordens=ordens,
        janela_dias=int(dados["janela_dias"]),
        horizonte_dias=int(dados["horizonte_dias"]),
        custo=custo,
    )
