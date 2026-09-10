"""Converte a sensibilidade em bps para BRL usando fluxos explicitamente hipoteticos.

Esta etapa nao estima o fluxo real de Amanda, Wise, Nomad, AstroPay ou bancos.
Ela reaproveita o volume sintetico ja gerado pelos arquetipos como caso central e
aplica multiplicadores de 0,5x e 2,0x. Referencias publicas servem somente para
verificar ordem de grandeza; nao calibram a carteira candidata.

Ao redimensionar o fluxo, spread, IOF e carry permanecem proporcionais ao valor.
A parcela de tarifa fixa, entretanto, nao cresce com o ticket. Por isso seu efeito
em bps e corrigido por 1 / multiplicador antes da conversao para BRL.
"""

from __future__ import annotations

import argparse
import math
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from motor.analise.estatistica import percentil_empirico
from motor.arquetipos import TODOS as ARQUETIPOS
from scripts.estresse_sensibilidade import TARIFA_BASE_BRL, ler_csv
from scripts.sensibilidade_custo import (
    BPS,
    CHAVES_IDENTIFICACAO,
    _decimal,
    escrever_csv,
)


@dataclass(frozen=True)
class CenarioFluxo:
    nome: str
    multiplicador: Decimal
    descricao: str


CENARIOS_FLUXO = (
    CenarioFluxo(
        "baixo_0_5x",
        Decimal("0.5"),
        "Metade do volume sintetico central; faixa de incerteza, nao dado observado.",
    ),
    CenarioFluxo(
        "central_1_0x",
        Decimal("1.0"),
        "Volume produzido pelas hipoteses atuais de ticket e cadencia dos arquetipos.",
    ),
    CenarioFluxo(
        "alto_2_0x",
        Decimal("2.0"),
        "Duas vezes o volume sintetico central; faixa de incerteza, nao dado observado.",
    ),
)

RESSALVAS = (
    "# ATENCAO: todos os fluxos deste arquivo sao SUPOSICOES; nao sao dados reais da Amanda nem das empresas citadas.",
    "# O caso central reaproveita tickets, cadencias e dispersoes sinteticas de motor/arquetipos.py.",
    "# Os casos baixo e alto aplicam 0,5x e 2,0x ao volume central; esses multiplicadores nao vieram de dados observados.",
    "# Wise, Nomad, AstroPay e BCB sao referencias publicas de escala, nao fontes do fluxo projetado.",
    "# Cada Ordem continua sendo a posicao liquida que o cliente decidiu enviar; nao ha autonetting adicional.",
)

REFERENCIAS_PUBLICAS = (
    {
        "empresa_ou_fonte": "Wise",
        "metrica_publica": "volume transfronteirico anual",
        "valor_publico": "243.5",
        "unidade": "USD bilhoes",
        "periodo": "FY26 encerrado em 2026-03-31",
        "geografia": "global",
        "natureza": "dado publico divulgado",
        "uso_no_modelo": "teste de ordem de grandeza; nao entra como fluxo da carteira",
        "limitacao": "inclui pessoas e empresas no mundo; nao isola Brasil nem clientes candidatos",
        "fonte": "https://owners.wise.com/news-releases/news-release-details/wise-fy26-results",
    },
    {
        "empresa_ou_fonte": "Wise Business",
        "metrica_publica": "volume transfronteirico anual aproximado pela soma dos quatro trimestres",
        "valor_publico": "70.6",
        "unidade": "USD bilhoes",
        "periodo": "FY26",
        "geografia": "global",
        "natureza": "inferencia aritmetica sobre dados publicos",
        "uso_no_modelo": "referencia de escala para plataformas e empresas",
        "limitacao": "572 mil clientes ativos refere-se ao Q4; nao e base anual unica nem recorte Brasil",
        "fonte": "https://owners.wise.com/news-releases/news-release-details/wise-fy26-results",
    },
    {
        "empresa_ou_fonte": "Nomad",
        "metrica_publica": "clientes",
        "valor_publico": "mais de 3.8",
        "unidade": "milhoes de clientes",
        "periodo": "pagina consultada em 2026-09-07",
        "geografia": "brasileiros com produtos globais",
        "natureza": "dado publico divulgado",
        "uso_no_modelo": "teste de escala da base atendida",
        "limitacao": "clientes nao equivalem a volume anual de cambio",
        "fonte": "https://www.nomadglobal.com/quem-somos",
    },
    {
        "empresa_ou_fonte": "Nomad",
        "metrica_publica": "gasto informado em cartao de debito",
        "valor_publico": "50",
        "unidade": "BRL bilhoes",
        "periodo": "sem periodo anual informado na pagina",
        "geografia": "base Nomad",
        "natureza": "dado publico divulgado",
        "uso_no_modelo": "teste de ordem de grandeza",
        "limitacao": "nao e fluxo anual de cambio e nao deve ser anualizado",
        "fonte": "https://www.nomadglobal.com/quem-somos",
    },
    {
        "empresa_ou_fonte": "AstroPay",
        "metrica_publica": "usuarios acessiveis por empresas",
        "valor_publico": "milhoes; sem numero exato",
        "unidade": "usuarios",
        "periodo": "pagina consultada em 2026-09-07",
        "geografia": "global",
        "natureza": "dado publico qualitativo",
        "uso_no_modelo": "confirma perfil de PSP/plataforma internacional",
        "limitacao": "nao ha volume transacionado publico na pagina",
        "fonte": "https://www.astropay.com/business",
    },
    {
        "empresa_ou_fonte": "Banco Central do Brasil",
        "metrica_publica": "ranking mensal de cambio por instituicao financeira",
        "valor_publico": "quantidade e valor por categoria",
        "unidade": "USD equivalente",
        "periodo": "mensal",
        "geografia": "Brasil",
        "natureza": "base publica oficial",
        "uso_no_modelo": "referencia futura para calibracao por banco",
        "limitacao": "mede operacoes registradas pelas IFs; nao e fluxo enviado ao orquestrador",
        "fonte": "https://www.bcb.gov.br/estatisticas/rankingcambioinstituicoes?ano=2026",
    },
)


def fluxo_anual_central(arquetipo: object) -> Decimal:
    """Valor esperado anual da distribuicao lognormal usada pelo gerador."""

    media_ticket = float(arquetipo.ticket_mediana_brl) * math.exp(
        arquetipo.ticket_sigma**2 / 2
    )
    return Decimal(str(media_ticket * arquetipo.cadencia_mensal * 12))


def gerar_premissas_arquetipos(
    cenarios: Sequence[CenarioFluxo] = CENARIOS_FLUXO,
) -> list[dict[str, object]]:
    saida: list[dict[str, object]] = []
    for nome, arquetipo in ARQUETIPOS.items():
        central = fluxo_anual_central(arquetipo)
        for cenario in cenarios:
            saida.append(
                {
                    "cenario_fluxo": cenario.nome,
                    "multiplicador_fluxo": cenario.multiplicador,
                    "descricao_cenario": cenario.descricao,
                    "arquetipo": nome,
                    "referencia_descritiva": {
                        "remessa_outbound_massiva": "Wise/servicos de remessa",
                        "psp_inbound": "AstroPay/PSPs",
                        "cripto_native_sem_fiat": "plataformas cripto",
                        "payroll_fornecedor": "plataformas de folha e fornecedores",
                        "exportador": "empresas exportadoras",
                        "tesouraria_corporativa": "bancos e tesourarias corporativas",
                    }[nome],
                    "ticket_mediana_brl": arquetipo.ticket_mediana_brl,
                    "ticket_sigma": Decimal(str(arquetipo.ticket_sigma)),
                    "cadencia_mensal": Decimal(str(arquetipo.cadencia_mensal)),
                    "fluxo_anual_central_brl": central,
                    "fluxo_anual_assumido_brl": central * cenario.multiplicador,
                    "formula_central": "mediana_ticket * exp(sigma^2/2) * cadencia_mensal * 12",
                    "natureza_do_fluxo": "SUPOSICAO SINTETICA; substituir quando houver dado real",
                }
            )
    return saida


def _chave(linha: Mapping[str, object]) -> tuple[object, ...]:
    return tuple(linha[campo] for campo in CHAVES_IDENTIFICACAO)


def indexar_produto(
    produto: Iterable[Mapping[str, object]],
) -> dict[tuple[object, ...], Mapping[str, object]]:
    indice: dict[tuple[object, ...], Mapping[str, object]] = {}
    for linha in produto:
        chave = _chave(linha)
        if chave in indice:
            raise ValueError(f"linha duplicada na sensibilidade de produto: {chave}")
        indice[chave] = linha
    return indice


def projetar_linha(
    estresse: Mapping[str, object],
    produto: Mapping[str, object],
    cenario_fluxo: CenarioFluxo,
) -> dict[str, object]:
    multiplicador = cenario_fluxo.multiplicador
    if multiplicador <= 0:
        raise ValueError("multiplicador de fluxo deve ser positivo")

    volume_central = _decimal(produto["volume_bruto_brl"])
    volume_assumido = volume_central * multiplicador
    economia_original = _decimal(estresse["economia_estressada_bps"])
    tarifa_cenario = _decimal(estresse["tarifa_fixa_brl"])
    fixo_base = _decimal(produto["fixo_evitado_bps"])
    fixo_no_cenario_original = (
        fixo_base * tarifa_cenario / TARIFA_BASE_BRL if TARIFA_BASE_BRL else Decimal(0)
    )
    economia_ajustada = (
        economia_original
        - fixo_no_cenario_original
        + fixo_no_cenario_original / multiplicador
    )
    economia_brl = economia_ajustada / BPS * volume_assumido

    return {
        **{campo: estresse[campo] for campo in CHAVES_IDENTIFICACAO},
        "cenario_custo": estresse["cenario"],
        "descricao_custo": estresse["descricao"],
        "cenario_fluxo": cenario_fluxo.nome,
        "descricao_fluxo": cenario_fluxo.descricao,
        "multiplicador_fluxo": multiplicador,
        "natureza_do_fluxo": "SUPOSICAO SINTETICA; NAO E DADO REAL",
        "volume_anual_central_brl": volume_central,
        "volume_anual_assumido_brl": volume_assumido,
        "tarifa_fixa_cenario_brl": tarifa_cenario,
        "fixo_evitado_bps_escala_central": fixo_no_cenario_original,
        "fixo_evitado_bps_escala_assumida": fixo_no_cenario_original / multiplicador,
        "economia_bps_escala_central": economia_original,
        "economia_bps_escala_assumida": economia_ajustada,
        "economia_anual_assumida_brl": economia_brl,
        "economia_positiva": economia_ajustada > 0,
    }


def gerar_projecoes(
    estresse: Iterable[Mapping[str, object]],
    produto: Iterable[Mapping[str, object]],
    cenarios_fluxo: Sequence[CenarioFluxo] = CENARIOS_FLUXO,
) -> list[dict[str, object]]:
    indice = indexar_produto(produto)
    saida: list[dict[str, object]] = []
    for linha in estresse:
        chave = _chave(linha)
        if chave not in indice:
            raise ValueError(f"cenario de estresse sem linha de produto: {chave}")
        for cenario in cenarios_fluxo:
            saida.append(projetar_linha(linha, indice[chave], cenario))
    return saida


def agregar_projecoes(
    linhas: Iterable[Mapping[str, object]],
) -> list[dict[str, object]]:
    chaves = (
        "cenario_custo",
        "nome_mix",
        "n_clientes",
        "janela_dias",
        "horizonte_dias",
        "cenario_fluxo",
    )
    grupos: dict[tuple[object, ...], list[Mapping[str, object]]] = defaultdict(list)
    for linha in linhas:
        grupos[tuple(linha[campo] for campo in chaves)].append(linha)

    saida: list[dict[str, object]] = []
    for chave, grupo in grupos.items():
        primeiro = grupo[0]
        resumo: dict[str, object] = {
            **dict(zip(chaves, chave)),
            "descricao_custo": primeiro["descricao_custo"],
            "descricao_fluxo": primeiro["descricao_fluxo"],
            "multiplicador_fluxo": primeiro["multiplicador_fluxo"],
            "natureza_do_fluxo": "SUPOSICAO SINTETICA; NAO E DADO REAL",
            "n_sementes": len(grupo),
        }
        for metrica in (
            "volume_anual_central_brl",
            "volume_anual_assumido_brl",
            "economia_bps_escala_assumida",
            "economia_anual_assumida_brl",
        ):
            valores = [_decimal(linha[metrica]) for linha in grupo]
            for nome_q, q in (("p10", "0.10"), ("p50", "0.50"), ("p90", "0.90")):
                resumo[f"{metrica}_{nome_q}"] = percentil_empirico(
                    valores, Decimal(q)
                )
        resumo["fracao_economia_positiva"] = Decimal(
            sum(1 for linha in grupo if linha["economia_positiva"])
        ) / Decimal(len(grupo))
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
        "--estresse",
        type=Path,
        default=Path("resultados/sensibilidade/cenarios_estresse_bruta.csv"),
    )
    parser.add_argument(
        "--saida", type=Path, default=Path("resultados/sensibilidade")
    )
    args = parser.parse_args(argv)

    produto = ler_csv(args.produto)
    estresse = ler_csv(args.estresse)
    premissas = gerar_premissas_arquetipos()
    projecoes = gerar_projecoes(estresse, produto)
    agregadas = agregar_projecoes(projecoes)

    escrever_csv(
        args.saida / "referencias_fluxo_publicas.csv",
        REFERENCIAS_PUBLICAS,
        RESSALVAS,
    )
    escrever_csv(
        args.saida / "premissas_fluxo_arquetipos.csv", premissas, RESSALVAS
    )
    escrever_csv(
        args.saida / "projecao_fluxo_hipotetico_bruta.csv", projecoes, RESSALVAS
    )
    escrever_csv(
        args.saida / "projecao_fluxo_hipotetico_agregada.csv", agregadas, RESSALVAS
    )
    print(
        f"fluxo: {len(premissas)} premissas; "
        f"projecao: {len(projecoes)} linhas em {len(agregadas)} celulas"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
