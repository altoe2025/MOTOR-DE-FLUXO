from decimal import Decimal

from motor.arquetipos import PAYROLL_FORNECEDOR, PSP_INBOUND
from motor.dominio import Cenario, Direcao, ParametrosCusto
from motor.geracao import gerar_ordens, gerar_pool
from motor.simulacao import simular

PARAMETROS_PADRAO = ParametrosCusto(
    iof_out=Decimal("0.035"),
    iof_in=Decimal("0.0038"),
    carry_cnr=Decimal("0.0004"),
    spread_rail_bps=Decimal("0"),
    custo_fixo_remessa=Decimal("0"),
    custo_oportunidade_aa=Decimal("0"),
    ptax=Decimal("5.40"),
)


def test_mesma_seed_gera_resultado_identico():
    a = gerar_ordens(PSP_INBOUND, "cliente_x", seed=42, horizonte_dias=365)
    b = gerar_ordens(PSP_INBOUND, "cliente_x", seed=42, horizonte_dias=365)
    assert a == b


def test_seeds_diferentes_geram_resultados_diferentes():
    a = gerar_ordens(PSP_INBOUND, "cliente_x", seed=1, horizonte_dias=365)
    b = gerar_ordens(PSP_INBOUND, "cliente_x", seed=2, horizonte_dias=365)
    assert a != b


def test_psp_inbound_direcao_bate_com_p_out():
    ordens = gerar_ordens(PSP_INBOUND, "x", seed=1, horizonte_dias=3650)
    frac_out = sum(1 for o in ordens if o.direcao == Direcao.OUT) / len(ordens)
    assert abs(frac_out - PSP_INBOUND.p_out) < 0.05


def test_cadencia_bate_com_o_esperado():
    ordens = gerar_ordens(PSP_INBOUND, "x", seed=1, horizonte_dias=3650)
    esperado = PSP_INBOUND.cadencia_mensal * 3650 / 30
    assert abs(len(ordens) - esperado) / esperado < 0.10


def test_buffer_dentro_dos_limites_declarados():
    ordens = gerar_ordens(PAYROLL_FORNECEDOR, "x", seed=1, horizonte_dias=3650)
    for o in ordens:
        buffer = o.dia_limite - o.dia_conhecida
        assert PAYROLL_FORNECEDOR.buffer_dias_min <= buffer <= PAYROLL_FORNECEDOR.buffer_dias_max


def test_nenhuma_ordem_conhecida_fora_do_horizonte():
    ordens = gerar_ordens(PSP_INBOUND, "x", seed=1, horizonte_dias=100)
    for o in ordens:
        assert 0 <= o.dia_conhecida < 100


def test_ids_sao_sequenciais_e_deterministicos():
    ordens = gerar_ordens(PSP_INBOUND, "cliente_x", seed=1, horizonte_dias=365)
    for i, o in enumerate(ordens):
        assert o.id == f"cliente_x-psp_inbound-{i:05d}"


def test_eh_efx_e_finalidade_copiados_do_arquetipo():
    """A finalidade vem da ponta CORRESPONDENTE à direção da ordem — ver
    tests/test_finalidade_por_direcao.py para o porquê."""
    ordens = gerar_ordens(PSP_INBOUND, "x", seed=1, horizonte_dias=365)
    for o in ordens:
        assert o.eh_efx == PSP_INBOUND.eh_efx
        esperada = (
            PSP_INBOUND.finalidade_out
            if o.direcao is Direcao.OUT
            else PSP_INBOUND.finalidade_in
        )
        assert o.finalidade == esperada


def test_adicionar_cliente_nao_muda_ordens_dos_outros():
    pool_5 = gerar_pool({"a": ("psp_inbound", 1), "b": ("exportador", 2)}, 365)
    pool_6 = gerar_pool(
        {
            "a": ("psp_inbound", 1),
            "b": ("exportador", 2),
            "c": ("tesouraria_corporativa", 3),
        },
        365,
    )
    ordens_a_em_5 = [o for o in pool_5 if o.cliente_id == "a"]
    ordens_a_em_6 = [o for o in pool_6 if o.cliente_id == "a"]
    assert ordens_a_em_5 == ordens_a_em_6


def test_ordens_geradas_alimentam_simular_sem_erro():
    ordens = gerar_ordens(PSP_INBOUND, "x", seed=1, horizonte_dias=30)
    cenario = Cenario(ordens=ordens, janela_dias=5, horizonte_dias=30, custo=PARAMETROS_PADRAO)
    resultado = simular(cenario)
    assert resultado is not None
