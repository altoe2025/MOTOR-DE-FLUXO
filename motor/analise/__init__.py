"""Contratos públicos da camada analítica do motor."""

from motor.analise.clientes import analisar_clientes
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

__all__ = (
    "analisar_clientes",
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
