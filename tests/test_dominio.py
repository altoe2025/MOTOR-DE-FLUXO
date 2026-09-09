from decimal import Decimal
from pathlib import Path

import pytest

from motor.dominio import (
    Alocacao,
    Arquetipo,
    Cenario,
    Direcao,
    Ordem,
    ParametrosCusto,
    TipoAlocacao,
    carregar_cenario,
)

CENARIO_EXEMPLO = Path(__file__).parent.parent / "motor" / "cenarios" / "exemplo_amanda.yaml"


@pytest.fixture
def custo_zero() -> ParametrosCusto:
    return _custo_valido()


def _custo_valido(**overrides) -> ParametrosCusto:
    campos = dict(
        iof_out=Decimal("0"),
        iof_in=Decimal("0"),
        carry_cnr=Decimal("0"),
        spread_rail_bps=Decimal("0"),
        custo_fixo_remessa=Decimal("0"),
        custo_oportunidade_aa=Decimal("0"),
        ptax=Decimal("5.40"),
    )
    campos.update(overrides)
    return ParametrosCusto(**campos)


def ordem(**overrides) -> Ordem:
    campos = dict(
        id="ordem",
        cliente_id="cliente",
        direcao=Direcao.OUT,
        valor_brl=Decimal("100"),
        dia_conhecida=0,
        dia_limite=0,
        eh_efx=False,
        finalidade="TODO",
    )
    campos.update(overrides)
    return Ordem(**campos)


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


def test_ordem_rejeita_id_vazio():
    with pytest.raises(ValueError, match="id de ordem não pode ser vazio"):
        ordem(id="")


def test_ordem_rejeita_cliente_vazio():
    with pytest.raises(ValueError, match="cliente_id não pode ser vazio"):
        ordem(cliente_id="")


def test_ordem_rejeita_valor_nao_finito():
    with pytest.raises(ValueError, match="valor_brl deve ser positivo"):
        ordem(valor_brl=Decimal("NaN"))


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


def test_alocacao_rejeita_valor_nao_finito():
    with pytest.raises(ValueError, match="valor_brl de uma Alocacao deve ser positivo"):
        Alocacao(
            ordem_id="o1", dia=0, valor_brl=Decimal("NaN"), tipo=TipoAlocacao.REMETIDO
        )


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


@pytest.mark.parametrize("p_out", [float("nan"), float("inf"), float("-inf")])
def test_arquetipo_rejeita_p_out_nao_finito(p_out):
    with pytest.raises(ValueError, match="p_out deve estar em \\[0,1\\]"):
        _arquetipo_valido(p_out=p_out)


def test_arquetipo_rejeita_ticket_mediana_nao_positivo():
    with pytest.raises(ValueError):
        _arquetipo_valido(ticket_mediana_brl=Decimal("0"))


def test_arquetipo_rejeita_cadencia_nao_positiva():
    with pytest.raises(ValueError):
        _arquetipo_valido(cadencia_mensal=0)


@pytest.mark.parametrize(
    ("campo", "valor"),
    [
        ("ticket_mediana_brl", Decimal("NaN")),
        ("ticket_sigma", float("nan")),
        ("cadencia_mensal", float("inf")),
    ],
)
def test_arquetipo_rejeita_parametro_nao_finito(campo, valor):
    with pytest.raises(ValueError):
        _arquetipo_valido(**{campo: valor})


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


def test_cenario_direto_rejeita_ids_duplicados(custo_zero):
    primeira = ordem(id="dup", cliente_id="a", valor_brl=Decimal("100"))
    segunda = ordem(id="dup", cliente_id="b", valor_brl=Decimal("100"))
    with pytest.raises(ValueError, match="id de ordem duplicado: 'dup'"):
        Cenario((primeira, segunda), janela_dias=1, horizonte_dias=0, custo=custo_zero)


@pytest.mark.parametrize("janela", [0, -1])
def test_cenario_rejeita_janela_nao_positiva(custo_zero, janela):
    with pytest.raises(ValueError, match="janela_dias deve ser >= 1"):
        Cenario((), janela_dias=janela, horizonte_dias=0, custo=custo_zero)


def test_cenario_rejeita_horizonte_negativo(custo_zero):
    with pytest.raises(ValueError, match="horizonte_dias deve ser >= 0"):
        Cenario((), janela_dias=1, horizonte_dias=-1, custo=custo_zero)


def test_parametros_custo_rejeita_ptax_zero():
    with pytest.raises(ValueError, match="ptax deve ser finito e positivo"):
        _custo_valido(ptax=Decimal("0"))


@pytest.mark.parametrize("ptax", [Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity")])
def test_parametros_custo_rejeita_ptax_nao_finita(ptax):
    with pytest.raises(ValueError, match="ptax deve ser finito e positivo"):
        _custo_valido(ptax=ptax)


@pytest.mark.parametrize(
    "campo",
    [
        "iof_out",
        "iof_in",
        "carry_cnr",
        "spread_rail_bps",
        "custo_fixo_remessa",
        "custo_oportunidade_aa",
    ],
)
def test_parametros_custo_rejeita_custo_negativo(campo):
    with pytest.raises(ValueError, match=f"{campo} deve ser finito e não negativo"):
        _custo_valido(**{campo: Decimal("-0.01")})


@pytest.mark.parametrize(
    "campo",
    [
        "iof_out",
        "iof_in",
        "carry_cnr",
        "spread_rail_bps",
        "custo_fixo_remessa",
        "custo_oportunidade_aa",
    ],
)
@pytest.mark.parametrize("valor", [Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity")])
def test_parametros_custo_rejeita_custo_nao_finito(campo, valor):
    with pytest.raises(ValueError, match=f"{campo} deve ser finito e não negativo"):
        _custo_valido(**{campo: valor})


def test_parametros_custo_copia_a_tabela_de_iof_por_finalidade():
    tabela = {("ANEXO_V_TESTE", Direcao.OUT): Decimal("0.01")}
    custo = _custo_valido(iof_por_finalidade=tabela)

    tabela[("ANEXO_V_TESTE", Direcao.OUT)] = Decimal("0.02")

    assert custo.iof_por_finalidade[("ANEXO_V_TESTE", Direcao.OUT)] == Decimal("0.01")
    with pytest.raises(TypeError):
        custo.iof_por_finalidade[("ANEXO_V_TESTE", Direcao.OUT)] = Decimal("0.03")


@pytest.mark.parametrize(
    ("tabela", "mensagem"),
    [
        ({"chave inválida": Decimal("0.01")}, "chave inválida"),
        ({("", Direcao.OUT): Decimal("0.01")}, "finalidade inválida"),
        ({("ANEXO_V_TESTE", "OUT"): Decimal("0.01")}, "direção inválida"),
    ],
)
def test_parametros_custo_rejeita_chave_de_iof_por_finalidade_invalida(tabela, mensagem):
    with pytest.raises(ValueError, match=mensagem):
        _custo_valido(iof_por_finalidade=tabela)


@pytest.mark.parametrize(
    "aliquota", [Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity"), Decimal("-0.01")]
)
def test_parametros_custo_rejeita_aliquota_de_iof_por_finalidade_invalida(aliquota):
    tabela = {("ANEXO_V_TESTE", Direcao.OUT): aliquota}
    with pytest.raises(ValueError, match="alíquota de iof_por_finalidade"):
        _custo_valido(iof_por_finalidade=tabela)


def test_carregar_cenario_rejeita_ptax_zero(tmp_path):
    caminho = Path(_escrever_cenario(tmp_path, _ORDEM_OK))
    caminho.write_text(
        caminho.read_text(encoding="utf-8").replace('ptax: "5.40"', 'ptax: "0"'),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="ptax deve ser finito e positivo"):
        carregar_cenario(str(caminho))


def test_carregar_cenario_rejeita_custo_nao_finito(tmp_path):
    caminho = Path(_escrever_cenario(tmp_path, _ORDEM_OK))
    caminho.write_text(
        caminho.read_text(encoding="utf-8").replace('iof_out: "0.035"', 'iof_out: "NaN"'),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="iof_out deve ser finito e não negativo"):
        carregar_cenario(str(caminho))


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
