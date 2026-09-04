"""Quatro mixes de composição de carteira (β): que fração dos clientes é de cada
arquétipo.

Um mix é `dict[str, float]` mapeando nome do arquétipo (chave de
`motor.arquetipos.TODOS`) -> peso relativo. Os pesos NÃO precisam somar 1: a
normalização acontece no consumo, em `motor.varredura.montar_especificacao_pool`.

Todo mix precisa citar os SEIS arquétipos, inclusive com peso 0. É essa exigência
que transforma um erro de digitação no nome de um arquétipo em `ValueError` na
hora do import, em vez de numa varredura silenciosamente enviesada — um mix a que
falta `exportador` não é "um mix sem exportadores", é um mix escrito errado, e os
dois casos são indistinguíveis sem essa regra. Para dizer "sem exportadores",
escreva `exportador: 0.0` explicitamente.

Os pesos aqui são PLACEHOLDERS. São o formato de uma carteira plausível, não
medida de mercado nem dado da Amanda — igual aos números de `arquetipos.py`. O
objetivo da varredura é descobrir a que a economia é sensível, não acertar hoje
qual é a carteira real.

Regra de importação: este módulo importa apenas `motor.arquetipos`.
"""

from __future__ import annotations

from motor.arquetipos import TODOS as ARQUETIPOS

Mix = dict[str, float]


def validar_mix(nome: str, mix: Mix) -> Mix:
    """Confere que o mix cita exatamente os seis arquétipos, com pesos utilizáveis.

    Devolve o próprio mix para poder ser usada na definição de `TODOS`.
    """
    esperadas = set(ARQUETIPOS.keys())
    recebidas = set(mix.keys())

    if recebidas != esperadas:
        faltando = sorted(esperadas - recebidas)
        sobrando = sorted(recebidas - esperadas)
        raise ValueError(
            f"mix {nome!r} não cobre os arquétipos de motor.arquetipos.TODOS: "
            f"faltando={faltando} desconhecidos={sobrando}"
        )

    negativos = sorted(chave for chave, peso in mix.items() if peso < 0)
    if negativos:
        raise ValueError(f"mix {nome!r} tem peso negativo em {negativos}")

    if sum(mix.values()) <= 0:
        raise ValueError(f"mix {nome!r} tem soma de pesos não positiva")

    return mix


def normalizar(mix: Mix) -> Mix:
    """Devolve os mesmos pesos reescalados para somar 1. Pura."""
    total = sum(mix.values())
    return {chave: peso / total for chave, peso in mix.items()}


EQUILIBRADO = validar_mix(
    "equilibrado",
    {
        "remessa_outbound_massiva": 1.0,
        "psp_inbound": 1.0,
        "cripto_native_sem_fiat": 1.0,
        "payroll_fornecedor": 1.0,
        "exportador": 1.0,
        "tesouraria_corporativa": 1.0,
    },
)
"""Um sexto de cada arquétipo — o mix de controle, não uma previsão de carteira."""

RETAIL_PESADO = validar_mix(
    "retail_pesado",
    {
        "remessa_outbound_massiva": 6.0,
        "psp_inbound": 1.0,
        "cripto_native_sem_fiat": 2.0,
        "payroll_fornecedor": 0.5,
        "exportador": 0.25,
        "tesouraria_corporativa": 0.25,
    },
)
"""Muitos clientes de ticket pequeno e cadência alta, quase todos OUT. A hipótese
a testar aqui é que o fluxo é unidirecional demais para casar."""

CORPORATIVO_PESADO = validar_mix(
    "corporativo_pesado",
    {
        "remessa_outbound_massiva": 0.25,
        "psp_inbound": 1.0,
        "cripto_native_sem_fiat": 0.25,
        "payroll_fornecedor": 2.5,
        "exportador": 3.0,
        "tesouraria_corporativa": 3.0,
    },
)
"""Poucos clientes de ticket grande e buffer longo, com exportador (IN) fazendo
contrapeso a payroll (OUT). A hipótese é que aqui o netting tem o que casar."""

PSP_DOMINANTE = validar_mix(
    "psp_dominante",
    {
        "remessa_outbound_massiva": 1.5,
        "psp_inbound": 6.0,
        "cripto_native_sem_fiat": 1.5,
        "payroll_fornecedor": 0.5,
        "exportador": 0.25,
        "tesouraria_corporativa": 0.25,
    },
)
"""Uma carteira ancorada num punhado de PSPs de ticket alto e buffer de 20-30 dias,
com o retail OUT como contraparte natural."""

TODOS: dict[str, Mix] = {
    "equilibrado": EQUILIBRADO,
    "retail_pesado": RETAIL_PESADO,
    "corporativo_pesado": CORPORATIVO_PESADO,
    "psp_dominante": PSP_DOMINANTE,
}
