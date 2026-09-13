"""Adaptador único entre os DTOs HTTP e as interfaces públicas do motor."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from importlib.metadata import PackageNotFoundError, version
from uuid import UUID, uuid4

from pydantic import TypeAdapter

from motor.analise import (
    ConfiguracaoAnalise,
    ConfiguracaoTemporal,
    ModoAnalise,
    analisar,
    criar_manifesto,
    preparar_execucao_temporal,
    resultado_para_json,
)
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from servidor.contracts.input import CenarioEntrada, PeriodoNatural, PreviaRequest
from servidor.contracts.output import ResultadoCanonicoDTO
from servidor.contracts.preview import (
    BuildSha,
    EstatisticaPrevia,
    InputSnapshot,
    PresentationContract,
    PreviewEnvelope,
)
from servidor.identity import execution_fingerprint, provenance_fingerprint
from servidor.publication import ResultadoInvalido, validar_publicacao

_BUILD_SHA_ADAPTER = TypeAdapter(BuildSha)


def construir_cenario(entrada: CenarioEntrada) -> Cenario:
    custo = entrada.custo
    parametros = ParametrosCusto(
        iof_out=Decimal(custo.iof_out),
        iof_in=Decimal(custo.iof_in),
        carry_cnr=Decimal(custo.carry_cnr),
        spread_rail_bps=Decimal(custo.spread_rail_bps),
        custo_fixo_remessa=Decimal(custo.custo_fixo_remessa),
        custo_oportunidade_aa=Decimal(custo.custo_oportunidade_aa),
        ptax=Decimal(custo.ptax),
        iof_por_finalidade={
            (regra.finalidade, Direcao(regra.direcao)): Decimal(regra.aliquota)
            for regra in custo.iof_por_finalidade
        },
    )
    ordens = tuple(
        Ordem(
            id=ordem.id,
            cliente_id=ordem.cliente_id,
            direcao=Direcao(ordem.direcao),
            valor_brl=Decimal(ordem.valor_brl),
            dia_conhecida=ordem.dia_conhecida,
            dia_limite=ordem.dia_limite,
            eh_efx=ordem.eh_efx,
            finalidade=ordem.finalidade,
        )
        for ordem in entrada.ordens
    )
    return Cenario(ordens, entrada.janela_dias, entrada.horizonte_dias, parametros)


def _versao_motor(build_sha: str) -> str:
    try:
        pacote = version("motor-de-fluxo")
    except PackageNotFoundError:
        pacote = "desconhecida"
    return f"{pacote}+{build_sha}"


def executar_previa(
    request: PreviaRequest,
    *,
    build_sha: str,
    relogio: Callable[[], datetime],
) -> PreviewEnvelope:
    """Executa uma única análise agregada e só monta o envelope após o portão."""
    return _executar_previa(
        request,
        build_sha=build_sha,
        relogio=relogio,
        id_factory=uuid4,
    )


def _executar_previa(
    request: PreviaRequest,
    *,
    build_sha: str,
    relogio: Callable[[], datetime],
    id_factory: Callable[[], UUID],
) -> PreviewEnvelope:
    build_sha = _BUILD_SHA_ADAPTER.validate_python(build_sha, strict=True)
    cenario = construir_cenario(request.cenario)
    temporal = None
    drenagem = "LEGADO"
    periodo_medicao = cenario.horizonte_dias + 1
    if isinstance(request.periodo, PeriodoNatural):
        temporal = ConfiguracaoTemporal(
            request.periodo.dias_aquecimento,
            request.periodo.periodo_medicao_dias,
        )
        drenagem = "NATURAL"
        periodo_medicao = request.periodo.periodo_medicao_dias

    manifesto = criar_manifesto(
        parametros_custo=cenario.custo,
        mixes=(),
        arquetipos=(),
        horizonte_dias=cenario.horizonte_dias,
        periodo_medicao_dias=periodo_medicao,
        janela_dias=cenario.janela_dias,
        seeds=(),
        modo_analise=ModoAnalise.AGREGADO,
        custo_calibrado=False,
        metodo_percentil="NAO_APLICAVEL",
        drenagem=drenagem,
        relogio=relogio,
        versao_motor=_versao_motor(build_sha),
    )
    resultado = analisar(
        cenario,
        ConfiguracaoAnalise(ModoAnalise.AGREGADO),
        manifesto,
        configuracao_temporal=temporal,
    )
    if resultado.manifesto.versao_motor != _versao_motor(build_sha):
        raise ResultadoInvalido(
            "RESULTADO_INVALIDO: versão executada diverge do SHA solicitado"
        )
    if (
        resultado.manifesto.drenagem != drenagem
        or resultado.manifesto.periodo_medicao_dias != periodo_medicao
    ):
        raise ResultadoInvalido(
            "RESULTADO_INVALIDO: período executado diverge do período solicitado"
        )
    execucao_temporal = (
        preparar_execucao_temporal(cenario, temporal) if temporal is not None else None
    )
    cenario_executado = execucao_temporal.cenario if execucao_temporal else cenario
    ids_esperados = (
        execucao_temporal.ids_ordens_medidas
        if execucao_temporal is not None
        else tuple(sorted(ordem.id for ordem in cenario.ordens))
    )
    if resultado.agregado.ids_ordens_medidas != ids_esperados:
        raise ResultadoInvalido(
            "RESULTADO_INVALIDO: coorte publicada diverge do período solicitado"
        )
    json_resultado = resultado_para_json(resultado)
    validar_publicacao(cenario_executado, resultado, json_resultado)
    dto = ResultadoCanonicoDTO.model_validate_json(json_resultado)
    execution_id = id_factory()
    return PreviewEnvelope(
        api_version="1.0.0",
        presentation_version="1.0.0",
        execution_id=execution_id,
        request_id=request.request_id,
        study_id=request.study_id,
        scenario_id=request.scenario_id,
        scenario_revision=request.scenario_revision,
        execution_fingerprint=execution_fingerprint(request, build_sha),
        provenance_fingerprint=provenance_fingerprint(request.proveniencia),
        motor_build_sha=build_sha,
        kind="PREVIA",
        statistics=EstatisticaPrevia(
            kind="SINGLE_EXECUTION",
            count=1,
            seed=None,
            repetition_id=execution_id,
            percentile_method=None,
        ),
        input_snapshot=InputSnapshot(
            cenario=request.cenario,
            periodo=request.periodo,
            proveniencia=request.proveniencia,
        ),
        result=dto,
        presentation=PresentationContract(
            currency="BRL",
            locale="pt-BR",
            rounding="HALF_UP",
            money_digits=2,
            fraction_percent_digits=2,
        ),
    )
