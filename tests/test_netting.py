import random
from decimal import Decimal
from pathlib import Path

from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto, carregar_cenario
from motor.netting import executar_p0

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"
CENARIO_TEMPORAL = Path(__file__).parent.parent / "motor" / "cenarios" / "cenario_temporal.yaml"


def _custo_zero() -> ParametrosCusto:
    return ParametrosCusto(
        iof_out=Decimal("0.035"),
        iof_in=Decimal("0.0038"),
        carry_cnr=Decimal("0.0004"),
        spread_rail_bps=Decimal("0"),
        custo_fixo_remessa=Decimal("0"),
        custo_oportunidade_aa=Decimal("0"),
        ptax=Decimal("5.40"),
    )


def test_casamento_perfeito():
    ordens = (
        Ordem("o1", "cliente-a", Direcao.OUT, Decimal("100"), 0, 0, False, "x"),
        Ordem("o2", "cliente-b", Direcao.IN, Decimal("100"), 0, 0, False, "x"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=1, horizonte_dias=0, custo=_custo_zero())

    ciclos = executar_p0(cenario)

    assert len(ciclos) == 1
    assert ciclos[0].casado == Decimal("100")
    assert ciclos[0].residuo == Decimal("0")


def test_so_um_lado_sem_contraparte():
    ordens = (
        Ordem("o1", "cliente-a", Direcao.OUT, Decimal("60"), 0, 0, False, "x"),
        Ordem("o2", "cliente-b", Direcao.OUT, Decimal("40"), 0, 0, False, "x"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=1, horizonte_dias=0, custo=_custo_zero())

    ciclos = executar_p0(cenario)

    assert len(ciclos) == 1
    assert ciclos[0].casado == Decimal("0")
    assert ciclos[0].residuo == Decimal("100")
    assert ciclos[0].direcao_residuo is Direcao.OUT


def test_exemplo_amanda_casado_5_mi_residuo_7_mi_out():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))

    ciclos = executar_p0(cenario)

    assert len(ciclos) == 1
    ciclo = ciclos[0]
    assert ciclo.casado == Decimal("27000000.00")  # 5 mi USD * PTAX 5.40
    assert ciclo.residuo == Decimal("37800000.00")  # 7 mi USD * PTAX 5.40
    assert ciclo.direcao_residuo is Direcao.OUT


def test_deadline_forca_saida_sem_contraparte_futura():
    # IN vence hoje (dia 0); OUT só é conhecida amanhã (dia 1) e tem prazo até o dia 5.
    # Não podem casar: o IN já foi obrigado a sair sozinho antes do OUT existir.
    ordem_in = Ordem("in-1", "nomad", Direcao.IN, Decimal("100"), 0, 0, False, "x")
    ordem_out = Ordem("out-1", "wise", Direcao.OUT, Decimal("100"), 1, 5, False, "x")
    cenario = Cenario(
        ordens=(ordem_in, ordem_out), janela_dias=5, horizonte_dias=5, custo=_custo_zero()
    )

    ciclos = executar_p0(cenario)

    assert len(ciclos) == 2
    assert ciclos[0].dia == 0
    assert ciclos[0].residuo == Decimal("100")
    assert ciclos[0].direcao_residuo is Direcao.IN
    assert ciclos[1].dia == 5
    assert ciclos[1].residuo == Decimal("100")
    assert ciclos[1].direcao_residuo is Direcao.OUT


def test_conservacao_com_200_ordens_aleatorias():
    rng = random.Random(42)
    horizonte = 30
    ordens = []
    for i in range(200):
        dia_conhecida = rng.randint(0, horizonte)
        dia_limite = rng.randint(dia_conhecida, horizonte)
        direcao = Direcao.OUT if rng.random() < 0.5 else Direcao.IN
        valor = Decimal(rng.randint(1, 1_000_000))
        ordens.append(
            Ordem(
                f"o{i}", f"cliente{i}", direcao, valor, dia_conhecida, dia_limite, False, "x"
            )
        )

    cenario = Cenario(
        ordens=tuple(ordens), janela_dias=3, horizonte_dias=horizonte, custo=_custo_zero()
    )

    ciclos = executar_p0(cenario)

    total_criado = sum(o.valor_brl for o in cenario.ordens)
    total_executado = sum(o.valor_brl for ciclo in ciclos for o in ciclo.ordens)
    assert total_executado == total_criado

    ids_vistos: set[str] = set()
    for ciclo in ciclos:
        for ordem in ciclo.ordens:
            assert ordem.id not in ids_vistos
            ids_vistos.add(ordem.id)
    assert ids_vistos == {o.id for o in cenario.ordens}


def test_cenario_temporal_bate_com_a_previsao_escrita_no_yaml():
    """Trava, como regressão, a previsão feita à mão no topo de
    cenario_temporal.yaml — escrita antes de rodar o motor. Cobre: ordem que
    espera e casa com contraparte tardia, ordem que espera e sai sozinha,
    ordem D+0 que força saída e ainda assim casa com quem já esperava, e
    duas ordens que chegam juntas e casam integralmente.
    """
    cenario = carregar_cenario(str(CENARIO_TEMPORAL))

    ciclos = executar_p0(cenario)

    previsao = [
        # (dia, casado, residuo, direcao_residuo)
        (4, "60", "40", Direcao.OUT),
        (5, "0", "45", Direcao.IN),
        (10, "0", "80", Direcao.OUT),
        (11, "0", "20", Direcao.OUT),
        (12, "0", "25", Direcao.IN),
        (15, "50", "40", Direcao.IN),
        (17, "0", "15", Direcao.OUT),
        (18, "0", "35", Direcao.IN),
        (20, "70", "0", Direcao.OUT),
        (23, "0", "10", Direcao.OUT),
        (25, "0", "55", Direcao.IN),
        (28, "0", "5", Direcao.OUT),
    ]

    assert len(ciclos) == len(previsao)
    for ciclo, (dia, casado, residuo, direcao_residuo) in zip(ciclos, previsao):
        assert ciclo.dia == dia
        assert ciclo.casado == Decimal(casado)
        assert ciclo.residuo == Decimal(residuo)
        if ciclo.residuo > 0:
            assert ciclo.direcao_residuo is direcao_residuo

    total_criado = sum(o.valor_brl for o in cenario.ordens)
    total_executado = sum(o.valor_brl for ciclo in ciclos for o in ciclo.ordens)
    assert total_criado == total_executado == Decimal("730")
