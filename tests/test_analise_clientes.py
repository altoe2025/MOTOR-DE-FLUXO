from dataclasses import replace
from decimal import Decimal, getcontext, localcontext

import pytest

from motor.analise import analisar_clientes
from motor.analise.clientes import filtrar_analise_clientes
from motor.custo import custo_baseline
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.simulacao import simular

D = Decimal
COMPONENTES = ("iof", "carry", "spread", "espera", "fixo", "total")


def _soma(valores):
    # Oracle independente com folga ampla para os coeficientes das fixtures.
    itens = tuple(valores)
    with localcontext() as contexto:
        contexto.prec = 200
        return sum(itens, D(0))


def _custo(**mudancas):
    return replace(ParametrosCusto(D("0.035"), D("0.0038"), D("0.0004"),
                                  D("25"), D("40"), D(0), D("5.4")), **mudancas)


def _ordem(id, cliente, direcao, valor, conhecida=0, limite=0, finalidade="x"):
    return Ordem(id, cliente, direcao, D(valor), conhecida, limite, False, finalidade)


def _cenario(*ordens, custo=None, janela=1, horizonte=10):
    return Cenario(tuple(ordens), janela, horizonte, custo or _custo())


def _reconciliar(cenario):
    resultado = simular(cenario)
    eventos, clientes = analisar_clientes(cenario, resultado)
    for lado in ("baseline", "netado"):
        for campo in COMPONENTES:
            esperado = getattr(getattr(resultado, lado), campo)
            assert _soma(getattr(getattr(c, lado), campo) for c in clientes) == esperado
            assert _soma(getattr(getattr(e, lado), campo) for e in eventos) == esperado
    assert _soma(c.ganho_proprio_brl for c in clientes) == resultado.economia
    assert _soma(e.ganho_realizado_brl for e in eventos) == resultado.economia
    for ordem in cenario.ordens:
        fonte = custo_baseline(replace(cenario, ordens=(ordem,)))
        resolucoes = [e for e in eventos if e.ordem_id == ordem.id and e.tipo != "ORDEM_CONHECIDA"]
        assert _soma(e.valor_brl for e in resolucoes) == ordem.valor_brl
        for campo in COMPONENTES[:-1]:
            assert _soma(getattr(e.baseline, campo) for e in resolucoes) == getattr(fonte, campo)
    bruto = sum((o.valor_brl for o in cenario.ordens), D(0))
    assert sum((c.volume_bruto_brl for c in clientes), D(0)) == bruto
    assert sum((c.volume_casado_brl + c.volume_remetido_brl for c in clientes), D(0)) == bruto
    for indice, cliente in enumerate(clientes):
        ganho_esperado = cliente.baseline.total - cliente.netado.total
        if indice == len(clientes) - 1:
            ganho_esperado = _soma((resultado.economia, _soma(
                c.baseline.total - c.netado.total for c in clientes[:-1]
            ).copy_negate()))
        assert cliente.ganho_proprio_brl == ganho_esperado
        assert cliente.ganho_proprio_bps == cliente.ganho_proprio_brl / cliente.volume_bruto_brl * 10000
        assert cliente.historico_diario[-1].ganho_acumulado_brl == cliente.ganho_proprio_brl
    return eventos, clientes


def test_rateio_dos_clientes_fecha_com_o_agregado():
    _reconciliar(_cenario(_ordem("a", "a", Direcao.OUT, "1000"),
                         _ordem("b", "b", Direcao.IN, "600")))


def test_coorte_filtrada_preserva_rateio_e_reconcilia_residuos_decimal():
    cenario = _cenario(*(
        _ordem(str(i), str(i % 5), Direcao.OUT if i % 3 else Direcao.IN,
               str(100 + 13 * i), i % 7, i % 7 + i % 4 + 1)
        for i in range(30)
    ), custo=_custo(custo_oportunidade_aa=D("0.15")), janela=3, horizonte=12)
    ledger, _ = analisar_clientes(cenario, simular(cenario))
    ids = tuple(str(i) for i in range(1, 30, 2))

    eventos, clientes = filtrar_analise_clientes(ledger, ids)

    assert {evento.ordem_id for evento in eventos} == set(ids)
    assert _soma(c.ganho_proprio_brl for c in clientes) == _soma(
        evento.ganho_realizado_brl for evento in eventos
    )
    for lado in ("baseline", "netado"):
        for campo in COMPONENTES:
            assert _soma(getattr(getattr(c, lado), campo) for c in clientes) == _soma(
                getattr(getattr(evento, lado), campo) for evento in eventos
            )


def test_entrada_nao_reconhece_custo_ou_ganho_e_preserva_metadados():
    ordem = replace(_ordem("a", "cliente", Direcao.OUT, "100", 2, 5), eh_efx=True)
    eventos, _ = _reconciliar(_cenario(ordem))
    entrada, resolucao = eventos
    assert entrada.tipo == "ORDEM_CONHECIDA"
    assert entrada.dia_conhecida == 2 and entrada.dia_resolucao is None
    assert entrada.valor_brl == 100 and entrada.cliente_id == "cliente"
    assert entrada.ordem_id == "a" and entrada.eh_efx is True
    assert entrada.ganho_realizado_brl == 0
    assert all(getattr(entrada.baseline, c) == getattr(entrada.netado, c) == 0 for c in COMPONENTES)
    assert resolucao.tipo == "REMETIDO" and resolucao.dia_resolucao == 5
    assert resolucao.eh_efx is True


def test_baseline_e_espera_sao_reconhecidos_por_tranche():
    cenario = _cenario(_ordem("a", "a", Direcao.OUT, "10", 0, 8),
                      _ordem("b", "b", Direcao.IN, "6", 3, 5),
                      _ordem("c", "c", Direcao.IN, "4", 6, 20),
                      custo=_custo(custo_oportunidade_aa=D(365)), janela=100, horizonte=20)
    eventos, clientes = _reconciliar(cenario)
    tranches = [e for e in eventos if e.ordem_id == "a" and e.tipo == "CASADO"]
    assert [(e.dia_resolucao, e.valor_brl, e.baseline.fixo, e.netado.espera) for e in tranches] == [
        (5, D(6), D(24), D(30)), (8, D(4), D(16), D(32))]
    assert [e.baseline.iof for e in tranches] == [D("0.21"), D("0.14")]
    assert [e.netado.carry for e in tranches] == [D("0.0024"), D("0.0016")]
    cliente = next(c for c in clientes if c.cliente_id == "a")
    assert cliente.volume_bruto_brl == cliente.volume_casado_brl == 10
    assert cliente.volume_remetido_brl == 0
    dias = cliente.historico_diario
    assert [d.dia for d in dias] == [0, 5, 8]
    assert [d.volume_conhecido_brl for d in dias] == [10, 0, 0]
    assert [d.volume_casado_brl for d in dias] == [0, 6, 4]
    assert [d.ganho_dia_brl for d in dias] == [D(0), D("-5.7774"), D("-15.8516")]
    assert [d.ganho_acumulado_brl for d in dias] == [D(0), D("-5.7774"), D("-21.6290")]


def test_dois_clientes_no_mesmo_ciclo_rateiam_spread_e_fixo_por_volume_remetido():
    cenario = _cenario(_ordem("a1", "a", Direcao.OUT, "100"),
                      _ordem("a2", "a", Direcao.OUT, "200"),
                      _ordem("b", "b", Direcao.OUT, "100"))
    eventos, clientes = _reconciliar(cenario)
    a, b = clientes
    assert (a.netado.spread, b.netado.spread) == (D("0.75"), D("0.25"))
    assert (a.netado.fixo, b.netado.fixo) == (D(30), D(10))
    assert [e.netado.fixo for e in eventos if e.tipo == "REMETIDO"] == [D(10), D(20), D(10)]
    assert (a.baseline.fixo, b.baseline.fixo) == (D(80), D(40))


def test_resto_do_rateio_e_deterministico_e_cai_no_ultimo_cliente():
    cenario = _cenario(*(_ordem(c, c, Direcao.OUT, "1") for c in ("c", "a", "b")),
                      custo=_custo(custo_fixo_remessa=D(1), spread_rail_bps=D(0),
                                   iof_out=D(0)))
    eventos, clientes = _reconciliar(cenario)
    assert [c.cliente_id for c in clientes] == ["a", "b", "c"]
    assert [c.netado.fixo for c in clientes] == [D(1) / 3, D(1) / 3, D(1) - (D(1) / 3 + D(1) / 3)]
    invertido = replace(cenario, ordens=tuple(reversed(cenario.ordens)))
    assert analisar_clientes(invertido, simular(invertido)) == (eventos, clientes)
    assert len({e.evento_id for e in eventos}) == len(eventos)


def test_iof_direto_respeita_finalidade_e_carry_so_incide_no_casado():
    cenario = _cenario(_ordem("a", "a", Direcao.OUT, "100", finalidade="caro"),
                      _ordem("b", "b", Direcao.OUT, "300", finalidade="barato"),
                      _ordem("c", "c", Direcao.IN, "200"),
                      custo=_custo(iof_por_finalidade={("caro", Direcao.OUT): D("0.04"),
                                                       ("barato", Direcao.OUT): D("0.01")}))
    eventos, _ = _reconciliar(cenario)
    remetido = next(e for e in eventos if e.tipo == "REMETIDO")
    assert remetido.ordem_id == "b" and remetido.netado.iof == 2
    assert remetido.netado.carry == 0
    assert all(e.netado.iof == e.netado.spread == e.netado.fixo == 0 for e in eventos if e.tipo == "CASADO")


def test_cliente_pode_ter_ganho_negativo():
    cenario = _cenario(_ordem("a", "a", Direcao.OUT, "100", 0, 5),
                      _ordem("b", "b", Direcao.IN, "100", 0, 5), janela=5,
                      custo=_custo(custo_oportunidade_aa=D(365), custo_fixo_remessa=D(0)))
    _, clientes = _reconciliar(cenario)
    assert all(c.ganho_proprio_brl < 0 and c.ganho_proprio_bps < 0 for c in clientes)


def test_efx_nao_muda_rateio_ou_resumos():
    cenario = _cenario(_ordem("a", "a", Direcao.OUT, "100"), _ordem("b", "b", Direcao.IN, "40"))
    eventos, clientes = analisar_clientes(cenario, simular(cenario))
    efx = replace(cenario, ordens=tuple(replace(o, eh_efx=True) for o in cenario.ordens))
    eventos_efx, clientes_efx = analisar_clientes(efx, simular(efx))
    assert clientes_efx == clientes
    assert eventos_efx == tuple(replace(e, eh_efx=True) for e in eventos)


def test_cenario_vazio_produz_ledger_e_clientes_vazios():
    cenario = _cenario()
    assert analisar_clientes(cenario, simular(cenario)) == ((), ())


@pytest.mark.parametrize("valor", ["1", "1000"])
def test_baseline_de_ordem_em_tercos_fecha_sem_duplicar_tarifa(valor):
    cenario = _cenario(_ordem("a", "a", Direcao.OUT, str(D(valor) * 3), 0, 3),
                      _ordem("b", "b", Direcao.IN, valor, 1, 1),
                      _ordem("c", "c", Direcao.IN, valor, 2, 2),
                      custo=_custo(custo_fixo_remessa=D(1)))
    eventos, _ = _reconciliar(cenario)
    tranches = [e for e in eventos if e.ordem_id == "a" and e.tipo != "ORDEM_CONHECIDA"]
    assert [e.tipo for e in tranches] == ["CASADO", "CASADO", "REMETIDO"]
    assert sum((e.baseline.fixo for e in tranches), D(0)) == 1


def test_resto_fecha_com_sete_clientes_e_fracoes_periodicas():
    _reconciliar(_cenario(*(_ordem(str(i), str(i), Direcao.OUT, "1") for i in range(7)),
                          custo=_custo(custo_fixo_remessa=D(1))))


def test_historico_agrega_entradas_e_resolucoes_do_mesmo_dia_sem_duplicar_volume():
    eventos, clientes = _reconciliar(_cenario(_ordem("a", "cliente", Direcao.OUT, "100"),
                                            _ordem("b", "cliente", Direcao.IN, "40")))
    cliente, = clientes
    dia, = cliente.historico_diario
    assert (dia.dia, dia.volume_conhecido_brl, dia.volume_casado_brl, dia.volume_remetido_brl) == (0, 140, 80, 60)
    assert dia.baseline_brl == cliente.baseline.total
    assert dia.custo_netado_brl == cliente.netado.total
    assert dia.ganho_dia_brl == dia.ganho_acumulado_brl == cliente.ganho_proprio_brl
    assert len(eventos) == 5


@pytest.mark.parametrize("quantidade", [7, 11, 100])
def test_espera_periodica_preserva_custos_do_agregado(quantidade):
    cenario = _cenario(*(_ordem(str(i), str(i % 3), Direcao.OUT, "1", 0, 1)
                        for i in range(quantidade)),
                      custo=_custo(custo_oportunidade_aa=D("0.15")))
    precisao = getcontext().prec
    eventos, clientes = _reconciliar(cenario)
    assert getcontext().prec == precisao
    resultado = simular(cenario)
    resolucoes = sorted((e for e in eventos if e.tipo == "REMETIDO"),
                       key=lambda e: (e.cliente_id, e.dia_resolucao, e.ordem_id, e.evento_id))
    espera_direta = D("0.15") / 365
    for evento in resolucoes[:-1]:
        assert evento.netado.espera == espera_direta
    assert resolucoes[-1].netado.espera == _soma((
        resultado.netado.espera,
        _soma(espera_direta for _ in resolucoes[:-1]).copy_negate(),
    ))
    for lado in ("baseline", "netado"):
        preliminares = [sum((getattr(getattr(c, lado), campo)
                             for campo in COMPONENTES[:-1]), D(0)) for c in clientes]
        assert [getattr(c, lado).total for c in clientes[:-1]] == preliminares[:-1]
        assert getattr(clientes[-1], lado).total == _soma((
            getattr(resultado, lado).total, _soma(preliminares[:-1]).copy_negate(),
        ))


def test_carteira_com_varios_ciclos_fecha_sem_recontar_saldos_pendentes():
    cenario = _cenario(*(_ordem(str(i), str(i % 5), Direcao.OUT if i % 3 else Direcao.IN,
                               str(100 + 13 * i), i % 7, i % 7 + i % 4 + 1)
                        for i in range(30)),
                      custo=_custo(custo_oportunidade_aa=D("0.15")), janela=3, horizonte=12)
    _reconciliar(cenario)
