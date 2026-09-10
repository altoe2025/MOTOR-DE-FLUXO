"""Cenarios de estresse e limites da sensibilidade economica.

Reprecifica as 6.000 linhas de produto ja publicadas. Nenhuma carteira e gerada e
nenhuma regra do motor e alterada. Os cenarios sao testes analiticos, nao previsoes:
retiram receitas/custos evitados, elevam o carry e zeram as duas aliquotas de IOF
que ainda dependem de confirmacao.
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from motor.analise import validar_compatibilidade
from motor.analise.estatistica import percentil_empirico
from motor.custo import aliquota_iof
from motor.dominio import Direcao, ParametrosCusto
from motor.varredura import PARAMETROS_VARREDURA
from scripts.sensibilidade_custo import (
    BPS,
    CHAVES_IDENTIFICACAO,
    _decimal,
    escrever_csv,
    ler_manifesto,
)


SPREAD_BASE_BPS = PARAMETROS_VARREDURA.spread_rail_bps
TARIFA_BASE_BRL = PARAMETROS_VARREDURA.custo_fixo_remessa
CARRY_BASE_BPS = PARAMETROS_VARREDURA.carry_cnr * BPS
IOF_BENS_SERVICOS_BASE_BPS = (
    aliquota_iof(PARAMETROS_VARREDURA, "ANEXO_V_BENS_SERVICOS", Direcao.OUT) * BPS
)
IOF_ATIVOS_VIRTUAIS_BASE_BPS = (
    aliquota_iof(PARAMETROS_VARREDURA, "ANEXO_V_ATIVOS_VIRTUAIS", Direcao.OUT) * BPS
)

CHAVE_BENS_SERVICOS = ("ANEXO_V_BENS_SERVICOS", "OUT")
CHAVE_ATIVOS_VIRTUAIS = ("ANEXO_V_ATIVOS_VIRTUAIS", "OUT")


@dataclass(frozen=True)
class CenarioEstresse:
    nome: str
    descricao: str
    spread_bps: Decimal = SPREAD_BASE_BPS
    tarifa_fixa_brl: Decimal = TARIFA_BASE_BRL
    carry_bps: Decimal = CARRY_BASE_BPS
    iof_bens_servicos_out_bps: Decimal = IOF_BENS_SERVICOS_BASE_BPS
    iof_ativos_virtuais_out_bps: Decimal = IOF_ATIVOS_VIRTUAIS_BASE_BPS


CENARIOS = (
    CenarioEstresse(
        "base_hipotetica",
        "Hipoteses atuais do modelo; ainda nao calibradas.",
    ),
    CenarioEstresse(
        "sem_spread",
        "Retira integralmente o spread evitado.",
        spread_bps=Decimal(0),
    ),
    CenarioEstresse(
        "sem_tarifa_fixa",
        "Retira integralmente a tarifa fixa evitada.",
        tarifa_fixa_brl=Decimal(0),
    ),
    CenarioEstresse(
        "iof_incerto_zero",
        "Zera somente as duas aliquotas de IOF ainda nao confirmadas.",
        iof_bens_servicos_out_bps=Decimal(0),
        iof_ativos_virtuais_out_bps=Decimal(0),
    ),
    CenarioEstresse(
        "piso_sem_componentes_incertos",
        "Zera spread, tarifa fixa e as duas aliquotas incertas; mantem carry em 4 bps.",
        spread_bps=Decimal(0),
        tarifa_fixa_brl=Decimal(0),
        iof_bens_servicos_out_bps=Decimal(0),
        iof_ativos_virtuais_out_bps=Decimal(0),
    ),
    CenarioEstresse(
        "carry_25bps",
        "Eleva o carry de 4 para 25 bps, sem alterar os demais componentes.",
        carry_bps=Decimal(25),
    ),
    CenarioEstresse(
        "combinado_severo",
        "Aplica o piso dos componentes incertos e eleva o carry para 25 bps.",
        spread_bps=Decimal(0),
        tarifa_fixa_brl=Decimal(0),
        carry_bps=Decimal(25),
        iof_bens_servicos_out_bps=Decimal(0),
        iof_ativos_virtuais_out_bps=Decimal(0),
    ),
    CenarioEstresse(
        "sem_carry",
        "Limite superior simples: retira o custo de carry e mantem o restante na base.",
        carry_bps=Decimal(0),
    ),
)

RESSALVAS = (
    "# Testes analiticos, nao cotacao nem previsao comercial.",
    "# Base hipotetica: spread=25 bps, tarifa fixa=R$40 e carry=4 bps.",
    "# IOF incerto: BENS_SERVICOS OUT=38 bps e ATIVOS_VIRTUAIS OUT=350 bps na base.",
    "# Cada Ordem e uma posicao liquida; nao ha deducao adicional de autonetting.",
    "# Cada semente representa uma carteira-ano sintetica de 365 dias.",
)


def ler_csv(caminho: Path) -> list[dict[str, str]]:
    with caminho.open(encoding="utf-8", newline="") as arquivo:
        linhas = (linha for linha in arquivo if not linha.startswith("#"))
        return list(csv.DictReader(linhas))


def _chave_identificacao(linha: Mapping[str, object]) -> tuple[object, ...]:
    return tuple(linha[chave] for chave in CHAVES_IDENTIFICACAO)


def indexar_exposicoes_iof(
    linhas: Iterable[Mapping[str, object]],
) -> dict[tuple[object, ...], dict[tuple[str, str], Decimal]]:
    indice: dict[tuple[object, ...], dict[tuple[str, str], Decimal]] = defaultdict(dict)
    for linha in linhas:
        chave_carteira = _chave_identificacao(linha)
        chave_exposicao = (str(linha["finalidade"]), str(linha["direcao"]))
        if chave_exposicao in indice[chave_carteira]:
            raise ValueError(
                f"exposicao IOF duplicada: {chave_carteira + chave_exposicao}"
            )
        indice[chave_carteira][chave_exposicao] = _decimal(
            linha["delta_bps_por_1bp_aliquota"]
        )
    return dict(indice)


def reprecificar_economia(
    linha: Mapping[str, object],
    exposicoes_iof: Mapping[tuple[str, str], Decimal],
    cenario: CenarioEstresse,
    parametros_base: ParametrosCusto = PARAMETROS_VARREDURA,
) -> dict[str, object]:
    parametros_linha = {
        "spread_base_bps": parametros_base.spread_rail_bps,
        "tarifa_base_brl": parametros_base.custo_fixo_remessa,
        "carry_base_bps": parametros_base.carry_cnr * BPS,
    }
    divergentes = [
        nome
        for nome, esperado in parametros_linha.items()
        if nome in linha and _decimal(linha[nome]) != esperado
    ]
    if divergentes:
        raise ValueError(f"parametros-base incompativeis: {divergentes}")
    iof_reconciliado = sum(
        (
            exposicao * aliquota_iof(
                parametros_base, finalidade, Direcao(direcao)
            ) * BPS
            for (finalidade, direcao), exposicao in exposicoes_iof.items()
        ),
        Decimal(0),
    )
    iof_produto = _decimal(linha["iof_evitado_bps"])
    precisao_publicada = Decimal(1).scaleb(iof_produto.as_tuple().exponent)
    iof_reconciliado_publicado = iof_reconciliado.quantize(
        precisao_publicada, rounding=ROUND_HALF_UP
    )
    if iof_reconciliado_publicado != iof_produto:
        raise ValueError(
            "exposicoes IOF nao reconciliam: "
            f"produto={iof_produto} exposicoes={iof_reconciliado_publicado}"
        )
    economia_base = _decimal(linha["economia_produto_bps"])
    efeito_spread = (
        cenario.spread_bps - parametros_base.spread_rail_bps
    ) * _decimal(linha["delta_bps_por_1bp_spread"])
    efeito_tarifa = (
        cenario.tarifa_fixa_brl - parametros_base.custo_fixo_remessa
    ) * _decimal(linha["delta_bps_por_1real_fixo"])
    efeito_carry = (
        cenario.carry_bps - parametros_base.carry_cnr * BPS
    ) * _decimal(linha["delta_bps_por_1bp_carry"])
    efeito_iof_bens = (
        cenario.iof_bens_servicos_out_bps
        - aliquota_iof(
            parametros_base, CHAVE_BENS_SERVICOS[0], Direcao(CHAVE_BENS_SERVICOS[1])
        )
        * BPS
    ) * exposicoes_iof.get(CHAVE_BENS_SERVICOS, Decimal(0))
    efeito_iof_ativos = (
        cenario.iof_ativos_virtuais_out_bps
        - aliquota_iof(
            parametros_base,
            CHAVE_ATIVOS_VIRTUAIS[0],
            Direcao(CHAVE_ATIVOS_VIRTUAIS[1]),
        )
        * BPS
    ) * exposicoes_iof.get(CHAVE_ATIVOS_VIRTUAIS, Decimal(0))
    economia = (
        economia_base
        + efeito_spread
        + efeito_tarifa
        + efeito_carry
        + efeito_iof_bens
        + efeito_iof_ativos
    )
    return {
        **{chave: linha[chave] for chave in CHAVES_IDENTIFICACAO},
        "cenario": cenario.nome,
        "descricao": cenario.descricao,
        "spread_bps": cenario.spread_bps,
        "tarifa_fixa_brl": cenario.tarifa_fixa_brl,
        "carry_bps": cenario.carry_bps,
        "iof_bens_servicos_out_bps": cenario.iof_bens_servicos_out_bps,
        "iof_ativos_virtuais_out_bps": cenario.iof_ativos_virtuais_out_bps,
        "economia_base_bps": economia_base,
        "efeito_spread_bps": efeito_spread,
        "efeito_tarifa_bps": efeito_tarifa,
        "efeito_carry_bps": efeito_carry,
        "efeito_iof_bens_servicos_bps": efeito_iof_bens,
        "efeito_iof_ativos_virtuais_bps": efeito_iof_ativos,
        "economia_estressada_bps": economia,
        "economia_positiva": economia > 0,
    }


def gerar_cenarios(
    produto: Sequence[Mapping[str, object]],
    exposicoes: Mapping[tuple[object, ...], Mapping[tuple[str, str], Decimal]],
    cenarios: Sequence[CenarioEstresse] = CENARIOS,
    parametros_base: ParametrosCusto = PARAMETROS_VARREDURA,
) -> list[dict[str, object]]:
    saida: list[dict[str, object]] = []
    for linha in produto:
        chave = _chave_identificacao(linha)
        if chave not in exposicoes:
            raise ValueError(f"linha de produto sem exposicao de IOF: {chave}")
        for cenario in cenarios:
            saida.append(
                reprecificar_economia(linha, exposicoes[chave], cenario, parametros_base)
            )
    return saida


def agregar_cenarios(linhas: Iterable[Mapping[str, object]]) -> list[dict[str, object]]:
    chaves = ("cenario", "nome_mix", "n_clientes", "janela_dias", "horizonte_dias")
    grupos: dict[tuple[object, ...], list[Mapping[str, object]]] = defaultdict(list)
    for linha in linhas:
        grupos[tuple(linha[chave] for chave in chaves)].append(linha)

    saida: list[dict[str, object]] = []
    for chave, grupo in grupos.items():
        valores = [_decimal(linha["economia_estressada_bps"]) for linha in grupo]
        primeiro = grupo[0]
        saida.append(
            {
                **dict(zip(chaves, chave)),
                "descricao": primeiro["descricao"],
                "spread_bps": primeiro["spread_bps"],
                "tarifa_fixa_brl": primeiro["tarifa_fixa_brl"],
                "carry_bps": primeiro["carry_bps"],
                "iof_bens_servicos_out_bps": primeiro["iof_bens_servicos_out_bps"],
                "iof_ativos_virtuais_out_bps": primeiro[
                    "iof_ativos_virtuais_out_bps"
                ],
                "n_sementes": len(grupo),
                "economia_estressada_bps_p10": percentil_empirico(
                    valores, Decimal("0.10")
                ),
                "economia_estressada_bps_p50": percentil_empirico(
                    valores, Decimal("0.50")
                ),
                "economia_estressada_bps_p90": percentil_empirico(
                    valores, Decimal("0.90")
                ),
                "fracao_economia_positiva": Decimal(
                    sum(1 for valor in valores if valor > 0)
                )
                / Decimal(len(valores)),
            }
        )
    return saida


def _ponto_zero(valor_atual: Decimal, parametro_atual: Decimal, inclinacao: Decimal):
    if inclinacao == 0:
        return None
    return parametro_atual - valor_atual / inclinacao


def gerar_limites(
    produto: Sequence[Mapping[str, object]],
    exposicoes: Mapping[tuple[object, ...], Mapping[tuple[str, str], Decimal]],
    parametros_base: ParametrosCusto = PARAMETROS_VARREDURA,
) -> list[dict[str, object]]:
    piso = next(c for c in CENARIOS if c.nome == "piso_sem_componentes_incertos")
    severo = next(c for c in CENARIOS if c.nome == "combinado_severo")
    saida: list[dict[str, object]] = []
    for linha in produto:
        chave = _chave_identificacao(linha)
        exposicao = exposicoes[chave]
        economia_base = _decimal(linha["economia_produto_bps"])
        economia_piso = _decimal(
            reprecificar_economia(linha, exposicao, piso, parametros_base)[
                "economia_estressada_bps"
            ]
        )
        economia_severa = _decimal(
            reprecificar_economia(linha, exposicao, severo, parametros_base)[
                "economia_estressada_bps"
            ]
        )
        inclinacao_carry = _decimal(linha["delta_bps_por_1bp_carry"])
        inclinacao_spread = _decimal(linha["delta_bps_por_1bp_spread"])
        spread_minimo = _ponto_zero(economia_piso, Decimal(0), inclinacao_spread)
        if spread_minimo is not None:
            spread_minimo = max(Decimal(0), spread_minimo)
        saida.append(
            {
                **{campo: linha[campo] for campo in CHAVES_IDENTIFICACAO},
                "economia_base_bps": economia_base,
                "economia_piso_bps": economia_piso,
                "economia_combinada_severa_bps": economia_severa,
                "carry_break_even_base_bps": _ponto_zero(
                    economia_base, CARRY_BASE_BPS, inclinacao_carry
                ),
                "carry_break_even_piso_bps": _ponto_zero(
                    economia_piso, CARRY_BASE_BPS, inclinacao_carry
                ),
                "spread_minimo_no_piso_bps": spread_minimo,
            }
        )
    return saida


def agregar_limites(linhas: Iterable[Mapping[str, object]]) -> list[dict[str, object]]:
    chaves = ("nome_mix", "n_clientes", "janela_dias", "horizonte_dias")
    metricas = (
        "economia_base_bps",
        "economia_piso_bps",
        "economia_combinada_severa_bps",
        "carry_break_even_base_bps",
        "carry_break_even_piso_bps",
        "spread_minimo_no_piso_bps",
    )
    grupos: dict[tuple[object, ...], list[Mapping[str, object]]] = defaultdict(list)
    for linha in linhas:
        grupos[tuple(linha[chave] for chave in chaves)].append(linha)

    saida: list[dict[str, object]] = []
    for chave, grupo in grupos.items():
        resumo: dict[str, object] = {**dict(zip(chaves, chave)), "n_sementes": len(grupo)}
        for metrica in metricas:
            valores = [
                _decimal(linha[metrica]) for linha in grupo if linha[metrica] is not None
            ]
            for sufixo, q in (("p10", "0.10"), ("p50", "0.50"), ("p90", "0.90")):
                resumo[f"{metrica}_{sufixo}"] = (
                    percentil_empirico(valores, Decimal(q)) if valores else None
                )
        saida.append(resumo)
    return saida


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--produto",
        type=Path,
        default=Path("resultados/sensibilidade/sensibilidade_produto_bruta.csv"),
    )
    parser.add_argument(
        "--iof",
        type=Path,
        default=Path("resultados/sensibilidade/sensibilidade_iof_bruta.csv"),
    )
    parser.add_argument("--manifesto-produto", type=Path)
    parser.add_argument("--manifesto-iof", type=Path)
    parser.add_argument(
        "--saida", type=Path, default=Path("resultados/sensibilidade")
    )
    args = parser.parse_args(argv)
    manifesto_produto_path = (
        args.manifesto_produto or args.produto.parent / "manifesto.json"
    )
    manifesto_iof_path = args.manifesto_iof or args.iof.parent / "manifesto.json"
    for caminho in (args.produto, args.iof, manifesto_produto_path, manifesto_iof_path):
        if not caminho.is_file():
            raise FileNotFoundError(caminho)
    manifesto_produto = ler_manifesto(manifesto_produto_path)
    manifesto_iof = ler_manifesto(manifesto_iof_path)
    validar_compatibilidade((manifesto_produto, manifesto_iof))
    produto = ler_csv(args.produto)
    iof = ler_csv(args.iof)
    exposicoes = indexar_exposicoes_iof(iof)
    cenarios = gerar_cenarios(
        produto, exposicoes, parametros_base=manifesto_produto.parametros_custo
    )
    resumo_cenarios = agregar_cenarios(cenarios)
    limites = gerar_limites(produto, exposicoes, manifesto_produto.parametros_custo)
    resumo_limites = agregar_limites(limites)

    escrever_csv(args.saida / "cenarios_estresse_bruta.csv", cenarios, RESSALVAS)
    escrever_csv(
        args.saida / "cenarios_estresse_agregada.csv", resumo_cenarios, RESSALVAS
    )
    escrever_csv(args.saida / "limites_break_even_bruta.csv", limites, RESSALVAS)
    escrever_csv(
        args.saida / "limites_break_even_agregada.csv", resumo_limites, RESSALVAS
    )
    print(
        f"estresse: {len(cenarios)} linhas em {len(resumo_cenarios)} celulas; "
        f"limites: {len(limites)} linhas em {len(resumo_limites)} celulas"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
