"""Portão de publicação do resultado analítico canônico."""

from __future__ import annotations

import dataclasses
import json
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from fractions import Fraction
from typing import NoReturn

from motor.analise import (
    ModoAnalise,
    ResultadoCanonico,
    criar_manifesto,
    resultado_para_json,
)
from motor.dominio import Cenario, OrigemCasamento, TipoAlocacao
from servidor.contracts.output import ResultadoCanonicoDTO


class ResultadoInvalido(ValueError):
    """Impede que um resultado parcial ou incoerente atravesse a fronteira HTTP."""


def _falhar(mensagem: str) -> NoReturn:
    raise ResultadoInvalido(f"RESULTADO_INVALIDO: {mensagem}")


def _validar_decimais(valor: object, caminho: str = "resultado") -> None:
    if isinstance(valor, Decimal):
        if not valor.is_finite():
            _falhar(f"decimal não finito em {caminho}")
        return
    if dataclasses.is_dataclass(valor) and not isinstance(valor, type):
        for campo in dataclasses.fields(valor):
            _validar_decimais(getattr(valor, campo.name), f"{caminho}.{campo.name}")
    elif isinstance(valor, (tuple, list)):
        for indice, item in enumerate(valor):
            _validar_decimais(item, f"{caminho}[{indice}]")
    elif isinstance(valor, dict):
        for chave, item in valor.items():
            _validar_decimais(item, f"{caminho}.{chave}")


def _fracao(valor: Decimal) -> Fraction:
    return Fraction(valor)


def _validar_conservacao_objeto(
    cenario: Cenario, resultado: ResultadoCanonico,
) -> None:
    ordens = {ordem.id: ordem for ordem in cenario.ordens}
    por_ordem: dict[str, Fraction] = defaultdict(Fraction)
    por_tipo: dict[TipoAlocacao, Fraction] = defaultdict(Fraction)
    por_origem: dict[OrigemCasamento, Fraction] = defaultdict(Fraction)

    for ciclo in resultado.agregado.execucao_completa.ciclos:
        casado_ciclo = Fraction()
        remetido_ciclo = Fraction()
        for alocacao in ciclo.alocacoes:
            if alocacao.ordem_id not in ordens:
                _falhar(f"alocação referencia ordem desconhecida: {alocacao.ordem_id}")
            if not isinstance(alocacao.tipo, TipoAlocacao):
                _falhar("tipo de alocação inválido")
            if not 0 <= alocacao.dia <= cenario.horizonte_dias:
                _falhar("dia de alocação fora da execução")
            if alocacao.dia != ciclo.dia:
                _falhar("dia de alocação diverge do ciclo")
            if alocacao.dia < ordens[alocacao.ordem_id].dia_conhecida:
                _falhar("alocação anterior ao conhecimento da ordem")
            if not alocacao.valor_brl.is_finite() or alocacao.valor_brl <= 0:
                _falhar("valor de alocação deve ser finito e positivo")
            valor = _fracao(alocacao.valor_brl)
            por_ordem[alocacao.ordem_id] += valor
            por_tipo[alocacao.tipo] += valor
            if alocacao.tipo is TipoAlocacao.CASADO:
                if not isinstance(alocacao.origem_casamento, OrigemCasamento):
                    _falhar("alocação CASADO sem origem válida")
                por_origem[alocacao.origem_casamento] += valor
                casado_ciclo += valor
            else:
                if alocacao.origem_casamento is not None:
                    _falhar("alocação REMETIDO não pode ter origem de casamento")
                remetido_ciclo += valor
        if casado_ciclo != 2 * _fracao(ciclo.casado):
            _falhar("volume CASADO do ciclo diverge das alocações")
        if remetido_ciclo != _fracao(ciclo.residuo):
            _falhar("resíduo do ciclo diverge das alocações")

    for ordem in cenario.ordens:
        if not ordem.valor_brl.is_finite() or ordem.valor_brl <= 0:
            _falhar("valor de ordem deve ser finito e positivo")
        if por_ordem[ordem.id] != _fracao(ordem.valor_brl):
            _falhar(f"conservação violada para a ordem {ordem.id}")

    volume_global = sum((_fracao(ordem.valor_brl) for ordem in cenario.ordens), Fraction())
    if sum(por_tipo.values(), Fraction()) != volume_global:
        _falhar("conservação global violada")

    agregado = resultado.agregado
    ids_medidos = agregado.ids_ordens_medidas
    if len(ids_medidos) != len(set(ids_medidos)) or not set(ids_medidos) <= set(ordens):
        _falhar("ids_ordens_medidas inválidos")
    ids = set(ids_medidos)
    bruto_medido = sum((_fracao(ordens[oid].valor_brl) for oid in ids), Fraction())
    casado_medido = Fraction()
    autonetting_medido = Fraction()
    multilateral_medido = Fraction()
    remetido_medido = Fraction()
    for ciclo in agregado.execucao_completa.ciclos:
        for alocacao in ciclo.alocacoes:
            if alocacao.ordem_id in ids:
                if alocacao.tipo is TipoAlocacao.CASADO:
                    casado_medido += _fracao(alocacao.valor_brl)
                    if alocacao.origem_casamento is OrigemCasamento.INTRA_CLIENTE:
                        autonetting_medido += _fracao(alocacao.valor_brl)
                    else:
                        multilateral_medido += _fracao(alocacao.valor_brl)
                else:
                    remetido_medido += _fracao(alocacao.valor_brl)

    esperados = (
        ("volume_bruto_periodo_brl", bruto_medido),
        ("volume_casado_periodo_brl", casado_medido),
        ("volume_autonetting_periodo_brl", autonetting_medido),
        ("volume_netting_multilateral_periodo_brl", multilateral_medido),
        ("volume_remetido_periodo_brl", remetido_medido),
    )
    for nome, esperado in esperados:
        if _fracao(getattr(agregado, nome)) != esperado:
            _falhar(f"{nome} diverge das alocações medidas")
    if casado_medido + remetido_medido != bruto_medido:
        _falhar("volumes medidos não conservam a coorte")
    if autonetting_medido + multilateral_medido != casado_medido:
        _falhar("mecanismos medidos não reconciliam com o casamento")
    taxa = agregado.taxa_netabilidade_periodo
    if not taxa.is_finite() or not Decimal(0) <= taxa <= Decimal(1):
        _falhar("taxa de netabilidade fora de [0,1]")
    taxa_esperada = (
        Decimal(casado_medido.numerator) / Decimal(casado_medido.denominator)
        / (Decimal(bruto_medido.numerator) / Decimal(bruto_medido.denominator))
        if bruto_medido else Decimal(0)
    )
    if taxa != taxa_esperada:
        _falhar("taxa de netabilidade diverge dos volumes medidos")
    taxa_autonetting_esperada = (
        Decimal(autonetting_medido.numerator)
        / Decimal(autonetting_medido.denominator)
        / (Decimal(bruto_medido.numerator) / Decimal(bruto_medido.denominator))
        if bruto_medido else Decimal(0)
    )
    if agregado.taxa_autonetting_periodo != taxa_autonetting_esperada:
        _falhar("taxa de autonetting diverge dos volumes medidos")
    if agregado.taxa_netting_multilateral_periodo != taxa - taxa_autonetting_esperada:
        _falhar("taxa multilateral diverge dos volumes medidos")


def _validar_identidade(cenario: Cenario, resultado: ResultadoCanonico) -> None:
    manifesto = resultado.manifesto
    if manifesto.modo_analise is not ModoAnalise.AGREGADO:
        _falhar("modo de análise não é AGREGADO")
    if resultado.clientes or resultado.ledger_eventos or resultado.contribuicoes_marginais:
        _falhar("resultado agregado contém seções individuais")
    if manifesto.parametros_custo != cenario.custo:
        _falhar("parâmetros de custo divergem do cenário executado")
    if manifesto.horizonte_dias != cenario.horizonte_dias:
        _falhar("horizonte do manifesto diverge da execução")
    if manifesto.janela_dias != cenario.janela_dias:
        _falhar("janela do manifesto diverge da execução")
    try:
        instante = datetime.fromisoformat(manifesto.criado_em_utc)
        esperado = criar_manifesto(
            parametros_custo=manifesto.parametros_custo,
            mixes=manifesto.mixes,
            arquetipos=manifesto.arquetipos,
            horizonte_dias=manifesto.horizonte_dias,
            periodo_medicao_dias=manifesto.periodo_medicao_dias,
            janela_dias=manifesto.janela_dias,
            seeds=manifesto.seeds,
            modo_analise=manifesto.modo_analise,
            custo_calibrado=manifesto.custo_calibrado,
            metodo_percentil=manifesto.metodo_percentil,
            drenagem=manifesto.drenagem,
            avisos=manifesto.avisos,
            run_ids_origem=manifesto.run_ids_origem,
            relogio=lambda: instante,
            versao_motor=manifesto.versao_motor,
            schema_version=manifesto.schema_version,
        )
    except (TypeError, ValueError) as erro:
        _falhar(f"identidade do manifesto inválida: {erro}")
    if manifesto != esperado:
        _falhar("identidade do manifesto diverge da configuração")
    if manifesto.schema_version != "2.0.0":
        _falhar("schema_version incompatível")
    if (
        manifesto.mixes
        or manifesto.arquetipos
        or manifesto.seeds
        or manifesto.custo_calibrado
        or manifesto.metodo_percentil != "NAO_APLICAVEL"
    ):
        _falhar("manifesto da prévia contém configuração estatística")


def _decimal_do_json(valor: object, caminho: str) -> Fraction:
    if not isinstance(valor, str):
        _falhar(f"decimal público não é string em {caminho}")
    try:
        decimal = Decimal(valor)
    except ValueError as erro:
        _falhar(f"decimal público inválido em {caminho}: {erro}")
    if not decimal.is_finite():
        _falhar(f"decimal público não finito em {caminho}")
    return Fraction(decimal)


def _validar_conservacao_documento(cenario: Cenario, documento: dict[str, object]) -> None:
    ordens = {ordem.id: Fraction(ordem.valor_brl) for ordem in cenario.ordens}
    por_ordem: dict[str, Fraction] = defaultdict(Fraction)
    por_tipo: dict[str, Fraction] = defaultdict(Fraction)
    por_origem: dict[str, Fraction] = defaultdict(Fraction)
    try:
        agregado = documento["agregado"]
        if not isinstance(agregado, dict):
            _falhar("seção agregado inválida no JSON")
        execucao = agregado["execucao_completa"]
        if not isinstance(execucao, dict):
            _falhar("execução completa inválida no JSON")
        ciclos = execucao["ciclos"]
        if not isinstance(ciclos, list):
            _falhar("ciclos inválidos no JSON")
        for indice_ciclo, ciclo in enumerate(ciclos):
            if not isinstance(ciclo, dict) or not isinstance(ciclo.get("alocacoes"), list):
                _falhar("ciclo inválido no JSON")
            for indice_alocacao, alocacao in enumerate(ciclo["alocacoes"]):
                if not isinstance(alocacao, dict):
                    _falhar("alocação inválida no JSON")
                ordem_id = alocacao.get("ordem_id")
                tipo = alocacao.get("tipo")
                origem = alocacao.get("origem_casamento")
                if not isinstance(ordem_id, str) or ordem_id not in ordens:
                    _falhar("alocação pública referencia ordem desconhecida")
                if tipo not in {"CASADO", "REMETIDO"}:
                    _falhar("tipo de alocação público inválido")
                if tipo == "CASADO" and origem not in {
                    "INTRA_CLIENTE", "INTER_CLIENTE",
                }:
                    _falhar("origem pública de casamento inválida")
                if tipo == "REMETIDO" and origem is not None:
                    _falhar("remessa pública não aceita origem de casamento")
                valor = _decimal_do_json(
                    alocacao.get("valor_brl"),
                    f"ciclos[{indice_ciclo}].alocacoes[{indice_alocacao}].valor_brl",
                )
                if valor <= 0:
                    _falhar("valor público de alocação deve ser positivo")
                por_ordem[ordem_id] += valor
                por_tipo[tipo] += valor
                if tipo == "CASADO":
                    por_origem[origem] += valor

        if por_ordem != ordens:
            _falhar("JSON público viola conservação por ordem")
        if sum(por_tipo.values(), Fraction()) != sum(ordens.values(), Fraction()):
            _falhar("JSON público viola conservação global")
        ids_medidos = agregado["ids_ordens_medidas"]
        if not isinstance(ids_medidos, list) or any(
            not isinstance(ordem_id, str) or ordem_id not in ordens
            for ordem_id in ids_medidos
        ):
            _falhar("coorte medida inválida no JSON")
        ids = set(ids_medidos)
        bruto = sum((ordens[ordem_id] for ordem_id in ids), Fraction())
        casado = Fraction()
        autonetting = Fraction()
        multilateral = Fraction()
        remetido = Fraction()
        for ciclo in ciclos:
            for alocacao in ciclo["alocacoes"]:
                if alocacao["ordem_id"] in ids:
                    valor = Fraction(Decimal(alocacao["valor_brl"]))
                    if alocacao["tipo"] == "CASADO":
                        casado += valor
                        if alocacao["origem_casamento"] == "INTRA_CLIENTE":
                            autonetting += valor
                        else:
                            multilateral += valor
                    else:
                        remetido += valor
        esperados = {
            "volume_bruto_periodo_brl": bruto,
            "volume_casado_periodo_brl": casado,
            "volume_autonetting_periodo_brl": autonetting,
            "volume_netting_multilateral_periodo_brl": multilateral,
            "volume_remetido_periodo_brl": remetido,
        }
        for campo, esperado in esperados.items():
            if _decimal_do_json(agregado[campo], f"agregado.{campo}") != esperado:
                _falhar(f"{campo} público diverge das alocações")
    except KeyError as erro:
        _falhar(f"campo ausente no JSON público: {erro}")


def _validar_json(
    cenario: Cenario, resultado: ResultadoCanonico, json_resultado: str,
) -> None:
    try:
        documento = json.loads(json_resultado)
        dto = ResultadoCanonicoDTO.model_validate(documento)
    except (TypeError, ValueError) as erro:
        _falhar(f"JSON público inválido: {erro}")
    if dto.model_dump(mode="json") != documento:
        _falhar("roundtrip do DTO alterou o JSON público")
    if not isinstance(documento, dict):
        _falhar("raiz do JSON público inválida")
    _validar_conservacao_documento(cenario, documento)

    esperado = ResultadoCanonicoDTO.model_validate_json(
        resultado_para_json(resultado)
    ).model_dump(mode="json")
    if documento != esperado:
        _falhar("JSON público diverge do resultado executado")


def validar_publicacao(
    cenario_executado: Cenario,
    resultado: ResultadoCanonico,
    json_resultado: str,
) -> None:
    """Valida conservação, identidade e roundtrip sem recalcular o motor."""
    try:
        _validar_decimais(resultado)
        _validar_identidade(cenario_executado, resultado)
        _validar_conservacao_objeto(cenario_executado, resultado)
        _validar_json(cenario_executado, resultado, json_resultado)
    except ResultadoInvalido:
        raise
    except (AttributeError, KeyError, TypeError, ValueError) as erro:
        _falhar(str(erro))
