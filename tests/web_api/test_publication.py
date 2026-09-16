import json
from copy import copy
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from motor.analise import (
    ConfiguracaoAnalise,
    ModoAnalise,
    analisar,
    criar_manifesto,
    resultado_para_json,
)
from servidor.contracts.input import PreviaRequest
from servidor.motor_adapter import construir_cenario
from servidor.publication import ResultadoInvalido, validar_publicacao

NOW = datetime(2026, 9, 12, 20, 0, tzinfo=UTC)


@pytest.fixture
def execution(reference_payload):
    request = PreviaRequest.model_validate(reference_payload)
    cenario = construir_cenario(request.cenario)
    manifesto = criar_manifesto(
        parametros_custo=cenario.custo,
        mixes=(), arquetipos=(), horizonte_dias=cenario.horizonte_dias,
        periodo_medicao_dias=cenario.horizonte_dias + 1,
        janela_dias=cenario.janela_dias, seeds=(),
        modo_analise=ModoAnalise.AGREGADO, custo_calibrado=False,
        metodo_percentil="NAO_APLICAVEL", drenagem="LEGADO",
        relogio=lambda: NOW, versao_motor="0.1.0+" + "a" * 40,
    )
    resultado = analisar(cenario, ConfiguracaoAnalise(ModoAnalise.AGREGADO), manifesto)
    return cenario, resultado


def test_publicacao_aceita_resultado_e_json_canonicos(execution):
    cenario, resultado = execution
    validar_publicacao(cenario, resultado, resultado_para_json(resultado))


def test_publicacao_rejeita_volume_agregado_corrompido(execution):
    cenario, resultado = execution
    agregado_corrompido = copy(resultado.agregado)
    object.__setattr__(
        agregado_corrompido,
        "volume_remetido_periodo_brl",
        Decimal(1),
    )
    corrompido = replace(resultado, agregado=agregado_corrompido)

    with pytest.raises(ResultadoInvalido, match="RESULTADO_INVALIDO"):
        validar_publicacao(cenario, corrompido, resultado_para_json(corrompido))


def test_publicacao_rejeita_alocacao_corrompida_apos_simular(execution):
    cenario, resultado = execution
    execucao = resultado.agregado.execucao_completa
    ciclo = execucao.ciclos[0]
    alocacao = ciclo.alocacoes[0]
    ciclo_corrompido = replace(
        ciclo,
        alocacoes=(replace(alocacao, valor_brl=alocacao.valor_brl + 1),)
        + ciclo.alocacoes[1:],
    )
    execucao_corrompida = replace(execucao, ciclos=(ciclo_corrompido,) + execucao.ciclos[1:])
    corrompido = replace(
        resultado,
        agregado=replace(resultado.agregado, execucao_completa=execucao_corrompida),
    )

    with pytest.raises(ResultadoInvalido, match="RESULTADO_INVALIDO"):
        validar_publicacao(cenario, corrompido, resultado_para_json(corrompido))


def test_publicacao_rejeita_json_corrompido(execution):
    cenario, resultado = execution
    documento = json.loads(resultado_para_json(resultado))
    documento["agregado"]["execucao_completa"]["ciclos"][0]["alocacoes"][0][
        "valor_brl"
    ] = "1"

    with pytest.raises(ResultadoInvalido, match="RESULTADO_INVALIDO"):
        validar_publicacao(
            cenario,
            resultado,
            json.dumps(documento, ensure_ascii=False, sort_keys=True),
        )


@pytest.mark.parametrize("mutation", ["unknown_order", "missing", "duplicate", "invalid_type"])
def test_publicacao_rejeita_alocacoes_publicas_inconsistentes(execution, mutation):
    cenario, resultado = execution
    documento = json.loads(resultado_para_json(resultado))
    alocacoes = documento["agregado"]["execucao_completa"]["ciclos"][0]["alocacoes"]
    if mutation == "unknown_order":
        alocacoes[0]["ordem_id"] = "ordem-inexistente"
    elif mutation == "missing":
        alocacoes.pop(0)
    elif mutation == "duplicate":
        alocacoes.append(dict(alocacoes[0]))
    else:
        alocacoes[0]["tipo"] = "OUTRO"

    with pytest.raises(ResultadoInvalido, match="RESULTADO_INVALIDO"):
        validar_publicacao(cenario, resultado, json.dumps(documento))


def test_publicacao_preserva_economia_negativa_sem_recalcular(execution):
    cenario, resultado = execution
    delta = resultado.agregado.economia_periodo_brl + Decimal("1.25")
    netado = resultado.agregado.netado_periodo
    netado_negativo = replace(
        netado,
        iof=netado.iof + delta,
        total=netado.total + delta,
    )
    mecanismos = list(resultado.agregado.mecanismos)
    remetido = mecanismos[-1]
    mecanismos[-1] = replace(
        remetido,
        custo_netado_brl=remetido.custo_netado_brl + delta,
        economia_brl=remetido.economia_brl - delta,
    )
    negativo = replace(
        resultado,
        agregado=replace(
            resultado.agregado,
            netado_periodo=netado_negativo,
            economia_periodo_brl=Decimal("-1.25"),
            mecanismos=tuple(mecanismos),
        ),
    )

    validar_publicacao(cenario, negativo, resultado_para_json(negativo))


def test_publicacao_rejeita_json_com_secao_individual(execution):
    cenario, resultado = execution
    documento = json.loads(resultado_para_json(resultado))
    documento["clientes"] = [{"cliente_id": "privado"}]

    with pytest.raises(ResultadoInvalido, match="RESULTADO_INVALIDO"):
        validar_publicacao(cenario, resultado, json.dumps(documento))


def test_publicacao_rejeita_manifesto_reidentificado_sem_recalcular_hash(execution):
    cenario, resultado = execution
    hash_falso = "f" * 64
    corrompido = replace(
        resultado,
        manifesto=replace(
            resultado.manifesto,
            hash_configuracao=hash_falso,
            run_id=resultado.manifesto.run_id[:-12] + hash_falso[:12],
        ),
    )

    with pytest.raises(ResultadoInvalido, match="RESULTADO_INVALIDO"):
        validar_publicacao(cenario, corrompido, resultado_para_json(corrompido))
