from decimal import Decimal
from pathlib import Path

import pytest

from motor.dominio import Alocacao, Arquetipo, Direcao, Ordem, TipoAlocacao, carregar_cenario

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"


def test_carregar_cenario_exemplo_amanda():
    cenario = carregar_cenario(str(CENARIO_EXEMPLO))

    assert len(cenario.ordens) == 3
    assert cenario.janela_dias == 1
    assert cenario.horizonte_dias == 1
    assert cenario.custo.ptax == Decimal("5.40")

    bruto_out = sum(
        (o.valor_brl for o in cenario.ordens if o.direcao is Direcao.OUT), Decimal(0)
    )
    bruto_in = sum(
        (o.valor_brl for o in cenario.ordens if o.direcao is Direcao.IN), Decimal(0)
    )

    assert bruto_out == Decimal("64800000.00")
    assert bruto_in == Decimal("27000000.00")


def test_ordem_rejeita_valor_nao_positivo():
    with pytest.raises(ValueError):
        Ordem(
            id="x",
            cliente_id="cliente",
            direcao=Direcao.OUT,
            valor_brl=Decimal("0"),
            dia_conhecida=0,
            dia_limite=0,
            eh_efx=False,
            finalidade="TODO",
        )


def test_ordem_rejeita_dia_limite_anterior_a_dia_conhecida():
    with pytest.raises(ValueError):
        Ordem(
            id="x",
            cliente_id="cliente",
            direcao=Direcao.OUT,
            valor_brl=Decimal("100"),
            dia_conhecida=5,
            dia_limite=2,
            eh_efx=False,
            finalidade="TODO",
        )


def test_alocacao_guarda_a_parcela_resolvida_num_dia():
    alocacao = Alocacao(
        ordem_id="o1", dia=3, valor_brl=Decimal("40"), tipo=TipoAlocacao.CASADO
    )

    assert alocacao.ordem_id == "o1"
    assert alocacao.dia == 3
    assert alocacao.valor_brl == Decimal("40")
    assert alocacao.tipo is TipoAlocacao.CASADO


def test_alocacao_rejeita_valor_nao_positivo():
    """ValueError, não AssertionError: `python -O` remove `assert` e uma alocação
    de valor zero passaria a entrar em silêncio na conta de conservação."""
    with pytest.raises(ValueError):
        Alocacao(ordem_id="o1", dia=0, valor_brl=Decimal("0"), tipo=TipoAlocacao.REMETIDO)


def _arquetipo_valido(**overrides) -> Arquetipo:
    campos = dict(
        nome="teste",
        p_out=0.5,
        ticket_mediana_brl=Decimal("1000"),
        ticket_sigma=0.5,
        cadencia_mensal=10,
        buffer_dias_min=1,
        buffer_dias_max=5,
        visibilidade_dias_min=0,
        visibilidade_dias_max=3,
        eh_efx=True,
        finalidade_out="ANEXO_V_TESTE_SAIDA",
        finalidade_in="ANEXO_V_TESTE_ENTRADA",
    )
    campos.update(overrides)
    return Arquetipo(**campos)


def test_arquetipo_aceita_parametros_validos():
    arquetipo = _arquetipo_valido()
    assert arquetipo.nome == "teste"
    assert arquetipo.p_out == 0.5


def test_arquetipo_rejeita_p_out_fora_de_0_1():
    with pytest.raises(ValueError):
        _arquetipo_valido(p_out=1.5)


def test_arquetipo_rejeita_ticket_mediana_nao_positivo():
    with pytest.raises(ValueError):
        _arquetipo_valido(ticket_mediana_brl=Decimal("0"))


def test_arquetipo_rejeita_cadencia_nao_positiva():
    with pytest.raises(ValueError):
        _arquetipo_valido(cadencia_mensal=0)


def test_arquetipo_rejeita_buffer_max_menor_que_min():
    with pytest.raises(ValueError):
        _arquetipo_valido(buffer_dias_min=10, buffer_dias_max=5)


def test_arquetipo_rejeita_visibilidade_max_menor_que_min():
    with pytest.raises(ValueError):
        _arquetipo_valido(visibilidade_dias_min=10, visibilidade_dias_max=5)


def _escrever_cenario(tmp_path: Path, ordens: str, extra_custo: str = "") -> str:
    conteudo = f"""
janela_dias: 1
horizonte_dias: 10

custo:
  iof_out: "0.035"
  iof_in: "0.0038"
  carry_cnr: "0.0004"
  spread_rail_bps: "0"
  custo_fixo_remessa: "0"
  custo_oportunidade_aa: "0"
  ptax: "5.40"
{extra_custo}
ordens:
{ordens}
"""
    destino = tmp_path / "cenario.yaml"
    destino.write_text(conteudo, encoding="utf-8")
    return str(destino)


_ORDEM_OK = """  - id: "a1"
    cliente_id: "a"
    direcao: "OUT"
    valor_brl: "100"
    dia_conhecida: 0
    dia_limite: 1
    eh_efx: false
    finalidade: "ANEXO_V_BENS_SERVICOS"
"""


def test_carregar_cenario_rejeita_ids_duplicados(tmp_path):
    """Dois ids iguais fazem o dict de pendentes do netting colapsar as duas ordens
    numa só — a segunda sobrescreve a primeira e o resultado sai errado em silêncio."""
    ordens = _ORDEM_OK + _ORDEM_OK.replace('valor_brl: "100"', 'valor_brl: "200"')

    with pytest.raises(ValueError, match="a1"):
        carregar_cenario(_escrever_cenario(tmp_path, ordens))


def test_carregar_cenario_rejeita_ordem_conhecida_depois_do_horizonte(tmp_path):
    """O laço do netting só vai até `horizonte_dias`: uma ordem conhecida depois
    disso nunca entra na simulação e desaparece sem alocação nenhuma."""
    ordens = _ORDEM_OK.replace("dia_conhecida: 0", "dia_conhecida: 50").replace(
        "dia_limite: 1", "dia_limite: 50"
    )

    with pytest.raises(ValueError, match="horizonte"):
        carregar_cenario(_escrever_cenario(tmp_path, ordens))


def test_carregar_cenario_le_a_tabela_de_iof_por_finalidade(tmp_path):
    """O campo existe em ParametrosCusto desde o PR #9, mas o loader não o lia —
    um cenário que declarasse a tabela era carregado com ela vazia."""
    extra = """  iof_por_finalidade:
    - finalidade: "ANEXO_V_BENS_SERVICOS"
      direcao: "OUT"
      aliquota: "0.0038"
"""
    cenario = carregar_cenario(_escrever_cenario(tmp_path, _ORDEM_OK, extra_custo=extra))

    assert cenario.custo.iof_por_finalidade[("ANEXO_V_BENS_SERVICOS", Direcao.OUT)] == Decimal(
        "0.0038"
    )


def test_carregar_cenario_sem_tabela_de_finalidade_continua_valendo(tmp_path):
    """Regressão: a tabela é opt-in — um cenário que não a declara segue carregando."""
    cenario = carregar_cenario(_escrever_cenario(tmp_path, _ORDEM_OK))

    assert cenario.custo.iof_por_finalidade == {}
