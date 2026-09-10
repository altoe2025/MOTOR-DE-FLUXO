"""Sensibilidade economica da grade sob o contrato de entrada liquida.

Ha duas leituras complementares:

1. A grade publicada de 27.000 linhas e reaproveitada para decompor a economia
   do modelo e medir, sem nova simulacao, as derivadas de spread, custo fixo e carry.
2. Para N=8 e N=12, as bases de IOF sao abertas por finalidade e direcao. O
   contrafactual aprovado e cada posicao liquida executando sozinha; nao se aplica
   uma segunda rodada de netting dentro do cliente, pois o orquestrador ja recebe
   somente o que o proprio cliente decidiu colocar na pool.

Os parametros de custo nao afetam a alocacao da P0. Por isso a rotina extrai as
bases de incidencia uma vez e permite reprecifica-las sem regenerar a carteira.

Este script e uma analise. Nao altera motor/, nao muda a politica e nao apresenta
os valores absolutos como cotacao: spread, custo fixo e duas regras de IOF ainda
precisam de dado real/confirmacao normativa.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from motor.analise import ManifestoExecucao, ModoAnalise, validar_compatibilidade
from motor.analise.estatistica import percentil_empirico, validar_seeds_unicas
from motor.custo import Custos, aliquota_iof, custo_baseline, custo_netado
from motor.dominio import Cenario, Ciclo, Direcao, Ordem, ParametrosCusto, TipoAlocacao
from motor.mixes import TODOS as MIXES
from motor.netting import executar_p0
from motor.varredura import PARAMETROS_VARREDURA, montar_pool_do_ponto


BPS = Decimal(10_000)
DIAS_NO_ANO = Decimal(365)
HORIZONTE_PADRAO = 365
VALORES_N_INCREMENTAL = (8, 12)
VALORES_W_INCREMENTAL = (1, 7)
SEMENTES_PADRAO = tuple(range(1, 301))

CHAVES_IDENTIFICACAO = (
    "nome_mix",
    "n_clientes",
    "janela_dias",
    "horizonte_dias",
    "seed_base",
)

METRICAS_GRADE = (
    "economia_produto_bps",
    "iof_evitado_bps",
    "spread_evitado_bps",
    "fixo_evitado_bps",
    "carry_criado_bps",
    "espera_criada_bps",
    "participacao_iof",
    "participacao_spread",
    "participacao_fixo",
    "participacao_carry",
    "delta_bps_por_1bp_spread",
    "delta_bps_por_1real_fixo",
    "delta_bps_por_1bp_carry",
)

METRICAS_PRODUTO = (
    "economia_produto_bps",
    "iof_evitado_bps",
    "spread_evitado_bps",
    "fixo_evitado_bps",
    "carry_criado_bps",
    "espera_criada_bps",
    "participacao_iof",
    "participacao_spread",
    "participacao_fixo",
    "participacao_carry",
    "taxa_netabilidade_pool",
    "delta_bps_por_1bp_spread",
    "delta_bps_por_1real_fixo",
    "delta_bps_por_1bp_carry",
    "delta_bps_por_1bp_oportunidade_aa",
)

RESSALVAS_GRADE = (
    "# Contrato de leitura: cada Ordem e uma posicao liquida que o cliente decidiu enviar ao orquestrador.",
    "# O baseline executa cada posicao liquida sozinha; nao ha segunda deducao de autonetting.",
    "# Spread, custo fixo e duas regras de IOF ainda nao sao dados calibrados/confirmados.",
)

RESSALVAS_PRODUTO = (
    "# Economia do produto = custo de cada posicao liquida executada sozinha - custo da pool.",
    "# Nao se roda P0 por cliente: a entrada ja e liquida por decisao de negocio.",
    "# Valores em bps; BRL sintetico nao deve ser apresentado como projecao comercial.",
)


@dataclass(frozen=True)
class BasesPrecificacao:
    """Quantidades suficientes para reprecificar ciclos sem executar a P0 de novo."""

    remetido_por_chave: Mapping[tuple[str, Direcao], Decimal]
    volume_remetido_brl: Decimal
    volume_casado_brl: Decimal
    volume_dias_espera: Decimal
    n_remessas: int


def _decimal(valor: object) -> Decimal:
    return Decimal(str(valor))


def _bps(valor_brl: Decimal, volume_bruto_brl: Decimal) -> Decimal:
    if volume_bruto_brl == 0:
        return Decimal(0)
    return valor_brl / volume_bruto_brl * BPS


def _participacao(parcela: Decimal, economia: Decimal) -> Decimal:
    return parcela / economia if economia else Decimal(0)


def extrair_bases(ciclos: Iterable[Ciclo], ordens: Iterable[Ordem]) -> BasesPrecificacao:
    """Extrai bases por alocacao; nao recalcula netting nem custo."""

    ciclos = tuple(ciclos)
    ordem_por_id = {ordem.id: ordem for ordem in ordens}
    remetido_por_chave: dict[tuple[str, Direcao], Decimal] = defaultdict(Decimal)
    remetido = Decimal(0)
    casado = Decimal(0)
    volume_dias = Decimal(0)

    for ciclo in ciclos:
        for alocacao in ciclo.alocacoes:
            ordem = ordem_por_id[alocacao.ordem_id]
            volume_dias += alocacao.valor_brl * Decimal(alocacao.dia - ordem.dia_conhecida)
            if alocacao.tipo is TipoAlocacao.REMETIDO:
                remetido += alocacao.valor_brl
                remetido_por_chave[(ordem.finalidade, ordem.direcao)] += alocacao.valor_brl
            else:
                casado += alocacao.valor_brl

    return BasesPrecificacao(
        remetido_por_chave=dict(remetido_por_chave),
        volume_remetido_brl=remetido,
        volume_casado_brl=casado,
        volume_dias_espera=volume_dias,
        n_remessas=sum(1 for ciclo in ciclos if ciclo.residuo > 0),
    )


def bases_do_baseline(ordens: Iterable[Ordem]) -> BasesPrecificacao:
    """Cada posicao liquida cruza sozinha no dia em que fica conhecida."""

    ordens = tuple(ordens)
    por_chave: dict[tuple[str, Direcao], Decimal] = defaultdict(Decimal)
    for ordem in ordens:
        por_chave[(ordem.finalidade, ordem.direcao)] += ordem.valor_brl
    return BasesPrecificacao(
        remetido_por_chave=dict(por_chave),
        volume_remetido_brl=sum((o.valor_brl for o in ordens), Decimal(0)),
        volume_casado_brl=Decimal(0),
        volume_dias_espera=Decimal(0),
        n_remessas=len(ordens),
    )


def precificar_bases(base: BasesPrecificacao, custo: ParametrosCusto) -> Custos:
    """Reprecifica bases fixas. Deve coincidir exatamente com custo_netado."""

    iof = sum(
        (
            volume * aliquota_iof(custo, finalidade, direcao)
            for (finalidade, direcao), volume in base.remetido_por_chave.items()
        ),
        Decimal(0),
    )
    carry = base.volume_casado_brl * custo.carry_cnr
    spread = base.volume_remetido_brl * custo.spread_rail_bps / BPS
    espera = base.volume_dias_espera * custo.custo_oportunidade_aa / DIAS_NO_ANO
    fixo = Decimal(base.n_remessas) * custo.custo_fixo_remessa
    return Custos(
        iof=iof,
        carry=carry,
        spread=spread,
        espera=espera,
        fixo=fixo,
        total=iof + carry + spread + espera + fixo,
    )


def _validar_reprecificacao(
    esperado: Custos, base: BasesPrecificacao, custo: ParametrosCusto, contexto: str
) -> None:
    obtido = precificar_bases(base, custo)
    if obtido != esperado:
        raise ValueError(
            f"bases de precificacao nao reproduzem custo_netado em {contexto}: "
            f"esperado={esperado!r} obtido={obtido!r}"
        )


def _validar_parametros_grade(
    registro: Mapping[str, str], manifesto: ManifestoExecucao
) -> None:
    volume = _decimal(registro["volume_bruto_brl"])
    spread_registrado = registro.get("spread_base_bps")
    if spread_registrado is None:
        spread_esperado_brl = (
            volume * manifesto.parametros_custo.spread_rail_bps / BPS
        )
        spread_registrado_brl = _decimal(registro["baseline_spread_brl"])
        compativel = (
            abs(spread_registrado_brl - spread_esperado_brl) <= Decimal("0.005")
        )
    else:
        compativel = (
            _decimal(spread_registrado)
            == manifesto.parametros_custo.spread_rail_bps
        )
    if not compativel:
        raise ValueError(
            "parametros-base incompativeis: spread da grade diverge do manifesto"
        )


def decompor_linha_grade(
    registro: Mapping[str, str], manifesto: ManifestoExecucao | None = None
) -> dict[str, object]:
    """Reaproveita uma linha publicada; nenhuma simulacao e executada."""

    if manifesto is None:
        parametros_base = PARAMETROS_VARREDURA
    else:
        validar_compatibilidade((manifesto,))
        _validar_parametros_grade(registro, manifesto)
        parametros_base = manifesto.parametros_custo

    volume = _decimal(registro["volume_bruto_brl"])
    economia = _decimal(registro["economia_brl"])
    iof = _decimal(registro["baseline_iof_brl"]) - _decimal(registro["netado_iof_brl"])
    spread = _decimal(registro["baseline_spread_brl"]) - _decimal(
        registro["netado_spread_brl"]
    )
    fixo = _decimal(registro["baseline_fixo_brl"]) - _decimal(registro["netado_fixo_brl"])
    carry = _decimal(registro["baseline_carry_brl"]) - _decimal(
        registro["netado_carry_brl"]
    )
    espera = _decimal(registro["baseline_espera_brl"]) - _decimal(
        registro["netado_espera_brl"]
    )
    recomposta = iof + spread + fixo + carry + espera
    # O CSV monetario tem duas casas; aceite apenas o residuo possivel do arredondamento.
    if abs(recomposta - economia) > Decimal("0.05"):
        raise ValueError(
            f"decomposicao nao fecha na linha {tuple(registro[c] for c in CHAVES_IDENTIFICACAO)}: "
            f"economia={economia} recomposta={recomposta}"
        )

    spread_base = parametros_base.spread_rail_bps
    fixo_base = parametros_base.custo_fixo_remessa
    carry_base_bps = parametros_base.carry_cnr * BPS

    return {
        **{chave: registro[chave] for chave in CHAVES_IDENTIFICACAO},
        "volume_bruto_brl": volume,
        "economia_produto_bps": _bps(economia, volume),
        "iof_evitado_bps": _bps(iof, volume),
        "spread_evitado_bps": _bps(spread, volume),
        "fixo_evitado_bps": _bps(fixo, volume),
        "carry_criado_bps": _bps(carry, volume),
        "espera_criada_bps": _bps(espera, volume),
        "participacao_iof": _participacao(iof, economia),
        "participacao_spread": _participacao(spread, economia),
        "participacao_fixo": _participacao(fixo, economia),
        "participacao_carry": _participacao(carry, economia),
        "delta_bps_por_1bp_spread": _bps(spread, volume) / spread_base,
        "delta_bps_por_1real_fixo": _bps(fixo, volume) / fixo_base,
        "delta_bps_por_1bp_carry": _bps(carry, volume) / carry_base_bps,
        "erro_recomposicao_brl": recomposta - economia,
    }


def ler_grade_publicada(caminho: Path) -> list[dict[str, str]]:
    with caminho.open(encoding="utf-8", newline="") as arquivo:
        linhas = (linha for linha in arquivo if not linha.startswith("#"))
        return list(csv.DictReader(linhas))


def ler_manifesto(caminho: Path) -> ManifestoExecucao:
    documento = json.loads(caminho.read_text(encoding="utf-8"))
    custo_doc = documento["parametros_custo"]
    regras = {
        (regra["finalidade"], Direcao(regra["direcao"])): _decimal(regra["aliquota"])
        for regra in custo_doc.get("iof_por_finalidade", ())
    }
    custo = ParametrosCusto(
        iof_out=_decimal(custo_doc["iof_out"]),
        iof_in=_decimal(custo_doc["iof_in"]),
        carry_cnr=_decimal(custo_doc["carry_cnr"]),
        spread_rail_bps=_decimal(custo_doc["spread_rail_bps"]),
        custo_fixo_remessa=_decimal(custo_doc["custo_fixo_remessa"]),
        custo_oportunidade_aa=_decimal(custo_doc["custo_oportunidade_aa"]),
        ptax=_decimal(custo_doc["ptax"]),
        iof_por_finalidade=regras,
    )
    manifesto = ManifestoExecucao(
        run_id=documento["run_id"],
        schema_version=documento["schema_version"],
        versao_motor=documento["versao_motor"],
        criado_em_utc=documento["criado_em_utc"],
        hash_configuracao=documento["hash_configuracao"],
        run_ids_origem=tuple(documento["run_ids_origem"]),
        parametros_custo=custo,
        mixes=tuple(documento["mixes"]),
        arquetipos=tuple(documento["arquetipos"]),
        horizonte_dias=documento["horizonte_dias"],
        periodo_medicao_dias=documento["periodo_medicao_dias"],
        janela_dias=documento["janela_dias"],
        seeds=tuple(documento["seeds"]),
        modo_analise=ModoAnalise(documento["modo_analise"]),
        custo_calibrado=documento["custo_calibrado"],
        metodo_percentil=documento["metodo_percentil"],
        drenagem=documento["drenagem"],
        avisos=tuple(documento["avisos"]),
    )
    validar_compatibilidade((manifesto,))
    return manifesto


def agregar_por_celula(
    linhas: Iterable[Mapping[str, object]], metricas: Sequence[str]
) -> list[dict[str, object]]:
    grupos: dict[tuple[object, ...], list[Mapping[str, object]]] = defaultdict(list)
    chaves = ("nome_mix", "n_clientes", "janela_dias", "horizonte_dias")
    for linha in linhas:
        grupos[tuple(linha[c] for c in chaves)].append(linha)

    saida: list[dict[str, object]] = []
    for chave, grupo in grupos.items():
        resumo: dict[str, object] = dict(zip(chaves, chave))
        resumo["n_sementes"] = len(grupo)
        for metrica in metricas:
            valores = [_decimal(linha[metrica]) for linha in grupo]
            resumo[f"{metrica}_p10"] = percentil_empirico(valores, Decimal("0.10"))
            resumo[f"{metrica}_p50"] = percentil_empirico(valores, Decimal("0.50"))
            resumo[f"{metrica}_p90"] = percentil_empirico(valores, Decimal("0.90"))
        saida.append(resumo)
    return saida


def _cenario(
    ordens: tuple[Ordem, ...], w: int, horizonte: int, custo: ParametrosCusto
) -> Cenario:
    return Cenario(
        ordens=ordens,
        janela_dias=w,
        horizonte_dias=horizonte,
        custo=custo,
    )


def avaliar_produto(
    nome_mix: str,
    n_clientes: int,
    seed: int,
    valores_w: Sequence[int],
    horizonte: int = HORIZONTE_PADRAO,
    custo: ParametrosCusto = PARAMETROS_VARREDURA,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Avalia a pool contra cada posicao liquida executada sozinha."""

    pool = montar_pool_do_ponto(MIXES[nome_mix], n_clientes, horizonte, seed)
    volume = sum((ordem.valor_brl for ordem in pool), Decimal(0))
    base_baseline = bases_do_baseline(pool)

    linhas: list[dict[str, object]] = []
    linhas_iof: list[dict[str, object]] = []

    for w in valores_w:
        cenario_pool = _cenario(pool, w, horizonte, custo)
        custo_sem_pool = custo_baseline(cenario_pool)
        ciclos_pool = executar_p0(cenario_pool)
        custo_pool = custo_netado(ciclos_pool, cenario_pool)
        bases_pool = extrair_bases(ciclos_pool, pool)
        _validar_reprecificacao(custo_pool, bases_pool, cenario_pool.custo, "pool")
        _validar_reprecificacao(
            custo_sem_pool, base_baseline, custo, "baseline liquido"
        )

        componentes = {
            "iof_evitado_brl": custo_sem_pool.iof - custo_pool.iof,
            "spread_evitado_brl": custo_sem_pool.spread - custo_pool.spread,
            "fixo_evitado_brl": custo_sem_pool.fixo - custo_pool.fixo,
            "carry_criado_brl": custo_sem_pool.carry - custo_pool.carry,
            "espera_criada_brl": custo_sem_pool.espera - custo_pool.espera,
        }
        economia = custo_sem_pool.total - custo_pool.total
        recomposta = sum(componentes.values(), Decimal(0))
        if recomposta != economia:
            raise ValueError(
                f"economia do produto nao fecha para {(nome_mix, n_clientes, w, seed)}: "
                f"economia={economia} recomposta={recomposta}"
            )

        delta_remetido = base_baseline.volume_remetido_brl - bases_pool.volume_remetido_brl
        delta_casado = base_baseline.volume_casado_brl - bases_pool.volume_casado_brl
        delta_remessas = base_baseline.n_remessas - bases_pool.n_remessas
        delta_volume_dias = base_baseline.volume_dias_espera - bases_pool.volume_dias_espera

        linha: dict[str, object] = {
            "nome_mix": nome_mix,
            "n_clientes": n_clientes,
            "janela_dias": w,
            "horizonte_dias": horizonte,
            "seed_base": seed,
            "volume_bruto_brl": volume,
            "spread_base_bps": custo.spread_rail_bps,
            "tarifa_base_brl": custo.custo_fixo_remessa,
            "carry_base_bps": custo.carry_cnr * BPS,
            "custo_sem_pool_brl": custo_sem_pool.total,
            "custo_pool_brl": custo_pool.total,
            "economia_produto_brl": economia,
            "economia_produto_bps": _bps(economia, volume),
            "taxa_netabilidade_pool": (delta_remetido / volume if volume else Decimal(0)),
            "n_remessas_sem_pool": base_baseline.n_remessas,
            "n_remessas_pool": bases_pool.n_remessas,
            "delta_remessas": delta_remessas,
            "delta_bps_por_1bp_spread": delta_remetido / volume if volume else Decimal(0),
            "delta_bps_por_1real_fixo": (
                Decimal(delta_remessas) / volume * BPS if volume else Decimal(0)
            ),
            "delta_bps_por_1bp_carry": delta_casado / volume if volume else Decimal(0),
            "delta_bps_por_1bp_oportunidade_aa": (
                delta_volume_dias / DIAS_NO_ANO / volume if volume else Decimal(0)
            ),
        }
        for nome, valor in componentes.items():
            linha[nome] = valor
            linha[nome.replace("_brl", "_bps")] = _bps(valor, volume)
        linha["participacao_iof"] = _participacao(componentes["iof_evitado_brl"], economia)
        linha["participacao_spread"] = _participacao(
            componentes["spread_evitado_brl"], economia
        )
        linha["participacao_fixo"] = _participacao(
            componentes["fixo_evitado_brl"], economia
        )
        linha["participacao_carry"] = _participacao(
            componentes["carry_criado_brl"], economia
        )
        linhas.append(linha)

        chaves_iof = sorted(
            set(base_baseline.remetido_por_chave) | set(bases_pool.remetido_por_chave),
            key=lambda item: (item[0], item[1].value),
        )
        for finalidade, direcao in chaves_iof:
            delta_volume = base_baseline.remetido_por_chave.get(
                (finalidade, direcao), Decimal(0)
            ) - bases_pool.remetido_por_chave.get((finalidade, direcao), Decimal(0))
            aliquota = aliquota_iof(custo, finalidade, direcao)
            linhas_iof.append(
                {
                    **{chave: linha[chave] for chave in CHAVES_IDENTIFICACAO},
                    "finalidade": finalidade,
                    "direcao": direcao.value,
                    "aliquota_base": aliquota,
                    "delta_volume_remetido_brl": delta_volume,
                    "iof_evitado_brl_base": delta_volume * aliquota,
                    "iof_evitado_bps_base": _bps(delta_volume * aliquota, volume),
                    "delta_bps_por_1bp_aliquota": (
                        delta_volume / volume if volume else Decimal(0)
                    ),
                }
            )

        iof_por_chave = sum(
            (
                _decimal(item["iof_evitado_brl_base"])
                for item in linhas_iof
                if all(item[c] == linha[c] for c in CHAVES_IDENTIFICACAO)
            ),
            Decimal(0),
        )
        if iof_por_chave != componentes["iof_evitado_brl"]:
            raise ValueError(
                f"decomposicao de IOF nao fecha para {(nome_mix, n_clientes, w, seed)}"
            )

    return linhas, linhas_iof


def agregar_iof(linhas: Iterable[Mapping[str, object]]) -> list[dict[str, object]]:
    chaves = (
        "nome_mix",
        "n_clientes",
        "janela_dias",
        "horizonte_dias",
        "finalidade",
        "direcao",
    )
    grupos: dict[tuple[object, ...], list[Mapping[str, object]]] = defaultdict(list)
    for linha in linhas:
        grupos[tuple(linha[c] for c in chaves)].append(linha)

    saida: list[dict[str, object]] = []
    for chave, grupo in grupos.items():
        resumo: dict[str, object] = dict(zip(chaves, chave))
        resumo["n_sementes"] = len(grupo)
        resumo["aliquota_base"] = grupo[0]["aliquota_base"]
        for metrica in ("iof_evitado_bps_base", "delta_bps_por_1bp_aliquota"):
            valores = [_decimal(linha[metrica]) for linha in grupo]
            for nome_q, q in (("p10", "0.10"), ("p50", "0.50"), ("p90", "0.90")):
                resumo[f"{metrica}_{nome_q}"] = percentil_empirico(
                    valores, Decimal(q)
                )
        saida.append(resumo)
    return saida


def escrever_csv(
    caminho: Path, linhas: Sequence[Mapping[str, object]], ressalvas: Sequence[str]
) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    if not linhas:
        raise ValueError(f"nenhuma linha para escrever em {caminho}")
    colunas = list(linhas[0].keys())
    with caminho.open("w", encoding="utf-8", newline="") as arquivo:
        for ressalva in ressalvas:
            arquivo.write(ressalva + "\n")
        escritor = csv.DictWriter(arquivo, fieldnames=colunas)
        escritor.writeheader()
        for linha in linhas:
            formatada: dict[str, object] = {}
            for nome, valor in linha.items():
                if not isinstance(valor, Decimal):
                    formatada[nome] = valor
                elif nome.endswith("_brl"):
                    formatada[nome] = valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                elif "aliquota" in nome:
                    formatada[nome] = valor.quantize(
                        Decimal("0.00000001"), rounding=ROUND_HALF_UP
                    )
                else:
                    formatada[nome] = valor.quantize(
                        Decimal("0.000001"), rounding=ROUND_HALF_UP
                    )
            escritor.writerow(formatada)


def _lista_int(texto: str) -> tuple[int, ...]:
    if ":" in texto:
        inicio, fim = (int(parte) for parte in texto.split(":", 1))
        return tuple(range(inicio, fim + 1))
    return tuple(int(parte) for parte in texto.split(",") if parte)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--grade",
        type=Path,
        default=Path("resultados/varredura_bruta.csv"),
        help="CSV bruto publicado, com comentarios # no topo",
    )
    parser.add_argument(
        "--saida",
        type=Path,
        default=Path("resultados/sensibilidade"),
        help="diretorio dos CSVs derivados",
    )
    parser.add_argument("--n", default="8,12")
    parser.add_argument("--w", default="1,7")
    parser.add_argument("--sementes", default="1:300")
    parser.add_argument("--mixes", default=",".join(MIXES))
    parser.add_argument(
        "--somente-grade",
        action="store_true",
        help="nao regenera pools; produz apenas a decomposicao bruta publicada",
    )
    parser.add_argument(
        "--manifesto",
        type=Path,
        default=Path("resultados/manifesto.json"),
        help="manifesto canonico da grade de origem",
    )
    args = parser.parse_args(argv)
    sementes = validar_seeds_unicas(_lista_int(args.sementes))
    nomes_mix = tuple(nome for nome in args.mixes.split(",") if nome)
    valores_n = _lista_int(args.n)
    valores_w = _lista_int(args.w)
    desconhecidos = sorted(set(nomes_mix) - set(MIXES))
    if desconhecidos:
        parser.error(f"mixes desconhecidos: {desconhecidos}")
    if not nomes_mix:
        parser.error("ao menos um mix e obrigatorio")
    if not valores_n or any(valor <= 0 for valor in valores_n):
        parser.error("n deve conter inteiros positivos")
    if not valores_w or any(valor <= 0 for valor in valores_w):
        parser.error("w deve conter inteiros positivos")
    if not sementes:
        parser.error("ao menos uma seed e obrigatoria")
    if not args.grade.is_file():
        raise FileNotFoundError(args.grade)
    if not args.manifesto.is_file():
        raise FileNotFoundError(args.manifesto)
    manifesto = ler_manifesto(args.manifesto)
    registros = ler_grade_publicada(args.grade)
    decomposicao = [decompor_linha_grade(registro, manifesto) for registro in registros]
    resumo_grade = agregar_por_celula(decomposicao, METRICAS_GRADE)

    produto: list[dict[str, object]] = []
    iof: list[dict[str, object]] = []
    total = (
        0
        if args.somente_grade
        else len(nomes_mix) * len(valores_n) * len(sementes)
    )
    concluido = 0
    for nome_mix in (() if args.somente_grade else nomes_mix):
        for n_clientes in valores_n:
            for seed in sementes:
                linhas, linhas_iof = avaliar_produto(
                    nome_mix,
                    n_clientes,
                    seed,
                    valores_w,
                    HORIZONTE_PADRAO,
                    manifesto.parametros_custo,
                )
                produto.extend(linhas)
                iof.extend(linhas_iof)
                concluido += 1
                if concluido % 25 == 0 or concluido == total:
                    print(f"produto: {concluido}/{total} pools", flush=True)

    resumo_produto = agregar_por_celula(produto, METRICAS_PRODUTO) if produto else []
    resumo_iof = agregar_iof(iof) if iof else []
    escrever_csv(
        args.saida / "decomposicao_grade_bruta.csv", decomposicao, RESSALVAS_GRADE
    )
    escrever_csv(
        args.saida / "decomposicao_grade_agregada.csv", resumo_grade, RESSALVAS_GRADE
    )
    print(f"grade publicada: {len(decomposicao)} linhas; {len(resumo_grade)} celulas")
    if args.somente_grade:
        return 0
    escrever_csv(
        args.saida / "sensibilidade_produto_bruta.csv",
        produto,
        RESSALVAS_PRODUTO,
    )
    escrever_csv(
        args.saida / "sensibilidade_produto_agregada.csv",
        resumo_produto,
        RESSALVAS_PRODUTO,
    )
    escrever_csv(
        args.saida / "sensibilidade_iof_bruta.csv", iof, RESSALVAS_PRODUTO
    )
    escrever_csv(
        args.saida / "sensibilidade_iof_agregada.csv", resumo_iof, RESSALVAS_PRODUTO
    )
    print(
        f"produto: {len(produto)} linhas; "
        f"{len(resumo_produto)} celulas; {len(resumo_iof)} exposicoes IOF"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
