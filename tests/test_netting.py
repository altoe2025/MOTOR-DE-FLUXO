import random
from decimal import Decimal
from pathlib import Path

from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto, carregar_cenario
from motor.netting import executar_p0

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"


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
