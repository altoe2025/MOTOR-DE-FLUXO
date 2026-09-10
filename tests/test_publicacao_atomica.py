import csv
import json
from decimal import Decimal

import pytest

from motor.analise import (
    AgregadoCanonico,
    DiagnosticosExperimentais,
    ModoAnalise,
    ResultadoCanonico,
)
from motor.analise import serializacao
from motor.analise.serializacao import (
    PacoteExecucao,
    TabelaCsvCanonica,
    criar_manifesto,
)
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.simulacao import simular


@pytest.fixture
def pacote_execucao() -> PacoteExecucao:
    custo = ParametrosCusto(
        iof_out=Decimal("0.0350"),
        iof_in=Decimal("0.0038"),
        carry_cnr=Decimal("0.0004"),
        spread_rail_bps=Decimal("8.25"),
        custo_fixo_remessa=Decimal("25"),
        custo_oportunidade_aa=Decimal("0.12"),
        ptax=Decimal("5.40"),
    )
    manifesto = criar_manifesto(
        parametros_custo=custo,
        mixes=("equilibrado",),
        arquetipos=("servicos",),
        horizonte_dias=1,
        periodo_medicao_dias=1,
        janela_dias=1,
        seeds=(7,),
        modo_analise=ModoAnalise.AGREGADO,
        custo_calibrado=False,
        metodo_percentil="nearest-rank",
        drenagem="NATURAL",
        versao_motor="teste",
    )
    cenario = Cenario(
        (
            Ordem(
                "o1", "c1", Direcao.OUT, Decimal("100"), 0, 0, False,
                "SERVICO",
            ),
        ),
        janela_dias=1,
        horizonte_dias=0,
        custo=custo,
    )
    execucao = simular(cenario)
    resultado = ResultadoCanonico(
        manifesto=manifesto,
        agregado=AgregadoCanonico(
            execucao_completa=execucao,
            ids_ordens_medidas=("o1",),
            volume_bruto_periodo_brl=Decimal("100"),
            volume_casado_periodo_brl=Decimal("0"),
            volume_remetido_periodo_brl=Decimal("100"),
            baseline_periodo=execucao.baseline,
            netado_periodo=execucao.netado,
            economia_periodo_brl=Decimal("0"),
            taxa_netabilidade_periodo=Decimal("0"),
        ),
        clientes=(),
        ledger_eventos=(),
        contribuicoes_marginais=(),
        diagnosticos_experimentais=DiagnosticosExperimentais(),
        avisos=(),
    )
    tabela = TabelaCsvCanonica(
        "resumo.csv",
        ("run_id", "schema_version", "hash_configuracao", "valor_brl"),
        ((manifesto.run_id, manifesto.schema_version, manifesto.hash_configuracao, "100"),),
    )
    return PacoteExecucao(manifesto, (resultado,), (tabela,))


def test_falha_na_escrita_nao_publica_diretorio_final_nem_parcial(
    tmp_path, pacote_execucao, monkeypatch,
):
    existente = tmp_path / "nao-remover.txt"
    existente.write_text("preservar", encoding="utf-8")

    def falhar(*args, **kwargs):
        raise OSError("falha simulada")

    monkeypatch.setattr(serializacao, "escrever_csv_canonico", falhar)

    with pytest.raises(OSError, match="falha simulada"):
        serializacao.publicar_execucao(pacote_execucao, tmp_path)

    assert not (tmp_path / pacote_execucao.manifesto.run_id).exists()
    assert list(tmp_path.iterdir()) == [existente]
    assert existente.read_text(encoding="utf-8") == "preservar"


def test_nao_sobrescreve_run_existente(tmp_path, pacote_execucao):
    publicado = serializacao.publicar_execucao(pacote_execucao, tmp_path)
    manifesto_original = (publicado / "manifesto.json").read_bytes()

    with pytest.raises(FileExistsError):
        serializacao.publicar_execucao(pacote_execucao, tmp_path)

    assert (publicado / "manifesto.json").read_bytes() == manifesto_original
    assert sorted(path.name for path in tmp_path.iterdir()) == [publicado.name]


def test_nomes_de_tabela_duplicados_falham_antes_de_qualquer_escrita(
    tmp_path, pacote_execucao, monkeypatch,
):
    tabela = pacote_execucao.tabelas[0]
    pacote_duplicado = PacoteExecucao(
        pacote_execucao.manifesto,
        pacote_execucao.resultados,
        (tabela, tabela),
    )
    escritas = []
    monkeypatch.setattr(
        serializacao,
        "escrever_json",
        lambda *args, **kwargs: escritas.append((args, kwargs)),
    )
    monkeypatch.setattr(
        serializacao,
        "escrever_csv_canonico",
        lambda *args, **kwargs: escritas.append((args, kwargs)),
    )

    with pytest.raises(ValueError, match="nome_arquivo duplicado"):
        serializacao.publicar_execucao(pacote_duplicado, tmp_path)

    assert escritas == []
    assert list(tmp_path.iterdir()) == []


def test_proveniencia_materializada_invalida_impede_promocao(
    tmp_path, pacote_execucao, monkeypatch,
):
    def escrever_csv_corrompido(tabela, path):
        with path.open("w", encoding="utf-8", newline="") as arquivo:
            escritor = csv.writer(arquivo, lineterminator="\n")
            escritor.writerow(tabela.colunas)
            escritor.writerow(
                ("run-corrompido", tabela.linhas[0][1], tabela.linhas[0][2], "100")
            )

    monkeypatch.setattr(
        serializacao, "escrever_csv_canonico", escrever_csv_corrompido,
    )

    with pytest.raises(ValueError, match="proveniência materializada"):
        serializacao.publicar_execucao(pacote_execucao, tmp_path)

    assert list(tmp_path.iterdir()) == []


def test_identidade_materializada_invalida_impede_promocao(
    tmp_path, pacote_execucao, monkeypatch,
):
    escrever_json_real = serializacao.escrever_json

    def escrever_json_corrompido(resultado, path):
        escrever_json_real(resultado, path)
        if path.name == "resultado-1.json":
            documento = json.loads(path.read_text(encoding="utf-8"))
            documento["manifesto"]["run_id"] = "run-corrompido"
            path.write_text(json.dumps(documento), encoding="utf-8")

    monkeypatch.setattr(serializacao, "escrever_json", escrever_json_corrompido)

    with pytest.raises(ValueError, match="identidade materializada"):
        serializacao.publicar_execucao(pacote_execucao, tmp_path)

    assert list(tmp_path.iterdir()) == []


def test_publica_conjunto_completo_somente_no_diretorio_final(
    tmp_path, pacote_execucao,
):
    publicado = serializacao.publicar_execucao(pacote_execucao, tmp_path)

    assert publicado == tmp_path / pacote_execucao.manifesto.run_id
    assert sorted(path.name for path in publicado.iterdir()) == [
        "manifesto.json", "resultado-1.json", "resumo.csv",
    ]
    manifesto = json.loads((publicado / "manifesto.json").read_text(encoding="utf-8"))
    resultado = json.loads((publicado / "resultado-1.json").read_text(encoding="utf-8"))
    assert (
        manifesto["run_id"],
        manifesto["schema_version"],
        manifesto["hash_configuracao"],
    ) == (
        pacote_execucao.manifesto.run_id,
        pacote_execucao.manifesto.schema_version,
        pacote_execucao.manifesto.hash_configuracao,
    )
    assert resultado["manifesto"] == manifesto
