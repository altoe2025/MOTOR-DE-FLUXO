from dataclasses import replace
from decimal import Decimal, getcontext, localcontext
import pickle

import pytest

from motor.analise import (
    ConfiguracaoAnalise, ConfiguracaoTemporal, DiagnosticosExperimentais, ManifestoExecucao,
    ModoAnalise, analisar, analisar_clientes, calcular_contribuicao_marginal,
)
from motor.analise import marginal, pipeline
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.simulacao import simular

D = Decimal


@pytest.fixture
def cenario():
    custo = ParametrosCusto(D("0.035"), D("0.0038"), D("0.0004"),
                            D(25), D(40), D(0), D("5.4"))
    return Cenario((
        Ordem("c", "cliente-c", Direcao.OUT, D(200), 0, 0, True, "x"),
        Ordem("a", "cliente-a", Direcao.OUT, D(100), 0, 0, False, "x"),
        Ordem("b", "cliente-b", Direcao.IN, D(100), 0, 0, False, "x"),
    ), 1, 10, custo)


def _manifesto(cenario, modo):
    return ManifestoExecucao(
        run_id="run-1", schema_version="1", versao_motor="0.1.0",
        criado_em_utc="2026-09-09T00:00:00Z", hash_configuracao="abc",
        run_ids_origem=(), parametros_custo=cenario.custo, mixes=("teste",),
        arquetipos=("teste",), horizonte_dias=cenario.horizonte_dias,
        periodo_medicao_dias=cenario.horizonte_dias,
        janela_dias=cenario.janela_dias, seeds=(7,), modo_analise=modo,
        custo_calibrado=False, metodo_percentil="linear", drenagem="legada",
        avisos=("sintetico",),
    )


def _soma_exata(*valores):
    with localcontext() as contexto:
        contexto.prec = 200
        return sum(valores, D(0))


def _observar_simulacoes(monkeypatch):
    # O número de execuções faz parte da proteção de custo dos modos.
    chamadas = []

    def observar(cenario):
        chamadas.append(cenario)
        return simular(cenario)

    monkeypatch.setattr(pipeline, "simular", observar)
    monkeypatch.setattr(marginal, "simular", observar)
    return chamadas


def test_contribuicao_e_diferenca_da_economia_com_e_sem_cliente(cenario):
    contribuicao = calcular_contribuicao_marginal(cenario, "cliente-a")
    sem_a = replace(cenario, ordens=tuple(o for o in cenario.ordens
                                        if o.cliente_id != "cliente-a"))
    assert contribuicao.contribuicao_marginal_total_brl == (
        simular(cenario).economia - simular(sem_a).economia
    ) == D("40")
    assert contribuicao.ganho_proprio_brl == D("43.71")
    assert contribuicao.efeito_sobre_demais_brl == D("-3.71")


def test_bps_proprio_usa_cliente_e_marginal_e_efeito_usam_pool_cheia(cenario):
    contribuicao = calcular_contribuicao_marginal(cenario, "cliente-a")
    assert contribuicao.ganho_proprio_bps == D("4371")
    assert contribuicao.contribuicao_marginal_total_bps == D("1000")
    assert contribuicao.efeito_sobre_demais_bps == D("-92.75")


def test_leave_one_out_remove_todas_as_ordens_e_preserva_as_demais(monkeypatch, cenario):
    extra = Ordem("a2", "cliente-a", Direcao.IN, D("13.000"), 3, 8, True, "y")
    cenario = replace(cenario, ordens=(cenario.ordens[0], extra, *cenario.ordens[1:]))
    antes = pickle.dumps(cenario.ordens)
    chamadas = _observar_simulacoes(monkeypatch)
    calcular_contribuicao_marginal(cenario, "cliente-a")
    assert len(chamadas) == 2
    assert chamadas[0] is cenario
    removido = chamadas[1]
    esperadas = (cenario.ordens[0], cenario.ordens[-1])
    assert pickle.dumps(removido.ordens) == pickle.dumps(esperadas)
    assert all(o is original for o, original in zip(removido.ordens, esperadas))
    assert removido.custo is cenario.custo
    assert (removido.janela_dias, removido.horizonte_dias) == (1, 10)
    assert pickle.dumps(cenario.ordens) == antes


def test_cliente_inexistente_falha_antes_de_simular(monkeypatch, cenario):
    chamadas = _observar_simulacoes(monkeypatch)
    with pytest.raises(ValueError, match="cliente inexistente"):
        calcular_contribuicao_marginal(cenario, "ausente")
    assert chamadas == []


def test_ganho_e_marginal_negativos_sao_publicados(cenario):
    cenario = replace(cenario, custo=replace(cenario.custo, carry_cnr=D(1)))
    contribuicao = calcular_contribuicao_marginal(cenario, "cliente-a")
    assert contribuicao.ganho_proprio_brl == D("-56.25")
    assert contribuicao.contribuicao_marginal_total_brl == D(40)
    # Ao remover IN desaparece o carry elevado de ambas as pernas.
    contribuicao = calcular_contribuicao_marginal(cenario, "cliente-b")
    assert contribuicao.contribuicao_marginal_total_brl == D("-155.62")
    assert contribuicao.contribuicao_marginal_total_bps < 0


def test_cliente_unico_conserva_economia_de_casamento_no_mesmo_cliente(cenario):
    cenario = replace(cenario, ordens=tuple(replace(o, cliente_id="unico")
                                          for o in cenario.ordens))
    contribuicao = calcular_contribuicao_marginal(cenario, "unico")
    assert contribuicao.ganho_proprio_brl == D("84.30")
    assert contribuicao.contribuicao_marginal_total_brl == D("84.30")
    assert contribuicao.efeito_sobre_demais_brl == 0


@pytest.mark.parametrize("config,ids,execucoes", [
    (ConfiguracaoAnalise(ModoAnalise.AGREGADO), (), 1),
    (ConfiguracaoAnalise(ModoAnalise.POR_CLIENTE), (), 1),
    (ConfiguracaoAnalise(ModoAnalise.MARGINAL_SELECIONADOS,
                         ("cliente-b", "cliente-a")), ("cliente-b", "cliente-a"), 3),
    (ConfiguracaoAnalise(ModoAnalise.COMPLETO, max_clientes_marginal_completo=3),
     ("cliente-a", "cliente-b", "cliente-c"), 4),
])
def test_modos_publicam_secoes_e_executam_apenas_simulacoes_necessarias(
    monkeypatch, cenario, config, ids, execucoes,
):
    chamadas = _observar_simulacoes(monkeypatch)
    analises_clientes = []

    def observar_clientes(cenario, cheio):
        analises_clientes.append((cenario, cheio))
        return analisar_clientes(cenario, cheio)

    monkeypatch.setattr(pipeline, "analisar_clientes", observar_clientes)
    monkeypatch.setattr(marginal, "analisar_clientes", observar_clientes)
    manifesto = _manifesto(cenario, config.modo)
    resultado = analisar(cenario, config, manifesto)
    assert len(chamadas) == execucoes
    assert len(analises_clientes) == (0 if config.modo is ModoAnalise.AGREGADO else 1)
    assert resultado.manifesto is manifesto
    assert resultado.avisos == manifesto.avisos
    assert resultado.agregado.execucao_completa == simular(cenario)
    assert tuple(c.cliente_id for c in resultado.contribuicoes_marginais) == ids
    if config.modo is ModoAnalise.AGREGADO:
        assert resultado.clientes == resultado.ledger_eventos == ()
    else:
        assert (resultado.ledger_eventos, resultado.clientes) == analisar_clientes(
            cenario, resultado.agregado.execucao_completa,
        )
    for contribuicao in resultado.contribuicoes_marginais:
        assert contribuicao == calcular_contribuicao_marginal(cenario, contribuicao.cliente_id)


def test_agregado_nao_calcula_analise_de_clientes(monkeypatch, cenario):
    def proibido(*args):
        pytest.fail("AGREGADO não deve calcular clientes")

    monkeypatch.setattr(pipeline, "analisar_clientes", proibido)
    monkeypatch.setattr(marginal, "analisar_clientes", proibido)
    resultado = analisar(cenario, ConfiguracaoAnalise(ModoAnalise.AGREGADO),
                         _manifesto(cenario, ModoAnalise.AGREGADO))
    assert resultado.clientes == resultado.contribuicoes_marginais == ()
    agregado = resultado.agregado
    assert set(agregado.ids_ordens_medidas) == {"a", "b", "c"}
    assert agregado.volume_bruto_periodo_brl == 400
    assert agregado.volume_casado_periodo_brl == 200
    assert agregado.volume_remetido_periodo_brl == 200
    assert agregado.baseline_periodo is agregado.execucao_completa.baseline
    assert agregado.netado_periodo is agregado.execucao_completa.netado
    assert agregado.economia_periodo_brl == agregado.execucao_completa.economia == D("84.30")
    assert agregado.taxa_netabilidade_periodo == agregado.execucao_completa.taxa_netabilidade == D("0.5")
    assert resultado.diagnosticos_experimentais == DiagnosticosExperimentais()


def test_completo_acima_do_limite_falha_antes_de_calcular(monkeypatch, cenario):
    chamadas = _observar_simulacoes(monkeypatch)
    config = ConfiguracaoAnalise(ModoAnalise.COMPLETO, max_clientes_marginal_completo=2)
    with pytest.raises(ValueError, match="confirmar_alto_custo"):
        analisar(cenario, config, _manifesto(cenario, config.modo))
    assert chamadas == []


def test_confirmacao_libera_completo_acima_do_limite(cenario):
    config = ConfiguracaoAnalise(ModoAnalise.COMPLETO, max_clientes_marginal_completo=2,
                                 confirmar_alto_custo=True)
    resultado = analisar(cenario, config, _manifesto(cenario, config.modo))
    assert len(resultado.contribuicoes_marginais) == 3


def test_limite_completo_conta_clientes_distintos_e_nao_ordens(cenario):
    cenario = replace(cenario, ordens=tuple(replace(o, cliente_id="unico")
                                          for o in cenario.ordens))
    config = ConfiguracaoAnalise(ModoAnalise.COMPLETO, max_clientes_marginal_completo=1)
    resultado = analisar(cenario, config, _manifesto(cenario, config.modo))
    assert len(resultado.contribuicoes_marginais) == 1
    assert resultado.agregado.economia_periodo_brl == D("84.30")


def test_volumes_agregados_nao_recontam_saldos_pendentes_em_varios_ciclos(cenario):
    cenario = replace(cenario, janela_dias=1, ordens=(
        Ordem("a", "a", Direcao.OUT, D(10), 0, 3, False, "x"),
        Ordem("b", "b", Direcao.IN, D(6), 1, 1, False, "x"),
        Ordem("c", "c", Direcao.IN, D(2), 2, 2, False, "x"),
    ))
    config = ConfiguracaoAnalise(ModoAnalise.POR_CLIENTE)
    resultado = analisar(cenario, config, _manifesto(cenario, config.modo))
    assert resultado.agregado.volume_bruto_periodo_brl == 18
    assert resultado.agregado.volume_casado_periodo_brl == 16
    assert resultado.agregado.volume_remetido_periodo_brl == 2


def test_selecionado_inexistente_falha_antes_de_simular(monkeypatch, cenario):
    chamadas = _observar_simulacoes(monkeypatch)
    config = ConfiguracaoAnalise(ModoAnalise.MARGINAL_SELECIONADOS, ("cliente-a", "ausente"))
    with pytest.raises(ValueError, match="cliente inexistente"):
        analisar(cenario, config, _manifesto(cenario, config.modo))
    assert chamadas == []


def test_ids_selecionados_duplicados_sao_rejeitados():
    with pytest.raises(ValueError, match="duplicados"):
        ConfiguracaoAnalise(ModoAnalise.MARGINAL_SELECIONADOS, ("cliente-a", "cliente-a"))


def test_manifesto_com_modo_divergente_falha_antes_de_simular(monkeypatch, cenario):
    chamadas = _observar_simulacoes(monkeypatch)
    with pytest.raises(ValueError, match="modo"):
        analisar(cenario, ConfiguracaoAnalise(ModoAnalise.AGREGADO),
                 _manifesto(cenario, ModoAnalise.COMPLETO))
    assert chamadas == []


@pytest.mark.parametrize("config", [
    ConfiguracaoAnalise(ModoAnalise.AGREGADO),
    ConfiguracaoAnalise(ModoAnalise.POR_CLIENTE),
    ConfiguracaoAnalise(ModoAnalise.COMPLETO, max_clientes_marginal_completo=1),
])
def test_pool_vazia_nao_divide_por_zero(cenario, config):
    cenario = replace(cenario, ordens=())
    resultado = analisar(cenario, config, _manifesto(cenario, config.modo))
    assert resultado.clientes == resultado.ledger_eventos == resultado.contribuicoes_marginais == ()
    assert resultado.agregado.volume_bruto_periodo_brl == 0
    assert resultado.agregado.taxa_netabilidade_periodo == 0
    assert resultado.agregado.economia_periodo_brl == 0


def test_marginal_preserva_ganho_publicado_com_residuo_decimal(cenario):
    cenario = replace(cenario, ordens=tuple(
        Ordem(str(i), str(i % 5), Direcao.OUT if i % 3 else Direcao.IN,
              D(100 + 13 * i), i % 7, i % 7 + i % 4 + 1, False, "x")
        for i in range(30)
    ), custo=replace(cenario.custo, custo_oportunidade_aa=D("0.15")),
        janela_dias=3, horizonte_dias=12)
    cheio = simular(cenario)
    _, clientes = analisar_clientes(cenario, cheio)
    cliente = clientes[-1]
    assert cliente.ganho_proprio_brl != cliente.baseline.total - cliente.netado.total
    precisao = getcontext().prec
    contribuicao = calcular_contribuicao_marginal(cenario, cliente.cliente_id)
    assert getcontext().prec == precisao
    assert contribuicao.ganho_proprio_brl == cliente.ganho_proprio_brl
    assert contribuicao.ganho_proprio_bps == cliente.ganho_proprio_bps
    sem_cliente = replace(cenario, ordens=tuple(o for o in cenario.ordens
                                               if o.cliente_id != cliente.cliente_id))
    esperado = _soma_exata(cheio.economia, simular(sem_cliente).economia.copy_negate())
    assert contribuicao.contribuicao_marginal_total_brl == esperado
    assert contribuicao.efeito_sobre_demais_brl == _soma_exata(
        esperado, cliente.ganho_proprio_brl.copy_negate(),
    )


def test_marginal_temporal_remove_tambem_ordens_de_aquecimento(cenario):
    cenario = replace(cenario, ordens=(
        Ordem("warm-a", "cliente-a", Direcao.OUT, D(100), 0, 9, False, "x"),
        Ordem("medida-a", "cliente-a", Direcao.IN, D(40), 5, 9, False, "x"),
        Ordem("medida-b", "cliente-b", Direcao.OUT, D(40), 5, 9, False, "x"),
    ), horizonte_dias=9)
    config = ConfiguracaoAnalise(ModoAnalise.MARGINAL_SELECIONADOS, ("cliente-a",))
    manifesto = _manifesto(cenario, config.modo)

    resultado = analisar(
        cenario, config, manifesto,
        configuracao_temporal=ConfiguracaoTemporal(dias_aquecimento=5, periodo_medicao_dias=5),
    )

    contribuicao, = resultado.contribuicoes_marginais
    sem_cliente = replace(cenario, ordens=(cenario.ordens[-1],))
    resultado_sem = analisar(
        sem_cliente,
        ConfiguracaoAnalise(ModoAnalise.POR_CLIENTE),
        replace(manifesto, modo_analise=ModoAnalise.POR_CLIENTE),
        configuracao_temporal=ConfiguracaoTemporal(5, 5),
    )
    assert contribuicao.contribuicao_marginal_total_brl == _soma_exata(
        resultado.agregado.economia_periodo_brl,
        resultado_sem.agregado.economia_periodo_brl.copy_negate(),
    )
