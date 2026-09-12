from dataclasses import FrozenInstanceError, replace
from decimal import Decimal

import pytest

from motor.analise import (
    AgregadoCanonico,
    ConfiguracaoAnalise,
    ContribuicaoMarginal,
    DiagnosticosExperimentais,
    EventoCliente,
    ManifestoExecucao,
    ModoAnalise,
    ResultadoCanonico,
    ResultadoCliente,
    ResumoDiaCliente,
)
from motor.custo import Custos
from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.simulacao import simular


def _ordem():
    return Ordem("o1", "c1", Direcao.OUT, Decimal("100"), 0, 1, False, "TESTE")


def _custo():
    return ParametrosCusto(
        iof_out=Decimal("0.035"), iof_in=Decimal("0.0038"),
        carry_cnr=Decimal("0"), spread_rail_bps=Decimal("0"),
        custo_fixo_remessa=Decimal("0"), custo_oportunidade_aa=Decimal("0"),
        ptax=Decimal("5.40"),
        iof_por_finalidade={("TESTE", Direcao.OUT): Decimal("0.02")},
    )


def _cenario():
    return Cenario((_ordem(),), 1, 1, _custo())


@pytest.fixture
def resultado():
    cenario = _cenario()
    execucao = simular(cenario)
    manifesto = ManifestoExecucao(
        run_id="run-1", schema_version="1", versao_motor="0.1.0",
        criado_em_utc="2026-09-09T00:00:00Z", hash_configuracao="abc",
        run_ids_origem=(), parametros_custo=cenario.custo, mixes=("teste",),
        arquetipos=("teste",), horizonte_dias=1, periodo_medicao_dias=1,
        janela_dias=1, seeds=(7,),
        modo_analise=ModoAnalise.AGREGADO, custo_calibrado=False,
        metodo_percentil="linear", drenagem="legada", avisos=("sintetico",),
    )
    agregado = AgregadoCanonico(
        execucao_completa=execucao, ids_ordens_medidas=("o1",),
        volume_bruto_periodo_brl=Decimal("100"),
        volume_casado_periodo_brl=Decimal("0"),
        volume_remetido_periodo_brl=Decimal("100"),
        baseline_periodo=execucao.baseline, netado_periodo=execucao.netado,
        economia_periodo_brl=Decimal("0"), taxa_netabilidade_periodo=Decimal("0"),
    )
    return ResultadoCanonico(
        manifesto, agregado, (), (), (), DiagnosticosExperimentais(), (),
    )


@pytest.fixture
def detalhe():
    zero = Decimal("0")
    custos = Custos(zero, zero, zero, zero, zero, zero)
    dia = ResumoDiaCliente("c1", 0, Decimal("100"), zero, zero, zero, zero, zero, zero)
    cliente = ResultadoCliente(
        "c1", Decimal("100"), zero, Decimal("100"), custos, custos,
        Decimal("-2"), Decimal("-200"), (dia,),
    )
    evento = EventoCliente(
        "o1:conhecida", "c1", "o1", 0, None, "ORDEM_CONHECIDA",
        Decimal("100"), custos, custos, zero, False,
    )
    marginal = ContribuicaoMarginal(
        "c1", Decimal("-2"), Decimal("-200"), Decimal("3"),
        Decimal("300"), Decimal("5"), Decimal("500"),
    )
    return cliente, evento, marginal


def test_configuracao_expoe_quatro_modos():
    assert {modo.value for modo in ModoAnalise} == {
        "AGREGADO", "POR_CLIENTE", "MARGINAL_SELECIONADOS", "COMPLETO",
    }


@pytest.mark.parametrize("config", [
    (ModoAnalise.AGREGADO, (), None, False),
    (ModoAnalise.POR_CLIENTE, (), None, False),
    (ModoAnalise.MARGINAL_SELECIONADOS, ("c2", "c1"), None, False),
    (ModoAnalise.COMPLETO, (), 1, False),
    (ModoAnalise.COMPLETO, (), 1, True),
])
def test_configuracoes_validas_preservam_opcoes(config):
    configuracao = ConfiguracaoAnalise(*config)
    assert configuracao.modo is config[0]
    assert configuracao.clientes_marginais == config[1]
    assert configuracao.max_clientes_marginal_completo == config[2]
    assert configuracao.confirmar_alto_custo is config[3]


def test_marginal_selecionados_exige_ids():
    with pytest.raises(ValueError, match="clientes_marginais"):
        ConfiguracaoAnalise(ModoAnalise.MARGINAL_SELECIONADOS)


def test_completo_exige_limite_de_clientes():
    with pytest.raises(ValueError, match="max_clientes_marginal_completo"):
        ConfiguracaoAnalise(ModoAnalise.COMPLETO)


@pytest.mark.parametrize("ids", [("",), ("   ",), ("c1", "c1"), (None,), (1,)])
def test_rejeita_ids_invalidos_ou_duplicados(ids):
    with pytest.raises(ValueError, match="clientes_marginais"):
        ConfiguracaoAnalise(ModoAnalise.MARGINAL_SELECIONADOS, ids)


@pytest.mark.parametrize("limite", [0, -1, True, 1.5, "2"])
def test_limite_de_completo_deve_ser_inteiro_positivo(limite):
    with pytest.raises(ValueError, match="max_clientes_marginal_completo"):
        ConfiguracaoAnalise(ModoAnalise.COMPLETO, max_clientes_marginal_completo=limite)


@pytest.mark.parametrize("modo", [ModoAnalise.AGREGADO, ModoAnalise.POR_CLIENTE, ModoAnalise.COMPLETO])
def test_ids_selecionados_nao_podem_ser_ignorados_por_outro_modo(modo):
    with pytest.raises(ValueError, match="clientes_marginais"):
        ConfiguracaoAnalise(modo, ("c1",), max_clientes_marginal_completo=10 if modo is ModoAnalise.COMPLETO else None)


@pytest.mark.parametrize("modo", [ModoAnalise.AGREGADO, ModoAnalise.POR_CLIENTE, ModoAnalise.MARGINAL_SELECIONADOS])
@pytest.mark.parametrize("opcoes, campo", [
    ({"max_clientes_marginal_completo": 10}, "max_clientes_marginal_completo"),
    ({"confirmar_alto_custo": True}, "confirmar_alto_custo"),
])
def test_guardas_de_completo_nao_podem_ser_ignoradas_por_outro_modo(modo, opcoes, campo):
    ids = ("c1",) if modo is ModoAnalise.MARGINAL_SELECIONADOS else ()
    with pytest.raises(ValueError, match=campo):
        ConfiguracaoAnalise(modo, ids, **opcoes)


@pytest.mark.parametrize("modo", ["AGREGADO", "INVALIDO", None])
def test_modo_deve_ser_enum_explicito(modo):
    with pytest.raises(ValueError, match="modo"):
        ConfiguracaoAnalise(modo)


@pytest.mark.parametrize("confirmacao", [1, "sim", None])
def test_confirmacao_de_alto_custo_deve_ser_booleana(confirmacao):
    with pytest.raises(ValueError, match="confirmar_alto_custo"):
        ConfiguracaoAnalise(ModoAnalise.COMPLETO, (), 1, confirmacao)


def test_configuracao_rejeita_lista_mutavel():
    with pytest.raises(ValueError, match="clientes_marginais"):
        ConfiguracaoAnalise(ModoAnalise.MARGINAL_SELECIONADOS, ["c1"])


def test_contrato_preserva_resultado_legado_e_parametros_estruturados(resultado):
    assert resultado.agregado.execucao_completa == simular(_cenario())
    assert resultado.agregado.execucao_completa.baseline.total == Decimal("2.00")
    assert resultado.manifesto.parametros_custo.iof_por_finalidade == {
        ("TESTE", Direcao.OUT): Decimal("0.02"),
    }
    assert resultado.manifesto.periodo_medicao_dias == resultado.manifesto.horizonte_dias == 1
    assert resultado.clientes == resultado.ledger_eventos == resultado.contribuicoes_marginais == ()
    assert resultado.diagnosticos_experimentais.limite_intra_cliente_brl is None


@pytest.mark.parametrize("modo", ["AGREGADO", "INVALIDO", None])
def test_manifesto_rejeita_modo_que_burlaria_restricoes_de_secoes(resultado, modo):
    with pytest.raises(ValueError, match="modo_analise"):
        replace(resultado.manifesto, modo_analise=modo)


def test_contratos_sao_imutaveis(resultado, detalhe):
    cliente, evento, marginal = detalhe
    objetos = (
        (ConfiguracaoAnalise(ModoAnalise.AGREGADO), "modo"),
        (resultado, "avisos"), (resultado.manifesto, "run_id"),
        (resultado.agregado, "ids_ordens_medidas"),
        (resultado.diagnosticos_experimentais, "limite_intra_cliente_brl"),
        (cliente, "cliente_id"), (evento, "evento_id"), (marginal, "cliente_id"),
        (cliente.historico_diario[0], "dia"),
    )
    for objeto, campo in objetos:
        with pytest.raises(FrozenInstanceError):
            setattr(objeto, campo, None)


def test_colecoes_de_resultados_rejeitam_listas_mutaveis(resultado, detalhe):
    objetos_campos = (
        (resultado, ("clientes", "ledger_eventos", "contribuicoes_marginais", "avisos")),
        (resultado.manifesto, ("run_ids_origem", "mixes", "arquetipos", "seeds", "avisos")),
        (resultado.agregado, ("ids_ordens_medidas",)),
        (detalhe[0], ("historico_diario",)),
    )
    for objeto, campos in objetos_campos:
        for campo in campos:
            with pytest.raises(ValueError, match=campo):
                replace(objeto, **{campo: []})


@pytest.mark.parametrize("campo, indice", [("clientes", 0), ("ledger_eventos", 1), ("contribuicoes_marginais", 2)])
def test_agregado_rejeita_secoes_nao_solicitadas(resultado, detalhe, campo, indice):
    with pytest.raises(ValueError, match=campo):
        replace(resultado, **{campo: (detalhe[indice],)})


def test_por_cliente_rejeita_marginais_nao_solicitadas(resultado, detalhe):
    manifesto = replace(resultado.manifesto, modo_analise=ModoAnalise.POR_CLIENTE)
    with pytest.raises(ValueError, match="contribuicoes_marginais"):
        replace(resultado, manifesto=manifesto, contribuicoes_marginais=(detalhe[2],))


@pytest.mark.parametrize("modo", [ModoAnalise.POR_CLIENTE, ModoAnalise.MARGINAL_SELECIONADOS, ModoAnalise.COMPLETO])
def test_secoes_solicitadas_preservam_ganhos_negativos_e_metadados(resultado, detalhe, modo):
    cliente, evento, marginal = detalhe
    completo = replace(
        resultado, manifesto=replace(resultado.manifesto, modo_analise=modo),
        clientes=(cliente,), ledger_eventos=(evento,),
        contribuicoes_marginais=() if modo is ModoAnalise.POR_CLIENTE else (marginal,),
    )
    assert completo.clientes[0].ganho_proprio_brl == Decimal("-2")
    assert replace(evento, eh_efx=True).baseline == evento.baseline
    assert replace(evento, eh_efx=True).ganho_realizado_brl == evento.ganho_realizado_brl
