from motor.arquetipos import TODOS


def test_todos_contem_os_seis_arquetipos_esperados():
    esperado = {
        "remessa_outbound_massiva",
        "psp_inbound",
        "cripto_native_sem_fiat",
        "payroll_fornecedor",
        "exportador",
        "tesouraria_corporativa",
    }
    assert set(TODOS.keys()) == esperado


def test_cada_entrada_do_dict_tem_nome_consistente_com_a_chave():
    for chave, arquetipo in TODOS.items():
        assert arquetipo.nome == chave
