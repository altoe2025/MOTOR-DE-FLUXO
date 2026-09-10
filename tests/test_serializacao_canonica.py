import csv
import hashlib
import json
from dataclasses import replace
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from motor.analise import (
    AgregadoCanonico,
    ConfiguracaoAnalise,
    ConfiguracaoTemporal,
    DiagnosticosExperimentais,
    ModoAnalise,
    ResultadoCanonico,
    analisar,
)
from motor.analise.serializacao import (
    SCHEMA_VERSION,
    PacoteExecucao,
    TabelaCsvCanonica,
    criar_manifesto,
    escrever_csv_canonico,
    escrever_json,
    resultado_para_json,
    validar_compatibilidade,
)
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.simulacao import simular


INSTANTE = datetime(2026, 9, 9, 12, 34, 56, tzinfo=timezone.utc)


@pytest.fixture
def custo() -> ParametrosCusto:
    return ParametrosCusto(
        iof_out=Decimal("0.0350"),
        iof_in=Decimal("0.00380"),
        carry_cnr=Decimal("0.000400"),
        spread_rail_bps=Decimal("8.250"),
        custo_fixo_remessa=Decimal("25.00"),
        custo_oportunidade_aa=Decimal("0.1200"),
        ptax=Decimal("5.4000"),
        iof_por_finalidade={
            ("SERVICO", Direcao.OUT): Decimal("0.02100"),
            ("EXPORTACAO", Direcao.IN): Decimal("0.00000"),
        },
    )


def _manifesto(custo: ParametrosCusto, **mudancas):
    argumentos = dict(
        parametros_custo=custo,
        mixes=("equilibrado",),
        arquetipos=("servicos", "exportador"),
        horizonte_dias=400,
        periodo_medicao_dias=365,
        janela_dias=3,
        seeds=(7, 11),
        modo_analise=ModoAnalise.AGREGADO,
        custo_calibrado=False,
        metodo_percentil="nearest-rank",
        drenagem="NATURAL",
        avisos=("suficiencia estatistica nao validada",),
        run_ids_origem=("origem-1",),
        relogio=lambda: INSTANTE,
        versao_motor="0.1.0+e3e4c0e",
    )
    argumentos.update(mudancas)
    return criar_manifesto(**argumentos)


@pytest.fixture
def manifesto(custo):
    return _manifesto(custo)


@pytest.fixture
def resultado(manifesto, custo):
    cenario = Cenario(
        ordens=(
            Ordem(
                "o1", "c1", Direcao.OUT, Decimal("1000000.000000"),
                0, 0, False, "SERVICO",
            ),
        ),
        janela_dias=manifesto.janela_dias,
        horizonte_dias=0,
        custo=custo,
    )
    execucao = simular(cenario)
    agregado = AgregadoCanonico(
        execucao_completa=execucao,
        ids_ordens_medidas=("o1",),
        volume_bruto_periodo_brl=Decimal("1000000.000000"),
        volume_casado_periodo_brl=Decimal("0.000000"),
        volume_remetido_periodo_brl=Decimal("1000000.000000"),
        baseline_periodo=execucao.baseline,
        netado_periodo=execucao.netado,
        economia_periodo_brl=Decimal("1026000.000000"),
        taxa_netabilidade_periodo=Decimal("0.000000"),
    )
    return ResultadoCanonico(
        manifesto=manifesto,
        agregado=agregado,
        clientes=(),
        ledger_eventos=(),
        contribuicoes_marginais=(),
        diagnosticos_experimentais=DiagnosticosExperimentais(),
        avisos=manifesto.avisos,
    )


def test_json_preserva_decimal_como_texto(resultado):
    documento = json.loads(resultado_para_json(resultado))

    assert documento["agregado"]["economia_periodo_brl"] == "1026000.000000"
    assert documento["manifesto"]["parametros_custo"]["carry_cnr"] == "0.000400"


def test_interfaces_de_serializacao_sao_publicas():
    from motor import analise

    assert analise.PacoteExecucao is PacoteExecucao
    assert analise.TabelaCsvCanonica is TabelaCsvCanonica
    assert analise.criar_manifesto is criar_manifesto
    assert analise.resultado_para_json is resultado_para_json


def test_iof_por_finalidade_e_lista_estruturada_ordenada(resultado):
    regras = json.loads(resultado_para_json(resultado))["manifesto"]["parametros_custo"][
        "iof_por_finalidade"
    ]

    assert regras == [
        {"aliquota": "0.00000", "direcao": "IN", "finalidade": "EXPORTACAO"},
        {"aliquota": "0.02100", "direcao": "OUT", "finalidade": "SERVICO"},
    ]


def test_serializacao_e_deterministica_e_tem_chaves_ordenadas(resultado):
    primeira = resultado_para_json(resultado)
    segunda = resultado_para_json(resultado)

    assert primeira == segunda
    assert primeira.startswith('{"agregado":')
    assert "NaN" not in primeira


def test_manifesto_injeta_relogio_versao_e_identidade_canonica(manifesto):
    assert manifesto.schema_version == SCHEMA_VERSION
    assert manifesto.versao_motor == "0.1.0+e3e4c0e"
    assert manifesto.criado_em_utc == "2026-09-09T12:34:56Z"
    assert manifesto.run_id == f"20260909T123456Z-{manifesto.hash_configuracao[:12]}"
    assert len(manifesto.hash_configuracao) == hashlib.sha256().digest_size * 2


def test_hash_preserva_periodo_de_medicao_separado_do_horizonte(custo):
    base = _manifesto(custo)
    outro_periodo = _manifesto(custo, periodo_medicao_dias=30)
    outro_horizonte = _manifesto(custo, horizonte_dias=365)

    assert base.hash_configuracao != outro_periodo.hash_configuracao
    assert base.hash_configuracao != outro_horizonte.hash_configuracao
    documento = json.loads(resultado_para_json(base))
    assert documento["periodo_medicao_dias"] == 365
    assert documento["horizonte_dias"] == 400


def test_pipeline_temporal_recalcula_hash_e_run_id(custo):
    cenario = Cenario(
        (
            Ordem(
                "medida", "c1", Direcao.OUT, Decimal("100"),
                5, 42, False, "SERVICO",
            ),
        ),
        janela_dias=3,
        horizonte_dias=50,
        custo=custo,
    )
    manifesto = _manifesto(
        custo,
        horizonte_dias=50,
        periodo_medicao_dias=50,
        mixes=("teste",),
        arquetipos=("teste",),
        seeds=(7,),
        run_ids_origem=(),
    )

    resultado = analisar(
        cenario,
        ConfiguracaoAnalise(ModoAnalise.AGREGADO),
        manifesto,
        ConfiguracaoTemporal(dias_aquecimento=5, periodo_medicao_dias=30),
    )

    assert resultado.manifesto.horizonte_dias == 42
    assert resultado.manifesto.periodo_medicao_dias == 30
    assert resultado.manifesto.hash_configuracao != manifesto.hash_configuracao
    assert resultado.manifesto.run_id.endswith(resultado.manifesto.hash_configuracao[:12])


def test_manifestos_com_parametros_diferentes_nao_podem_ser_combinados(manifesto):
    incompativel = replace(manifesto, run_id="run-outro", hash_configuracao="outro")

    with pytest.raises(
        ValueError,
        match=r"hash_configuracao incompatível.*run_id=.*hash=.*schema=",
    ):
        validar_compatibilidade((manifesto, incompativel))


def test_manifestos_com_schema_diferente_nao_podem_ser_combinados(manifesto):
    incompativel = replace(manifesto, run_id="run-outro", schema_version="2.0.0")

    with pytest.raises(
        ValueError,
        match=r"schema_version incompatível.*run_id=.*hash=.*schema=",
    ):
        validar_compatibilidade((manifesto, incompativel))


@pytest.mark.parametrize("run_id", ("", "   ", None))
def test_manifesto_sem_run_id_e_rejeitado_com_contexto(manifesto, run_id):
    invalido = replace(manifesto, run_id=run_id)

    with pytest.raises(ValueError, match=r"run_id ausente.*hash=.*schema="):
        validar_compatibilidade((invalido,))


def test_pacote_exige_resultado_com_a_mesma_identidade(resultado, manifesto):
    divergente = replace(
        resultado,
        manifesto=replace(resultado.manifesto, hash_configuracao="hash-divergente"),
    )

    with pytest.raises(ValueError, match=r"resultado incompatível.*run_id=.*hash=.*schema="):
        PacoteExecucao(manifesto, (divergente,), ())


def test_pacote_aceita_tabela_com_proveniencia_exata(resultado, manifesto):
    tabela = TabelaCsvCanonica(
        "resumo.csv",
        ("run_id", "schema_version", "hash_configuracao", "valor_brl"),
        ((manifesto.run_id, manifesto.schema_version, manifesto.hash_configuracao, "1.20"),),
    )

    pacote = PacoteExecucao(manifesto, (resultado,), (tabela,))

    assert pacote.resultados == (resultado,)
    assert pacote.tabelas == (tabela,)


def test_pacote_rejeita_tabela_sem_proveniencia(resultado, manifesto):
    tabela = TabelaCsvCanonica("resumo.csv", ("valor_brl",), (("1.20",),))

    with pytest.raises(ValueError, match="proveniência"):
        PacoteExecucao(manifesto, (resultado,), (tabela,))


@pytest.mark.parametrize(
    "nome",
    ("../resumo.csv", "subdir/resumo.csv", r"subdir\resumo.csv", ".", "", "resumo"),
)
def test_tabela_rejeita_nome_que_nao_e_csv_simples_e_seguro(nome):
    with pytest.raises(ValueError, match="nome_arquivo"):
        TabelaCsvCanonica(nome, ("run_id",), (("run-1",),))


def test_escritores_preservam_json_e_csv_canonicos(tmp_path, resultado, manifesto):
    destino_json = tmp_path / "resultado.json"
    escrever_json(resultado, destino_json)
    assert destino_json.read_text(encoding="utf-8") == resultado_para_json(resultado)

    tabela = TabelaCsvCanonica(
        "resumo.csv",
        ("run_id", "schema_version", "hash_configuracao", "valor_brl"),
        ((manifesto.run_id, manifesto.schema_version, manifesto.hash_configuracao, "1.20"),),
    )
    destino_csv = tmp_path / tabela.nome_arquivo
    escrever_csv_canonico(tabela, destino_csv)
    with destino_csv.open(encoding="utf-8", newline="") as arquivo:
        assert tuple(tuple(linha) for linha in csv.reader(arquivo)) == (
            tabela.colunas,
            *tabela.linhas,
        )
