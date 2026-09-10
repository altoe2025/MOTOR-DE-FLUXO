"""Contratos públicos da camada analítica do motor."""

from motor.analise.clientes import analisar_clientes
from motor.analise.marginal import calcular_contribuicao_marginal
from motor.analise.modelo import (
    AgregadoCanonico,
    ConfiguracaoAnalise,
    ContribuicaoMarginal,
    DiagnosticosExperimentais,
    EventoCliente,
    ManifestoExecucao,
    ModoAnalise,
    ResultadoCanonico,
    ResultadoCliente,
    ResumoDiaCliente,
)
from motor.analise.pipeline import analisar

__all__ = (
    "analisar",
    "analisar_clientes",
    "calcular_contribuicao_marginal",
    "AgregadoCanonico",
    "ConfiguracaoAnalise",
    "ContribuicaoMarginal",
    "DiagnosticosExperimentais",
    "EventoCliente",
    "ManifestoExecucao",
    "ModoAnalise",
    "ResultadoCanonico",
    "ResultadoCliente",
    "ResumoDiaCliente",
)
