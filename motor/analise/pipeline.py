"""Despacho analítico puro com recorte opcional da coorte temporal oficial."""

from __future__ import annotations

from decimal import Decimal

from motor.analise.clientes import (
    _somar_custos, _somar_exato, analisar_clientes, construir_ledger,
    filtrar_analise_clientes, filtrar_ledger, resultado_cliente_vazio,
    resultados_por_mecanismo,
)
from motor.analise.marginal import _contribuicao_com_resultado
from motor.analise.modelo import (
    AgregadoCanonico, ConfiguracaoAnalise, DiagnosticosExperimentais,
    ManifestoExecucao, ModoAnalise, ResultadoCanonico,
)
from motor.analise.temporal import ConfiguracaoTemporal, preparar_execucao_temporal
from motor.analise.serializacao import reidentificar_manifesto
from motor.dominio import Cenario, OrigemCasamento, TipoAlocacao
from motor.simulacao import simular


def analisar(
    cenario: Cenario, configuracao: ConfiguracaoAnalise, manifesto: ManifestoExecucao,
    configuracao_temporal: ConfiguracaoTemporal | None = None,
) -> ResultadoCanonico:
    """Executa uma vez a pool cheia e, quando solicitado, cada leave-one-out.

    Valida o modo do manifesto, a seleção e a guarda de alto custo antes de
    qualquer simulação. COMPLETO conta clientes distintos presentes nas ordens.
    Com configuração temporal, a simulação integral inclui aquecimento e
    liquidação, enquanto os indicadores publicados usam apenas a coorte medida.
    """
    modo = configuracao.modo
    if manifesto.modo_analise is not modo:
        raise ValueError("modo do manifesto diverge da configuração da análise")
    execucao = (
        preparar_execucao_temporal(cenario, configuracao_temporal)
        if configuracao_temporal is not None else None
    )
    cenario_execucao = execucao.cenario if execucao is not None else cenario
    ids_clientes = {o.cliente_id for o in cenario_execucao.ordens}
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

    cheio = simular(cenario_execucao)
    bruto = _somar_exato(o.valor_brl for o in cenario_execucao.ordens)
    if modo is ModoAnalise.AGREGADO:
        ledger_integral = construir_ledger(cenario_execucao, cheio)
        clientes_integrais = ()
    else:
        ledger_integral, clientes_integrais = analisar_clientes(cenario_execucao, cheio)
    ledger_periodo = ledger_integral
    clientes_periodo = clientes_integrais
    if execucao is None:
        agregado = AgregadoCanonico(
            execucao_completa=cheio,
            ids_ordens_medidas=tuple(sorted(o.id for o in cenario_execucao.ordens)),
            volume_bruto_periodo_brl=bruto,
            volume_casado_periodo_brl=_somar_exato(
                a.valor_brl for ciclo in cheio.ciclos for a in ciclo.alocacoes
                if a.tipo is TipoAlocacao.CASADO
            ),
            volume_autonetting_periodo_brl=cheio.volume_autonetting_brl,
            volume_netting_multilateral_periodo_brl=(
                cheio.volume_netting_multilateral_brl
            ),
            volume_remetido_periodo_brl=_somar_exato(
                a.valor_brl for ciclo in cheio.ciclos for a in ciclo.alocacoes
                if a.tipo is TipoAlocacao.REMETIDO
            ),
            baseline_periodo=cheio.baseline, netado_periodo=cheio.netado,
            economia_periodo_brl=cheio.economia,
            taxa_netabilidade_periodo=cheio.taxa_netabilidade,
            taxa_autonetting_periodo=cheio.taxa_autonetting,
            taxa_netting_multilateral_periodo=cheio.taxa_netting_multilateral,
            mecanismos=resultados_por_mecanismo(ledger_periodo),
        )
    else:
        if modo is ModoAnalise.AGREGADO:
            ledger_periodo = filtrar_ledger(
                ledger_integral, execucao.ids_ordens_medidas,
            )
            clientes_periodo = ()
        else:
            ledger_periodo, clientes_periodo = filtrar_analise_clientes(
                ledger_integral, execucao.ids_ordens_medidas,
            )
        bruto_medido = _somar_exato(
            evento.valor_brl for evento in ledger_periodo
            if evento.tipo == "ORDEM_CONHECIDA"
        )
        casado_medido = _somar_exato(
            evento.valor_brl for evento in ledger_periodo if evento.tipo == "CASADO"
        )
        ids_medidos = frozenset(execucao.ids_ordens_medidas)
        autonetting_medido = _somar_exato(
            alocacao.valor_brl
            for ciclo in cheio.ciclos
            for alocacao in ciclo.alocacoes
            if alocacao.ordem_id in ids_medidos
            and alocacao.origem_casamento is OrigemCasamento.INTRA_CLIENTE
        )
        multilateral_medido = _somar_exato(
            alocacao.valor_brl
            for ciclo in cheio.ciclos
            for alocacao in ciclo.alocacoes
            if alocacao.ordem_id in ids_medidos
            and alocacao.origem_casamento is OrigemCasamento.INTER_CLIENTE
        )
        if autonetting_medido + multilateral_medido != casado_medido:
            raise ValueError("decomposição do casamento diverge da coorte medida")
        agregado = AgregadoCanonico(
            execucao_completa=cheio,
            ids_ordens_medidas=execucao.ids_ordens_medidas,
            volume_bruto_periodo_brl=bruto_medido,
            volume_casado_periodo_brl=casado_medido,
            volume_autonetting_periodo_brl=autonetting_medido,
            volume_netting_multilateral_periodo_brl=multilateral_medido,
            volume_remetido_periodo_brl=_somar_exato(
                evento.valor_brl for evento in ledger_periodo if evento.tipo == "REMETIDO"
            ),
            baseline_periodo=_somar_custos(e.baseline for e in ledger_periodo),
            netado_periodo=_somar_custos(e.netado for e in ledger_periodo),
            economia_periodo_brl=_somar_exato(
                e.ganho_realizado_brl for e in ledger_periodo
            ),
            taxa_netabilidade_periodo=(
                casado_medido / bruto_medido if bruto_medido else Decimal(0)
            ),
            taxa_autonetting_periodo=(
                autonetting_medido / bruto_medido if bruto_medido else Decimal(0)
            ),
            taxa_netting_multilateral_periodo=(
                multilateral_medido / bruto_medido if bruto_medido else Decimal(0)
            ),
            mecanismos=resultados_por_mecanismo(ledger_periodo),
        )
        bruto = bruto_medido
        manifesto = reidentificar_manifesto(
            manifesto, drenagem="NATURAL",
            horizonte_dias=cenario_execucao.horizonte_dias,
            periodo_medicao_dias=configuracao_temporal.periodo_medicao_dias,
        )
    ledger, clientes, contribuicoes = (), (), ()
    if modo is not ModoAnalise.AGREGADO:
        ledger, clientes = ledger_periodo, clientes_periodo
        por_id = {c.cliente_id: c for c in clientes}
        contribuicoes = tuple(
            _contribuicao_com_resultado(
                cenario_execucao, cheio,
                por_id.get(cid, resultado_cliente_vazio(cid)), bruto,
                ids_ordens_medidas=(
                    execucao.ids_ordens_medidas if execucao is not None else None
                ),
                economia_periodo=agregado.economia_periodo_brl,
            )
            for cid in selecionados
        )
    return ResultadoCanonico(
        manifesto=manifesto, agregado=agregado, clientes=clientes,
        ledger_eventos=ledger, contribuicoes_marginais=contribuicoes,
        diagnosticos_experimentais=DiagnosticosExperimentais(),
        avisos=manifesto.avisos,
    )
