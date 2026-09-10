"""Despacho analítico puro; recebe um manifesto pronto e mede a execução inteira."""

from __future__ import annotations

from motor.analise.clientes import _somar_exato, analisar_clientes
from motor.analise.marginal import _contribuicao_com_resultado
from motor.analise.modelo import (
    AgregadoCanonico, ConfiguracaoAnalise, DiagnosticosExperimentais,
    ManifestoExecucao, ModoAnalise, ResultadoCanonico,
)
from motor.dominio import Cenario, TipoAlocacao
from motor.simulacao import simular


def analisar(
    cenario: Cenario, configuracao: ConfiguracaoAnalise, manifesto: ManifestoExecucao,
) -> ResultadoCanonico:
    """Executa uma vez a pool cheia e, quando solicitado, cada leave-one-out.

    Valida o modo do manifesto, a seleção e a guarda de alto custo antes de
    qualquer simulação. COMPLETO conta clientes distintos presentes nas ordens.
    Recortes temporais e criação/serialização do manifesto ficam fora daqui.
    """
    modo = configuracao.modo
    if manifesto.modo_analise is not modo:
        raise ValueError("modo do manifesto diverge da configuração da análise")
    ids_clientes = {o.cliente_id for o in cenario.ordens}
    selecionados = ()
    if modo is ModoAnalise.MARGINAL_SELECIONADOS:
        selecionados = configuracao.clientes_marginais
        for cid in selecionados:
            if cid not in ids_clientes:
                raise ValueError(f"cliente inexistente: {cid!r}")
    elif modo is ModoAnalise.COMPLETO:
        limite = configuracao.max_clientes_marginal_completo
        if len(ids_clientes) > limite and not configuracao.confirmar_alto_custo:
            raise ValueError(
                f"COMPLETO tem {len(ids_clientes)} clientes e excede o limite {limite}; "
                "use confirmar_alto_custo=True para confirmar a execução"
            )
        selecionados = tuple(sorted(ids_clientes))

    cheio = simular(cenario)
    bruto = _somar_exato(o.valor_brl for o in cenario.ordens)
    agregado = AgregadoCanonico(
        execucao_completa=cheio,
        ids_ordens_medidas=tuple(sorted(o.id for o in cenario.ordens)),
        volume_bruto_periodo_brl=bruto,
        volume_casado_periodo_brl=_somar_exato(
            a.valor_brl for ciclo in cheio.ciclos for a in ciclo.alocacoes
            if a.tipo is TipoAlocacao.CASADO
        ),
        volume_remetido_periodo_brl=_somar_exato(
            a.valor_brl for ciclo in cheio.ciclos for a in ciclo.alocacoes
            if a.tipo is TipoAlocacao.REMETIDO
        ),
        baseline_periodo=cheio.baseline, netado_periodo=cheio.netado,
        economia_periodo_brl=cheio.economia,
        taxa_netabilidade_periodo=cheio.taxa_netabilidade,
    )
    ledger, clientes, contribuicoes = (), (), ()
    if modo is not ModoAnalise.AGREGADO:
        ledger, clientes = analisar_clientes(cenario, cheio)
        por_id = {c.cliente_id: c for c in clientes}
        contribuicoes = tuple(
            _contribuicao_com_resultado(cenario, cheio, por_id[cid], bruto)
            for cid in selecionados
        )
    return ResultadoCanonico(
        manifesto=manifesto, agregado=agregado, clientes=clientes,
        ledger_eventos=ledger, contribuicoes_marginais=contribuicoes,
        diagnosticos_experimentais=DiagnosticosExperimentais(),
        avisos=manifesto.avisos,
    )
