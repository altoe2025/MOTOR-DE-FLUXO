"""A finalidade de uma ordem tem que ser coerente com a direção dela.

`Arquetipo` declarava UMA `finalidade` para as duas pontas. Como `geracao.py`
sorteia a direção ordem a ordem, o `exportador` emitia ordens OUT herdando
`ANEXO_V_RECEITA_EXPORTACAO` — receita de exportação saindo do país, que não
existe. O mesmo produzia `ANEXO_V_REMESSA_TERCEIRO` entrando.

Isso não era só feio: desde que `custo.py` passou a ler `finalidade`, a alíquota
de IOF de cada ordem depende do par (finalidade, direção). Uma finalidade
incoerente com a direção cobra a alíquota errada.

Na vida real todo cliente de duas pontas tem finalidades diferentes em cada uma:
um exportador RECEBE receita de exportação e PAGA fornecedor; um PSP RECEBE
disponibilidade e PAGA remessa a terceiro. Por isso `Arquetipo` passa a declarar
`finalidade_out` e `finalidade_in` separadamente.

O que cada arquétipo declara continua sendo placeholder — é pergunta aberta para
a Amanda. O que estes testes travam é a COERÊNCIA, não os valores.
"""

import pytest

from motor.arquetipos import TODOS
from motor.dominio import Direcao
from motor.geracao import gerar_ordens

HORIZONTE = 3650
NOMES = sorted(TODOS.keys())

# Finalidades que só fazem sentido numa direção. Se uma delas aparecer do outro
# lado, a pool está descrevendo uma operação que não existe.
SO_ENTRADA = {"ANEXO_V_RECEITA_EXPORTACAO"}
SO_SAIDA = {"ANEXO_V_REMESSA_TERCEIRO", "ANEXO_V_BENS_SERVICOS"}


@pytest.mark.parametrize("nome", NOMES)
def test_arquetipo_declara_finalidade_das_duas_pontas(nome):
    arquetipo = TODOS[nome]
    assert arquetipo.finalidade_out
    assert arquetipo.finalidade_in


@pytest.mark.parametrize("nome", NOMES)
def test_finalidade_declarada_e_coerente_com_a_direcao(nome):
    arquetipo = TODOS[nome]
    assert arquetipo.finalidade_out not in SO_ENTRADA, nome
    assert arquetipo.finalidade_in not in SO_SAIDA, nome


@pytest.mark.parametrize("nome", NOMES)
def test_ordem_gerada_herda_a_finalidade_da_sua_direcao(nome):
    arquetipo = TODOS[nome]
    ordens = gerar_ordens(arquetipo, "c", seed=1, horizonte_dias=HORIZONTE)
    for ordem in ordens:
        esperada = (
            arquetipo.finalidade_out if ordem.direcao is Direcao.OUT else arquetipo.finalidade_in
        )
        assert ordem.finalidade == esperada


@pytest.mark.parametrize("nome", NOMES)
def test_nenhuma_ordem_tem_finalidade_impossivel_para_a_sua_direcao(nome):
    """O teste que mata a receita de exportação saindo do país."""
    ordens = gerar_ordens(TODOS[nome], "c", seed=1, horizonte_dias=HORIZONTE)
    for ordem in ordens:
        if ordem.direcao is Direcao.OUT:
            assert ordem.finalidade not in SO_ENTRADA, f"{nome}: {ordem.id}"
        else:
            assert ordem.finalidade not in SO_SAIDA, f"{nome}: {ordem.id}"


def test_exportador_recebe_receita_de_exportacao_e_paga_fornecedor():
    """O caso concreto que originou a correção."""
    exportador = TODOS["exportador"]
    assert exportador.finalidade_in == "ANEXO_V_RECEITA_EXPORTACAO"
    assert exportador.finalidade_out != "ANEXO_V_RECEITA_EXPORTACAO"


def test_arquetipo_pode_ter_a_mesma_finalidade_nas_duas_pontas():
    """Não é proibido — cripto e tesouraria operam a mesma natureza nos dois lados.
    A regra é coerência com a direção, não obrigatoriedade de finalidades distintas."""
    assert TODOS["cripto_native_sem_fiat"].finalidade_out == "ANEXO_V_ATIVOS_VIRTUAIS"
    assert TODOS["cripto_native_sem_fiat"].finalidade_in == "ANEXO_V_ATIVOS_VIRTUAIS"
