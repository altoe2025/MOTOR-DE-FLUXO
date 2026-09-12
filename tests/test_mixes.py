"""Os quatro mixes de cliente (β) e sua validação contra motor.arquetipos.

Um mix é `dict[str, float]`: nome do arquétipo -> peso relativo. Os pesos não
precisam somar 1 (a normalização acontece no consumo, em motor.varredura), mas
todo mix precisa citar os SEIS arquétipos — inclusive com peso 0. É isso que
transforma um erro de digitação no nome do arquétipo em erro de import, e não
numa varredura silenciosamente enviesada.
"""

import pytest

from decimal import Decimal

from motor import arquetipos
from motor.dominio import Direcao
from motor.varredura import montar_pool_do_ponto
from motor.mixes import (
    CORPORATIVO_PESADO,
    EQUILIBRADO,
    PSP_DOMINANTE,
    RETAIL_PESADO,
    OUTBOUND_EXTREMO,
    TODOS,
    normalizar,
    validar_mix,
)

NOMES_ESPERADOS = {
    "equilibrado",
    "retail_pesado",
    "corporativo_pesado",
    "psp_dominante",
    "outbound_extremo",
}


def _mix_valido() -> dict[str, float]:
    return dict.fromkeys(arquetipos.TODOS, 1.0)


def test_todos_contem_os_mixes_nomeados():
    assert set(TODOS.keys()) == NOMES_ESPERADOS


def test_cada_mix_cobre_exatamente_os_seis_arquetipos():
    for nome, mix in TODOS.items():
        assert set(mix.keys()) == set(arquetipos.TODOS.keys()), nome


def test_constantes_nomeadas_sao_as_entradas_de_todos():
    assert TODOS["equilibrado"] is EQUILIBRADO
    assert TODOS["retail_pesado"] is RETAIL_PESADO
    assert TODOS["corporativo_pesado"] is CORPORATIVO_PESADO
    assert TODOS["psp_dominante"] is PSP_DOMINANTE
    assert TODOS["outbound_extremo"] is OUTBOUND_EXTREMO


def test_pesos_sao_nao_negativos_e_somam_algo_positivo():
    for nome, mix in TODOS.items():
        assert all(peso >= 0 for peso in mix.values()), nome
        assert sum(mix.values()) > 0, nome


def test_validar_mix_rejeita_arquetipo_desconhecido():
    mix = _mix_valido()
    mix["arquetipo_que_nao_existe"] = 1.0
    with pytest.raises(ValueError, match="arquetipo_que_nao_existe"):
        validar_mix("teste", mix)


def test_validar_mix_rejeita_arquetipo_faltando():
    mix = _mix_valido()
    del mix["exportador"]
    with pytest.raises(ValueError, match="exportador"):
        validar_mix("teste", mix)


def test_validar_mix_rejeita_peso_negativo():
    mix = _mix_valido()
    mix["exportador"] = -1.0
    with pytest.raises(ValueError, match="exportador"):
        validar_mix("teste", mix)


def test_validar_mix_rejeita_mix_todo_zerado():
    mix = dict.fromkeys(arquetipos.TODOS, 0.0)
    with pytest.raises(ValueError, match="soma"):
        validar_mix("teste", mix)


def test_validar_mix_aceita_peso_zero_em_alguns_arquetipos():
    mix = _mix_valido()
    mix["exportador"] = 0.0
    assert validar_mix("teste", mix) == mix


def test_mensagem_de_erro_cita_o_nome_do_mix():
    mix = _mix_valido()
    del mix["exportador"]
    with pytest.raises(ValueError, match="mix_com_typo"):
        validar_mix("mix_com_typo", mix)


def test_normalizar_produz_pesos_que_somam_um():
    for nome, mix in TODOS.items():
        assert sum(normalizar(mix).values()) == pytest.approx(1.0), nome


def test_normalizar_preserva_as_proporcoes_relativas():
    mix = _mix_valido()
    mix["exportador"] = 3.0
    normalizado = normalizar(mix)
    assert normalizado["exportador"] / normalizado["psp_inbound"] == pytest.approx(3.0)


def test_equilibrado_da_o_mesmo_peso_aos_seis_arquetipos():
    assert len(set(EQUILIBRADO.values())) == 1


def test_retail_pesado_e_dominado_por_remessa_outbound_massiva():
    assert max(RETAIL_PESADO, key=RETAIL_PESADO.get) == "remessa_outbound_massiva"


def test_psp_dominante_e_dominado_por_psp_inbound():
    assert max(PSP_DOMINANTE, key=PSP_DOMINANTE.get) == "psp_inbound"


def test_corporativo_pesado_pesa_mais_tesouraria_que_retail():
    assert (
        CORPORATIVO_PESADO["tesouraria_corporativa"]
        > CORPORATIVO_PESADO["remessa_outbound_massiva"]
    )


def test_corporativo_pesado_pesa_mais_exportador_que_retail():
    assert CORPORATIVO_PESADO["exportador"] > CORPORATIVO_PESADO["remessa_outbound_massiva"]


def test_outbound_extremo_e_materialmente_mais_out_que_qualquer_outro_mix():
    """O eixo direcional é o que explica 58,6% da variância da economia, e a grade
    não cobria a ponta que interessa.

    A varredura de 2026-09-07 (`docs/RELATORIO-VARREDURA.md`) mediu a fração de
    volume IN que cada mix realiza: retail_pesado 0,280, equilibrado 0,448,
    corporativo_pesado 0,523, psp_dominante 0,528. O mercado que o produto vai
    encontrar é estruturalmente mais OUT que 28%, então a curva inteira estava
    medindo uma região possivelmente sem correspondente comercial.

    Este mix fecha essa ponta. O piso do que os arquétipos permitem é ~4,8% (uma
    carteira só de `payroll_fornecedor`, cujo `p_out` é 0,95); 15% é folgado o
    bastante para não trancar o teste no ruído amostral e apertado o bastante para
    garantir que o mix está de fato NA ponta, e não a meio caminho.

    O teste mede a fração REALIZADA sobre pools geradas, não os pesos declarados:
    o peso é de clientes, e cada arquétipo carrega volume por cliente muito
    diferente (payroll move ~3,2 M/mês, remessa ~0,6 M/mês). Peso não é volume.
    """
    fracoes = []
    for n_clientes in (8, 12, 32):
        for semente in range(1, 11):
            pool = montar_pool_do_ponto(OUTBOUND_EXTREMO, n_clientes, 365, semente)
            if not pool:
                continue
            total = sum((o.valor_brl for o in pool), Decimal(0))
            entrada = sum(
                (o.valor_brl for o in pool if o.direcao is Direcao.IN), Decimal(0)
            )
            fracoes.append(entrada / total)

    assert fracoes, "sem pool gerada, o teste não mediu nada"
    mediana = sorted(fracoes)[len(fracoes) // 2]
    assert mediana < Decimal("0.15"), f"fração IN realizada foi {mediana}"
    # E abaixo do mais OUT-pesado que já existia, com margem — senão não fecha lacuna.
    assert max(fracoes) < Decimal("0.28")
