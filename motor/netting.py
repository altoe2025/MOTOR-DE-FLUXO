"""Netting multilateral de ordens dentro da janela fixa da política P0.

`executar_p0(cenario) -> tuple[Ciclo, ...]` é pura: nenhum cálculo de dinheiro
aqui — netting não sabe o que é IOF. Só casa OUT com IN dentro da janela e
devolve os `Ciclo` que `motor.custo` vai precificar depois.

Algoritmo P0: percorre o horizonte dia a dia, acumulando as ordens já
conhecidas (`dia_conhecida <= dia`) num lote aberto. Fecha o lote num `Ciclo`
quando, no dia corrente, ocorre o que vier primeiro entre: (1) já passaram
`janela_dias` desde o último fechamento; (2) alguma ordem do lote vence hoje
(`dia_limite == dia`); (3) o horizonte da simulação terminou. Ao fechar,
`casado = min(bruto_out, bruto_in)` e `residuo = abs(bruto_out - bruto_in)`.

O motor pode AGREGAR ordens numa remessa maior, mas nunca QUEBRAR uma ordem em
remessas menores — é o art. 22 da Res. BCB 277 (vedado fracionar operação para
aproveitar prerrogativa de limite). Por isso cada ordem entra inteira em
exatamente um `Ciclo`; nunca é dividida entre dois.

Regra de importação: este módulo importa apenas `motor.dominio`. Nunca
`motor.custo`.
"""

from __future__ import annotations

from decimal import Decimal

from motor.dominio import Cenario, Ciclo, Direcao, Ordem


def executar_p0(cenario: Cenario) -> tuple[Ciclo, ...]:
    """Casa OUT com IN dentro da janela fixa da política P0. Função pura."""
    por_dia_conhecida: dict[int, list[Ordem]] = {}
    for ordem in cenario.ordens:
        por_dia_conhecida.setdefault(ordem.dia_conhecida, []).append(ordem)

    abertas: list[Ordem] = []
    ciclos: list[Ciclo] = []
    dia_ultimo_fechamento = -1
    ids_executadas: set[str] = set()

    for dia in range(cenario.horizonte_dias + 1):
        abertas.extend(por_dia_conhecida.get(dia, []))

        vence_hoje = any(ordem.dia_limite == dia for ordem in abertas)
        janela_completa = (dia - dia_ultimo_fechamento) >= cenario.janela_dias
        fim_do_horizonte = dia == cenario.horizonte_dias

        if abertas and (vence_hoje or janela_completa or fim_do_horizonte):
            for ordem in abertas:
                assert ordem.id not in ids_executadas, f"ordem {ordem.id} executada duas vezes"
                ids_executadas.add(ordem.id)

            bruto_out = sum(
                (o.valor_brl for o in abertas if o.direcao is Direcao.OUT), Decimal(0)
            )
            bruto_in = sum(
                (o.valor_brl for o in abertas if o.direcao is Direcao.IN), Decimal(0)
            )
            casado = min(bruto_out, bruto_in)
            residuo = abs(bruto_out - bruto_in)
            direcao_residuo = Direcao.OUT if bruto_out >= bruto_in else Direcao.IN

            # casado_out == casado_in por construção: é o mesmo valor casado nos
            # dois lados, então não pode exceder o bruto de nenhum dos lados.
            assert casado <= bruto_out and casado <= bruto_in
            assert bruto_out - bruto_in in (residuo, -residuo)

            ciclos.append(
                Ciclo(
                    dia=dia,
                    ordens=tuple(abertas),
                    bruto_out=bruto_out,
                    bruto_in=bruto_in,
                    casado=casado,
                    residuo=residuo,
                    direcao_residuo=direcao_residuo,
                )
            )
            abertas = []
            dia_ultimo_fechamento = dia

    assert not abertas, "sobraram ordens abertas ao fim do horizonte"

    total_criado = sum((o.valor_brl for o in cenario.ordens), Decimal(0))
    total_executado = sum(
        (o.valor_brl for ciclo in ciclos for o in ciclo.ordens), Decimal(0)
    )
    assert total_criado == total_executado, "conservacao violada: soma executada != soma criada"

    return tuple(ciclos)
