"""CLI do motor: modo cenário (`python -m motor <cenario.yaml>`) e modo varredura
(`python -m motor varredura --saida caminho.csv`).

Os dois modos convivem no mesmo `main(argv)`. O modo cenário já existia; os testes
dele aqui são de regressão, para que a extensão da varredura não o quebre.
"""

import csv
from pathlib import Path

from motor.__main__ import main

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"


def test_modo_cenario_continua_funcionando():
    assert main(["motor", str(CENARIO_EXEMPLO)]) == 0


def test_modo_cenario_sem_argumento_falha():
    assert main(["motor"]) == 1


def test_varredura_escreve_o_csv_no_caminho_pedido(tmp_path):
    destino = tmp_path / "grade.csv"
    codigo = main(
        [
            "motor",
            "varredura",
            "--saida",
            str(destino),
            "--mixes",
            "equilibrado",
            "--n",
            "2,4",
            "--w",
            "1,7",
            "--horizonte",
            "60",
            "--seeds",
            "1,2",
        ]
    )

    assert codigo == 0
    with destino.open(encoding="utf-8", newline="") as f:
        linhas = list(csv.DictReader(f))
    assert len(linhas) == 8  # 2 N x 2 W x 2 seeds
    assert {linha["nome_mix"] for linha in linhas} == {"equilibrado"}
    assert {int(linha["n_clientes"]) for linha in linhas} == {2, 4}
    assert {int(linha["janela_dias"]) for linha in linhas} == {1, 7}
    assert {int(linha["horizonte_dias"]) for linha in linhas} == {60}
    assert {int(linha["seed_base"]) for linha in linhas} == {1, 2}


def test_varredura_sem_saida_falha():
    assert main(["motor", "varredura"]) == 1


def test_varredura_com_mix_inexistente_falha(tmp_path):
    destino = tmp_path / "grade.csv"
    codigo = main(
        ["motor", "varredura", "--saida", str(destino), "--mixes", "mix_que_nao_existe"]
    )
    assert codigo == 1
    assert not destino.exists()


def test_varredura_usa_a_grade_padrao_quando_nada_e_passado(monkeypatch, tmp_path):
    """A grade padrão (4 mixes x 4 N x 5 W, horizonte 365) é cara demais para o
    teste rodar de verdade — aqui só verificamos que é ELA que chega em
    `rodar_varredura` quando a CLI não recebe sobrescrita."""
    import motor.__main__ as cli
    import motor.mixes as mixes

    capturado = {}

    def falso_rodar(**kwargs):
        capturado.update(kwargs)
        return ()

    monkeypatch.setattr(cli, "rodar_varredura", falso_rodar)
    main(["motor", "varredura", "--saida", str(tmp_path / "g.csv")])

    assert set(capturado["mixes"]) == {
        "equilibrado",
        "retail_pesado",
        "corporativo_pesado",
        "psp_dominante",
    }
    assert capturado["mixes"]["equilibrado"] is mixes.EQUILIBRADO
    assert tuple(capturado["valores_n"]) == (10, 50, 200, 1000)
    assert tuple(capturado["valores_w"]) == (1, 3, 7, 14, 30)
    assert capturado["horizonte_dias"] == 365
    assert tuple(capturado["valores_seed"]) == (1, 2, 3, 4, 5)


def test_varredura_escreve_o_resumo_quando_pedido(tmp_path):
    """O resumo é o arquivo que se lê para comparar mixes: uma linha por (mix, N, W)
    com mediana e faixa entre seeds, em vez de um ponto solto por seed."""
    bruto = tmp_path / "grade.csv"
    resumo = tmp_path / "resumo.csv"
    codigo = main(
        [
            "motor", "varredura",
            "--saida", str(bruto),
            "--saida-resumo", str(resumo),
            "--mixes", "equilibrado",
            "--n", "3",
            "--w", "1,7",
            "--seeds", "1,2,3",
            "--horizonte", "60",
        ]
    )

    assert codigo == 0
    with bruto.open(encoding="utf-8", newline="") as f:
        linhas_brutas = list(csv.DictReader(f))
    with resumo.open(encoding="utf-8", newline="") as f:
        linhas_resumo = list(csv.DictReader(f))

    assert len(linhas_brutas) == 6  # 1 N x 2 W x 3 seeds
    assert len(linhas_resumo) == 2  # o eixo de seeds foi colapsado
    assert {int(linha["n_seeds"]) for linha in linhas_resumo} == {3}


def test_varredura_sem_saida_resumo_nao_cria_o_arquivo(tmp_path):
    bruto = tmp_path / "grade.csv"
    resumo = tmp_path / "resumo.csv"
    main(["motor", "varredura", "--saida", str(bruto), "--mixes", "equilibrado",
          "--n", "3", "--w", "1", "--seeds", "1", "--horizonte", "60"])
    assert bruto.exists()
    assert not resumo.exists()
