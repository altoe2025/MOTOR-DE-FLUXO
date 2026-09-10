"""Recorte temporal oficial: aquecimento, medição e liquidação natural."""

from __future__ import annotations

from dataclasses import dataclass, replace

from motor.dominio import Cenario


@dataclass(frozen=True)
class ConfiguracaoTemporal:
    dias_aquecimento: int
    periodo_medicao_dias: int

    def __post_init__(self) -> None:
        if self.dias_aquecimento < 0 or self.periodo_medicao_dias <= 0:
            raise ValueError("aquecimento deve ser >= 0 e medição deve ser > 0")


@dataclass(frozen=True)
class ExecucaoTemporal:
    cenario: Cenario
    ids_ordens_aquecimento: tuple[str, ...]
    ids_ordens_medidas: tuple[str, ...]


def preparar_execucao_temporal(
    cenario: Cenario, configuracao: ConfiguracaoTemporal,
) -> ExecucaoTemporal:
    """Fecha a entrada no fim medido e mantém o P0 ativo até o último prazo."""
    inicio = configuracao.dias_aquecimento
    fim_exclusivo = inicio + configuracao.periodo_medicao_dias
    ordens_execucao = tuple(
        ordem for ordem in cenario.ordens if ordem.dia_conhecida < fim_exclusivo
    )
    aquecimento = tuple(sorted(
        ordem.id for ordem in ordens_execucao if ordem.dia_conhecida < inicio
    ))
    medidas = tuple(sorted(
        ordem.id for ordem in ordens_execucao
        if inicio <= ordem.dia_conhecida < fim_exclusivo
    ))
    horizonte_execucao = max(
        fim_exclusivo - 1,
        max((ordem.dia_limite for ordem in ordens_execucao), default=fim_exclusivo - 1),
    )
    return ExecucaoTemporal(
        cenario=replace(
            cenario, ordens=ordens_execucao, horizonte_dias=horizonte_execucao,
        ),
        ids_ordens_aquecimento=aquecimento,
        ids_ordens_medidas=medidas,
    )


def rotulo_periodo(periodo_medicao_dias: int) -> str:
    """Somente uma medição de 365 dias recebe nomenclatura anual."""
    return "anual" if periodo_medicao_dias == 365 else "periodo"
