"""Resultado canônico imutável, sem cálculo, serialização ou execução analítica.

O agregado conserva o Resultado legado. Valores e custos são fornecidos pelas
camadas produtoras; este módulo só define a estrutura e as opções da análise.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum

from motor.analise.aritmetica import somar_exato, subtrair_exato
from motor.custo import Custos
from motor.dominio import OrigemCasamento, ParametrosCusto
from motor.simulacao import Resultado


def _exigir_tupla(nome: str, valor: object) -> None:
    if not isinstance(valor, tuple):
        raise ValueError(f"{nome} deve ser uma tupla imutável")


class ModoAnalise(str, Enum):
    AGREGADO = "AGREGADO"
    POR_CLIENTE = "POR_CLIENTE"
    MARGINAL_SELECIONADOS = "MARGINAL_SELECIONADOS"
    COMPLETO = "COMPLETO"


@dataclass(frozen=True)
class ConfiguracaoAnalise:
    """Opções explícitas; a contagem da carteira é validada pelo executor futuro."""

    modo: ModoAnalise
    clientes_marginais: tuple[str, ...] = ()
    max_clientes_marginal_completo: int | None = None
    confirmar_alto_custo: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.modo, ModoAnalise):
            raise ValueError("modo deve ser um ModoAnalise")
        _exigir_tupla("clientes_marginais", self.clientes_marginais)
        if any(not isinstance(cid, str) or not cid.strip() for cid in self.clientes_marginais):
            raise ValueError("clientes_marginais deve conter IDs não vazios")
        if len(set(self.clientes_marginais)) != len(self.clientes_marginais):
            raise ValueError("clientes_marginais contém IDs duplicados")
        if self.modo is ModoAnalise.MARGINAL_SELECIONADOS:
            if not self.clientes_marginais:
                raise ValueError("clientes_marginais é obrigatório em MARGINAL_SELECIONADOS")
        elif self.clientes_marginais:
            raise ValueError("clientes_marginais só é permitido em MARGINAL_SELECIONADOS")

        limite = self.max_clientes_marginal_completo
        if limite is not None and (type(limite) is not int or limite <= 0):
            raise ValueError("max_clientes_marginal_completo deve ser inteiro positivo")
        if type(self.confirmar_alto_custo) is not bool:
            raise ValueError("confirmar_alto_custo deve ser booleano")
        if self.modo is ModoAnalise.COMPLETO:
            if limite is None:
                raise ValueError("max_clientes_marginal_completo é obrigatório em COMPLETO")
        else:
            if limite is not None:
                raise ValueError("max_clientes_marginal_completo só é permitido em COMPLETO")
            if self.confirmar_alto_custo:
                raise ValueError("confirmar_alto_custo só é permitido em COMPLETO")


@dataclass(frozen=True)
class EventoCliente:
    """Evento esparso; eh_efx é metadado e não altera os custos informados."""

    evento_id: str
    cliente_id: str
    ordem_id: str
    dia_conhecida: int
    dia_resolucao: int | None
    tipo: str
    valor_brl: Decimal
    baseline: Custos
    netado: Custos
    ganho_realizado_brl: Decimal
    eh_efx: bool
    origem_casamento: OrigemCasamento | None = None

    def __post_init__(self) -> None:
        if self.tipo == "CASADO" and self.origem_casamento is None:
            raise ValueError("evento CASADO exige origem_casamento")
        if self.tipo != "CASADO" and self.origem_casamento is not None:
            raise ValueError(f"evento {self.tipo} não aceita origem_casamento")


@dataclass(frozen=True)
class ResumoDiaCliente:
    cliente_id: str
    dia: int
    volume_conhecido_brl: Decimal
    volume_casado_brl: Decimal
    volume_autonetting_brl: Decimal
    volume_netting_multilateral_brl: Decimal
    volume_remetido_brl: Decimal
    baseline_brl: Decimal
    custo_netado_brl: Decimal
    ganho_dia_brl: Decimal
    ganho_acumulado_brl: Decimal


@dataclass(frozen=True)
class ResultadoCliente:
    cliente_id: str
    volume_bruto_brl: Decimal
    volume_casado_brl: Decimal
    volume_autonetting_brl: Decimal
    volume_netting_multilateral_brl: Decimal
    volume_remetido_brl: Decimal
    baseline: Custos
    netado: Custos
    ganho_proprio_brl: Decimal
    ganho_proprio_bps: Decimal
    historico_diario: tuple[ResumoDiaCliente, ...]

    def __post_init__(self) -> None:
        _exigir_tupla("historico_diario", self.historico_diario)


@dataclass(frozen=True)
class ContribuicaoMarginal:
    cliente_id: str
    ganho_proprio_brl: Decimal
    ganho_proprio_bps: Decimal
    contribuicao_marginal_total_brl: Decimal
    contribuicao_marginal_total_bps: Decimal
    efeito_sobre_demais_brl: Decimal
    efeito_sobre_demais_bps: Decimal


class DestinoContabil(str, Enum):
    INTRA_CLIENTE = "INTRA_CLIENTE"
    INTER_CLIENTE = "INTER_CLIENTE"
    REMETIDO = "REMETIDO"


@dataclass(frozen=True)
class ResultadoMecanismo:
    """Atribuição contábil por destino; não é um contrafactual causal."""

    destino: DestinoContabil
    volume_brl: Decimal
    baseline_atribuido_brl: Decimal
    custo_netado_brl: Decimal
    economia_brl: Decimal

    def __post_init__(self) -> None:
        if self.economia_brl != subtrair_exato(
            self.baseline_atribuido_brl, self.custo_netado_brl,
        ):
            raise ValueError("economia do mecanismo deve ser baseline menos custo netado")


@dataclass(frozen=True)
class AgregadoCanonico:
    execucao_completa: Resultado
    ids_ordens_medidas: tuple[str, ...]
    volume_bruto_periodo_brl: Decimal
    volume_casado_periodo_brl: Decimal
    volume_autonetting_periodo_brl: Decimal
    volume_netting_multilateral_periodo_brl: Decimal
    volume_remetido_periodo_brl: Decimal
    baseline_periodo: Custos
    netado_periodo: Custos
    economia_periodo_brl: Decimal
    taxa_netabilidade_periodo: Decimal
    taxa_autonetting_periodo: Decimal
    taxa_netting_multilateral_periodo: Decimal
    mecanismos: tuple[ResultadoMecanismo, ...]

    def __post_init__(self) -> None:
        _exigir_tupla("ids_ordens_medidas", self.ids_ordens_medidas)
        _exigir_tupla("mecanismos", self.mecanismos)
        if tuple(m.destino for m in self.mecanismos) != tuple(DestinoContabil):
            raise ValueError("mecanismos deve conter os três destinos na ordem canônica")
        if (
            self.volume_autonetting_periodo_brl
            + self.volume_netting_multilateral_periodo_brl
            != self.volume_casado_periodo_brl
        ):
            raise ValueError("volumes por mecanismo não reconciliam com volume casado")
        if (
            self.taxa_autonetting_periodo
            + self.taxa_netting_multilateral_periodo
            != self.taxa_netabilidade_periodo
        ):
            raise ValueError("taxas por mecanismo não reconciliam com netabilidade")
        por_destino = {m.destino: m for m in self.mecanismos}
        if (
            por_destino[DestinoContabil.INTRA_CLIENTE].volume_brl
            != self.volume_autonetting_periodo_brl
            or por_destino[DestinoContabil.INTER_CLIENTE].volume_brl
            != self.volume_netting_multilateral_periodo_brl
            or por_destino[DestinoContabil.REMETIDO].volume_brl
            != self.volume_remetido_periodo_brl
        ):
            raise ValueError("volumes dos mecanismos não reconciliam com o agregado")
        if somar_exato(m.baseline_atribuido_brl for m in self.mecanismos) != (
            self.baseline_periodo.total
        ):
            raise ValueError("baseline dos mecanismos não reconcilia com o agregado")
        if somar_exato(m.custo_netado_brl for m in self.mecanismos) != (
            self.netado_periodo.total
        ):
            raise ValueError("custo dos mecanismos não reconcilia com o agregado")
        if somar_exato(m.economia_brl for m in self.mecanismos) != (
            self.economia_periodo_brl
        ):
            raise ValueError("economia dos mecanismos não reconcilia com o agregado")


@dataclass(frozen=True)
class DiagnosticosExperimentais:
    pass


@dataclass(frozen=True)
class ManifestoExecucao:
    run_id: str
    schema_version: str
    versao_motor: str
    criado_em_utc: str
    hash_configuracao: str
    run_ids_origem: tuple[str, ...]
    parametros_custo: ParametrosCusto
    mixes: tuple[str, ...]
    arquetipos: tuple[str, ...]
    horizonte_dias: int
    periodo_medicao_dias: int
    janela_dias: int
    seeds: tuple[int, ...]
    modo_analise: ModoAnalise
    custo_calibrado: bool
    metodo_percentil: str
    drenagem: str
    avisos: tuple[str, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.modo_analise, ModoAnalise):
            raise ValueError("modo_analise deve ser um ModoAnalise")
        for nome in ("run_ids_origem", "mixes", "arquetipos", "seeds", "avisos"):
            _exigir_tupla(nome, getattr(self, nome))


@dataclass(frozen=True)
class ResultadoCanonico:
    """Seções não solicitadas pelo modo devem ser tuplas vazias."""

    manifesto: ManifestoExecucao
    agregado: AgregadoCanonico
    clientes: tuple[ResultadoCliente, ...]
    ledger_eventos: tuple[EventoCliente, ...]
    contribuicoes_marginais: tuple[ContribuicaoMarginal, ...]
    diagnosticos_experimentais: DiagnosticosExperimentais
    avisos: tuple[str, ...]

    def __post_init__(self) -> None:
        for nome in ("clientes", "ledger_eventos", "contribuicoes_marginais", "avisos"):
            _exigir_tupla(nome, getattr(self, nome))
        modo = self.manifesto.modo_analise
        if modo is ModoAnalise.AGREGADO:
            for nome in ("clientes", "ledger_eventos", "contribuicoes_marginais"):
                if getattr(self, nome):
                    raise ValueError(f"{nome} deve ser tupla vazia em AGREGADO")
        elif modo is ModoAnalise.POR_CLIENTE and self.contribuicoes_marginais:
            raise ValueError("contribuicoes_marginais deve ser tupla vazia em POR_CLIENTE")
