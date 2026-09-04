"""IOF por finalidade: a alíquota depende do que a operação É, não só da direção.

O modelo cobrava duas alíquotas chapadas (`iof_out` em toda saída, `iof_in` em toda
entrada). Mas câmbio de importação e de exportação tem tratamento próprio, e
`payroll_fornecedor` (finalidade ANEXO_V_BENS_SERVICOS) é fatia grande do volume.
Cobrar 3,5% nele infla o baseline e, com ele, a economia atribuída ao netting.

`Ordem` já carregava `finalidade` desde o dominio.py original — o campo só nunca
tinha sido lido pelo custo. Havia inclusive um comentário órfão em arquetipos.py
("IOF 0% no ingresso — ver custo.py") apontando para um comportamento que não existia.

## Quem paga o IOF do resíduo

No baseline cada ordem paga a sua própria alíquota — não há ambiguidade.

No netado já houve ambiguidade: o resíduo tinha DIREÇÃO mas não tinha dono, porque o
P0 fechava o lote sem dizer quais ordens especificamente atravessaram. Enquanto isso
valeu, o resíduo pagava a média **pro-rata** do seu lado, ponderada por volume — a
hipótese neutra.

Com `Alocacao`, o motor passou a saber: cada `Alocacao(REMETIDO)` aponta para uma
ordem, e o IOF é o daquela ordem. A ambiguidade que justificava o pro-rata deixou de
existir.

Isso não é planejamento tributário embutido. Quem escolhe a ordem de cobertura é o
EDF, por `dia_limite` — critério operacional, e a alíquota nunca entra nele. A
consequência fiscal é incidental. Se um dia a alíquota virar critério (casar primeiro
as caras para deixar as baratas cruzarem), aí sim é otimização fiscal, e não entra sem
parecer jurídico — mesmo espírito da regra do art. 22 gravada em netting.py.
"""

import dataclasses
from decimal import Decimal

import pytest

from motor.custo import aliquota_iof, custo_baseline, custo_netado
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.netting import executar_p0

BASE = ParametrosCusto(
    iof_out=Decimal("0.035"),
    iof_in=Decimal("0.0038"),
    carry_cnr=Decimal("0"),
    spread_rail_bps=Decimal("0"),
    custo_fixo_remessa=Decimal("0"),
    custo_oportunidade_aa=Decimal("0"),
    ptax=Decimal("5.40"),
)

EXPORTACAO = "ANEXO_V_RECEITA_EXPORTACAO"
BENS = "ANEXO_V_BENS_SERVICOS"
DISPONIB = "ANEXO_V_DISPONIBILIDADE"


def _com_tabela(tabela: dict) -> ParametrosCusto:
    return dataclasses.replace(BASE, iof_por_finalidade=tabela)


def _ordem(id_: str, direcao: Direcao, valor: str, finalidade: str) -> Ordem:
    return Ordem(id_, f"c-{id_}", direcao, Decimal(valor), 0, 0, True, finalidade)


def _cenario(custo: ParametrosCusto, *ordens: Ordem) -> Cenario:
    return Cenario(ordens=ordens, janela_dias=1, horizonte_dias=1, custo=custo)


# ------------------------------------------------------- compatibilidade para trás


def test_sem_tabela_de_finalidade_o_comportamento_e_o_de_antes():
    """O campo novo é opt-in: quem não declarar nada continua nas duas alíquotas."""
    cenario = _cenario(
        BASE,
        _ordem("a", Direcao.OUT, "1000", BENS),
        _ordem("b", Direcao.IN, "1000", EXPORTACAO),
    )
    baseline = custo_baseline(cenario)
    assert baseline.iof == Decimal("1000") * Decimal("0.035") + Decimal("1000") * Decimal("0.0038")


def test_tabela_que_repete_os_padroes_nao_muda_nada():
    """Neutralidade: declarar explicitamente a alíquota padrão tem que dar o mesmo
    número que não declarar. Se der diferente, a tabela está sendo aplicada errado."""
    com_tabela = _com_tabela({
                (BENS, Direcao.OUT): Decimal("0.035"),
                (EXPORTACAO, Direcao.IN): Decimal("0.0038"),
            })
    ordens = (
        _ordem("a", Direcao.OUT, "1000", BENS),
        _ordem("b", Direcao.IN, "700", EXPORTACAO),
    )
    assert custo_baseline(_cenario(BASE, *ordens)).iof == custo_baseline(
        _cenario(com_tabela, *ordens)
    ).iof


# ------------------------------------------------------------------- aliquota_iof


def test_aliquota_cai_no_padrao_quando_a_finalidade_nao_tem_regra():
    assert aliquota_iof(BASE, DISPONIB, Direcao.OUT) == Decimal("0.035")
    assert aliquota_iof(BASE, DISPONIB, Direcao.IN) == Decimal("0.0038")


def test_aliquota_usa_a_tabela_quando_a_finalidade_tem_regra():
    custo = _com_tabela({(BENS, Direcao.OUT): Decimal("0.0038")})
    assert aliquota_iof(custo, BENS, Direcao.OUT) == Decimal("0.0038")


def test_a_regra_e_por_finalidade_E_direcao():
    """Mesma finalidade em direções opostas pode ter alíquotas diferentes: a chave
    é o par, não só o nome."""
    custo = _com_tabela({(EXPORTACAO, Direcao.IN): Decimal("0")})
    assert aliquota_iof(custo, EXPORTACAO, Direcao.IN) == Decimal("0")
    assert aliquota_iof(custo, EXPORTACAO, Direcao.OUT) == Decimal("0.035")  # cai no padrão


# ---------------------------------------------------------------------- baseline


def test_baseline_cobra_cada_ordem_pela_sua_propria_finalidade():
    custo = _com_tabela({
                (BENS, Direcao.OUT): Decimal("0.0038"),
                (EXPORTACAO, Direcao.IN): Decimal("0"),
            })
    cenario = _cenario(
        custo,
        _ordem("a", Direcao.OUT, "1000", BENS),  # 1000 * 0,38% = 3,80
        _ordem("b", Direcao.OUT, "1000", DISPONIB),  # 1000 * 3,5%  = 35,00 (padrão)
        _ordem("c", Direcao.IN, "1000", EXPORTACAO),  # isento       =  0,00
    )
    assert custo_baseline(cenario).iof == Decimal("38.80")


def test_finalidade_isenta_nao_gera_iof_nenhum():
    custo = _com_tabela({(EXPORTACAO, Direcao.IN): Decimal("0")})
    cenario = _cenario(custo, _ordem("a", Direcao.IN, "5000000", EXPORTACAO))
    assert custo_baseline(cenario).iof == Decimal("0")


# ------------------------------------------------------------------------ netado


def test_residuo_paga_a_aliquota_da_ordem_que_de_fato_atravessou():
    """Lado OUT: `a` 100 a 4% e `b` 300 a 1%; contraparte IN de 200.

    Todas são D+0, então o EDF empata em `dia_limite` e desempata por `id`: `a` é
    coberta inteira e `b` cobre os outros 100. Sobram 200 de `b`, que atravessam a
    1% e pagam 2.

    A média pro-rata do lado — o modelo antigo, de quando o resíduo não tinha dono —
    daria (100*4% + 300*1%)/400 = 1,75%, ou seja 3,50. É a diferença que este teste
    trava.
    """
    custo = _com_tabela({
                (BENS, Direcao.OUT): Decimal("0.04"),
                (DISPONIB, Direcao.OUT): Decimal("0.01"),
            })
    cenario = _cenario(
        custo,
        _ordem("a", Direcao.OUT, "100", BENS),
        _ordem("b", Direcao.OUT, "300", DISPONIB),
        _ordem("c", Direcao.IN, "200", EXPORTACAO),
    )
    ciclos = executar_p0(cenario)
    assert ciclos[0].residuo == Decimal("200")
    assert ciclos[0].direcao_residuo is Direcao.OUT
    assert custo_netado(ciclos, cenario).iof == Decimal("2")


def test_lado_com_finalidade_unica_paga_exatamente_aquela_aliquota():
    custo = _com_tabela({(BENS, Direcao.OUT): Decimal("0.0038")})
    cenario = _cenario(
        custo,
        _ordem("a", Direcao.OUT, "1000", BENS),
        _ordem("b", Direcao.IN, "400", DISPONIB),
    )
    ciclos = executar_p0(cenario)
    assert custo_netado(ciclos, cenario).iof == Decimal("600") * Decimal("0.0038")


def test_ciclo_sem_residuo_nao_paga_iof_nenhum():
    cenario = _cenario(
        BASE,
        _ordem("a", Direcao.OUT, "500", BENS),
        _ordem("b", Direcao.IN, "500", EXPORTACAO),
    )
    ciclos = executar_p0(cenario)
    assert ciclos[0].residuo == 0
    assert custo_netado(ciclos, cenario).iof == Decimal("0")


# ---------------------------------------------- neutralidade numa pool de verdade


@pytest.mark.parametrize("nome_mix", ["equilibrado", "corporativo_pesado"])
def test_tabela_neutra_reproduz_o_numero_antigo_numa_pool_gerada(nome_mix):
    """A prova mais forte de que a mudança não mexeu na conta: numa pool real, uma
    tabela que só repete os padrões tem que dar exatamente o mesmo resultado."""
    from motor import mixes
    from motor.simulacao import simular
    from motor.varredura import montar_pool_do_ponto

    from motor.arquetipos import TODOS as ARQUETIPOS

    todas_finalidades = {
        (finalidade, dire)
        for arquetipo in ARQUETIPOS.values()
        for finalidade in (arquetipo.finalidade_out, arquetipo.finalidade_in)
        for dire in Direcao
    }
    neutra = _com_tabela({
                (fin, dire): (BASE.iof_out if dire is Direcao.OUT else BASE.iof_in)
                for fin, dire in todas_finalidades
            })

    pool = montar_pool_do_ponto(mixes.TODOS[nome_mix], 20, 365, seed_base=1)
    sem = simular(Cenario(ordens=pool, janela_dias=7, horizonte_dias=365, custo=BASE))
    com = simular(Cenario(ordens=pool, janela_dias=7, horizonte_dias=365, custo=neutra))

    assert sem.baseline.iof == com.baseline.iof
    assert sem.netado.iof == com.netado.iof
    assert sem.economia == com.economia
