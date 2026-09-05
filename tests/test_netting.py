import random
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

import pytest

from motor.dominio import (
    Cenario,
    Ciclo,
    Direcao,
    Ordem,
    ParametrosCusto,
    TipoAlocacao,
    carregar_cenario,
)
from motor.netting import executar_p0


def _por_ordem(ciclos: tuple[Ciclo, ...]) -> dict[str, Decimal]:
    """Soma das alocações de cada ordem, em todos os ciclos."""
    total: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    for ciclo in ciclos:
        for alocacao in ciclo.alocacoes:
            total[alocacao.ordem_id] += alocacao.valor_brl
    return dict(total)


def _alocacoes(ciclos: tuple[Ciclo, ...], tipo: TipoAlocacao) -> list:
    return [a for ciclo in ciclos for a in ciclo.alocacoes if a.tipo is tipo]

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


def test_ordem_com_folga_nao_e_arrastada_pelo_vencimento_de_outra():
    """O caso A/B/C — a regressão mais legível do projeto, previsto no papel.

    | Ordem | Direção | Valor | Conhecida | Vence |
    |-------|---------|-------|-----------|-------|
    | A     | OUT     | 10    | dia 0     | dia 8 |
    | B     | IN      |  6    | dia 3     | dia 5 |
    | C     | IN      |  4    | dia 6     | dia 20|

    Semântica ANTIGA: B vence no dia 5 e fecha o LOTE INTEIRO — os 4 que sobravam
    de A são remetidos ali, apesar de A ainda ter 3 dias de folga. C chega no dia
    6 sem contraparte e sai sozinha no dia 20. Resíduo total: 8.

    Semântica CORRIGIDA: o vencimento de B força a saída APENAS de B. B casa 6 com
    A e sai zerada; A continua aberta com 4, que casam com C no dia 8. Resíduo
    total: 0 — A é coberta integralmente, 6 por B e depois 4 por C.
    """
    ordens = (
        Ordem("a", "cliente-a", Direcao.OUT, Decimal("10"), 0, 8, False, "x"),
        Ordem("b", "cliente-b", Direcao.IN, Decimal("6"), 3, 5, False, "x"),
        Ordem("c", "cliente-c", Direcao.IN, Decimal("4"), 6, 20, False, "x"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=100, horizonte_dias=20, custo=_custo_zero())

    ciclos = executar_p0(cenario)

    assert sum(c.residuo for c in ciclos) == Decimal("0")
    assert _alocacoes(ciclos, TipoAlocacao.REMETIDO) == []

    casados_de_a = sorted(
        (a.dia, a.valor_brl)
        for a in _alocacoes(ciclos, TipoAlocacao.CASADO)
        if a.ordem_id == "a"
    )
    assert casados_de_a == [(5, Decimal("6")), (8, Decimal("4"))]


def test_cobertura_parcial_prioriza_quem_vence_antes():
    """EDF, não FIFO: com casamento agregado suficiente para só um lado OUT, quem
    tem menos folga é coberto primeiro.

    As duas OUT são conhecidas no mesmo dia, então FIFO não desempata; a ordem por
    `id` desempataria a favor da FOLGADA. Só EDF cobre a apertada primeiro — é isso
    que este teste discrimina.
    """
    ordens = (
        Ordem("a-folgada", "cliente-a", Direcao.OUT, Decimal("100"), 0, 10, False, "x"),
        Ordem("b-apertada", "cliente-b", Direcao.OUT, Decimal("100"), 0, 3, False, "x"),
        Ordem("z-contraparte", "cliente-z", Direcao.IN, Decimal("100"), 0, 3, False, "x"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=100, horizonte_dias=20, custo=_custo_zero())

    ciclos = executar_p0(cenario)

    casado_por_ordem = {
        a.ordem_id: a.valor_brl for a in _alocacoes(ciclos, TipoAlocacao.CASADO)
    }
    assert casado_por_ordem["b-apertada"] == Decimal("100")
    assert "a-folgada" not in casado_por_ordem

    remetidos = _alocacoes(ciclos, TipoAlocacao.REMETIDO)
    assert len(remetidos) == 1
    assert remetidos[0].ordem_id == "a-folgada"
    assert remetidos[0].dia == 10


def test_nenhuma_ordem_vence_com_saldo_em_aberto():
    """Toda ordem tem que estar integralmente resolvida ao fim do seu dia_limite."""
    ordens = (
        Ordem("a", "cliente-a", Direcao.OUT, Decimal("100"), 0, 9, False, "x"),
        Ordem("b", "cliente-b", Direcao.IN, Decimal("30"), 2, 4, False, "x"),
        Ordem("c", "cliente-c", Direcao.IN, Decimal("15"), 5, 12, False, "x"),
    )
    cenario = Cenario(ordens=ordens, janela_dias=3, horizonte_dias=15, custo=_custo_zero())

    ciclos = executar_p0(cenario)

    por_ordem = _por_ordem(ciclos)
    for ordem in ordens:
        resolvido_ate_o_limite = sum(
            (
                a.valor_brl
                for ciclo in ciclos
                for a in ciclo.alocacoes
                if a.ordem_id == ordem.id and a.dia <= ordem.dia_limite
            ),
            Decimal(0),
        )
        assert resolvido_ate_o_limite == ordem.valor_brl
        assert por_ordem[ordem.id] == ordem.valor_brl


def test_conservacao_por_alocacoes_com_200_ordens_aleatorias():
    """O invariante novo: a soma das alocações de cada ordem é exatamente o seu
    valor_brl. Substitui "nenhuma ordem aparece em dois ciclos", que deixou de ser
    verdadeiro quando cobertura parcial passou a existir.
    """
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

    por_ordem = _por_ordem(ciclos)
    assert por_ordem.keys() == {o.id for o in cenario.ordens}
    for ordem in cenario.ordens:
        assert por_ordem[ordem.id] == ordem.valor_brl


def test_casamento_equilibrado_nos_dois_lados_em_cada_ciclo():
    """CASADO é posição agregada: o que ficou de um lado tem que ter contrapartida
    exata do outro, ciclo a ciclo."""
    rng = random.Random(7)
    horizonte = 40
    ordens = tuple(
        Ordem(
            f"o{i}",
            f"cliente{i}",
            Direcao.OUT if rng.random() < 0.5 else Direcao.IN,
            Decimal(rng.randint(1, 100_000)),
            (conhecida := rng.randint(0, horizonte)),
            rng.randint(conhecida, horizonte),
            False,
            "x",
        )
        for i in range(150)
    )
    cenario = Cenario(
        ordens=ordens, janela_dias=4, horizonte_dias=horizonte, custo=_custo_zero()
    )
    direcao_de = {o.id: o.direcao for o in ordens}

    ciclos = executar_p0(cenario)

    for ciclo in ciclos:
        casado_out = sum(
            (
                a.valor_brl
                for a in ciclo.alocacoes
                if a.tipo is TipoAlocacao.CASADO and direcao_de[a.ordem_id] is Direcao.OUT
            ),
            Decimal(0),
        )
        casado_in = sum(
            (
                a.valor_brl
                for a in ciclo.alocacoes
                if a.tipo is TipoAlocacao.CASADO and direcao_de[a.ordem_id] is Direcao.IN
            ),
            Decimal(0),
        )
        assert casado_out == casado_in == ciclo.casado


def test_cenario_temporal_bate_com_a_previsao_escrita_no_yaml():
    """Trava, como regressão, a previsão feita à mão no topo de
    cenario_temporal.yaml — escrita antes de rodar o motor. Cobre: ordem que
    espera e casa com DUAS contrapartes tardias em dias diferentes, ordem que
    espera e sai sozinha, ordem D+0 que força saída e ainda assim casa com quem
    já esperava, e duas ordens que chegam juntas e casam integralmente.
    """
    cenario = carregar_cenario(str(CENARIO_TEMPORAL))

    ciclos = executar_p0(cenario)

    previsao = [
        # (dia, bruto_out, bruto_in, casado, residuo, direcao_residuo)
        (4, "100", "60", "60", "0", Direcao.OUT),
        (5, "40", "45", "40", "5", Direcao.IN),
        (10, "80", "0", "0", "80", Direcao.OUT),
        (11, "20", "0", "0", "20", Direcao.OUT),
        (12, "0", "25", "0", "25", Direcao.IN),
        (15, "50", "90", "50", "40", Direcao.IN),
        (17, "15", "0", "0", "15", Direcao.OUT),
        (18, "0", "35", "0", "35", Direcao.IN),
        (20, "70", "70", "70", "0", Direcao.OUT),
        (23, "10", "0", "0", "10", Direcao.OUT),
        (25, "0", "55", "0", "55", Direcao.IN),
        (28, "5", "0", "0", "5", Direcao.OUT),
    ]

    assert len(ciclos) == len(previsao)
    for ciclo, (dia, bruto_out, bruto_in, casado, residuo, direcao_residuo) in zip(
        ciclos, previsao
    ):
        assert ciclo.dia == dia
        # bruto é SALDO PENDENTE, não valor original: no dia 5 o lado OUT vale 40
        # (o que sobrou de a1), não os 100 com que a1 foi criada.
        assert ciclo.bruto_out == Decimal(bruto_out)
        assert ciclo.bruto_in == Decimal(bruto_in)
        assert ciclo.casado == Decimal(casado)
        assert ciclo.residuo == Decimal(residuo)
        if ciclo.residuo > 0:
            assert ciclo.direcao_residuo is direcao_residuo

    total_criado = sum(o.valor_brl for o in cenario.ordens)
    total_alocado = sum(a.valor_brl for ciclo in ciclos for a in ciclo.alocacoes)
    assert total_criado == total_alocado == Decimal("730")


def test_p0_nao_depende_da_ordem_de_entrada():
    """Determinismo bit a bit, inclusive a ordem da tupla de alocações.

    Embaralhar as ordens do cenário não pode mudar nada: a prioridade é
    `(dia_limite, id)`, que é ordem total. A reprodutibilidade é o critério de
    aceitação da Camada A — se ela depender da ordem em que as ordens chegam na
    tupla, duas execuções com a mesma seed divergem em silêncio.
    """
    from motor import mixes
    from motor.varredura import montar_pool_do_ponto

    rng = random.Random(99)
    for seed in range(1, 21):
        pool = montar_pool_do_ponto(mixes.TODOS["equilibrado"], 6, 120, seed_base=seed)
        if not pool:
            continue
        embaralhadas = list(pool)
        rng.shuffle(embaralhadas)

        original = Cenario(
            ordens=pool, janela_dias=5, horizonte_dias=120, custo=_custo_zero()
        )
        embaralhado = Cenario(
            ordens=tuple(embaralhadas),
            janela_dias=5,
            horizonte_dias=120,
            custo=_custo_zero(),
        )

        assert executar_p0(original) == executar_p0(embaralhado)
