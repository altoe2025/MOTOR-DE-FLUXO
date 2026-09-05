"""Netting multilateral de ordens dentro da janela fixa da política P0.

`executar_p0(cenario) -> tuple[Ciclo, ...]` é pura: nenhum cálculo de dinheiro
aqui — netting não sabe o que é IOF. Só casa OUT com IN e devolve os `Ciclo` que
`motor.custo` vai precificar depois.

`casado` e `residuo` são POSIÇÃO AGREGADA DE TESOURARIA, não pareamento físico de
operação com operação. A ordem A não é "casada com" a ordem B — o motor calcula
que, no agregado do dia, tal volume não precisou atravessar a fronteira.
Isso é coerente com o Modelo B: cada operação executa e registra individualmente;
o que se agrega é a necessidade de funding externo, e o que se rateia é o custo do
resíduo. Cobertura parcial de uma ordem NÃO é fracionamento de operação (art. 22
da Res. BCB 277) — nenhuma operação é quebrada em remessas menores para aproveitar
prerrogativa de limite. Não "otimize" removendo esta distinção.

Algoritmo P0: percorre o horizonte dia a dia, acumulando as ordens já conhecidas
(`dia_conhecida <= dia`) num lote aberto. Fecha o lote num `Ciclo` quando, no dia
corrente, ocorre o que vier primeiro entre: (1) já passaram `janela_dias` desde o
último fechamento; (2) alguma ordem aberta vence hoje (`dia_limite == dia`); (3) o
horizonte da simulação terminou.

Ao fechar, casa `min(pendente_out, pendente_in)` e emite `Alocacao(CASADO)` nos
dois lados. O que sobra **permanece aberto**: só vira `Alocacao(REMETIDO)` no dia
em que a ordem atinge o próprio `dia_limite`. O vencimento de uma ordem força a
saída apenas DAQUELA ordem, nunca do lote inteiro — remeter o lote todo era um
artefato do modelo antigo que descartava netting ainda possível para as ordens que
tinham folga, e custava ~33 pontos de netabilidade.

Prioridade de cobertura: EDF (`earliest deadline first`), com desempate por `id`.
Cobrir primeiro quem tem menos folga libera a restrição mais apertada e deixa as
ordens folgadas abertas para casar depois. FIFO seria errado: com buffers
heterogêneos, "mais antiga" não é sinônimo de "mais urgente". O desempate por `id`
não é decorativo — sem ele duas execuções com a mesma seed podem divergir, e a
reprodutibilidade quebra silenciosamente.

Regra de importação: este módulo importa apenas `motor.dominio`. Nunca
`motor.custo`.
"""

from __future__ import annotations

from decimal import Decimal

from motor.dominio import Alocacao, Cenario, Ciclo, Direcao, Ordem, TipoAlocacao


def _prioridade(ordem: Ordem) -> tuple[int, str]:
    """EDF com desempate determinístico."""
    return (ordem.dia_limite, ordem.id)


def executar_p0(cenario: Cenario) -> tuple[Ciclo, ...]:
    """Casa OUT com IN na janela fixa da política P0. Função pura."""
    por_dia_conhecida: dict[int, list[Ordem]] = {}
    for ordem in cenario.ordens:
        por_dia_conhecida.setdefault(ordem.dia_conhecida, []).append(ordem)

    pendente: dict[str, Decimal] = {o.id: o.valor_brl for o in cenario.ordens}
    abertas: list[Ordem] = []
    ciclos: list[Ciclo] = []
    dia_ultimo_fechamento = -1

    for dia in range(cenario.horizonte_dias + 1):
        abertas.extend(por_dia_conhecida.get(dia, []))

        vence_hoje = any(ordem.dia_limite == dia for ordem in abertas)
        janela_completa = (dia - dia_ultimo_fechamento) >= cenario.janela_dias
        fim_do_horizonte = dia == cenario.horizonte_dias

        if not abertas or not (vence_hoje or janela_completa or fim_do_horizonte):
            continue

        out = sorted((o for o in abertas if o.direcao is Direcao.OUT), key=_prioridade)
        entrada = sorted((o for o in abertas if o.direcao is Direcao.IN), key=_prioridade)

        bruto_out = sum((pendente[o.id] for o in out), Decimal(0))
        bruto_in = sum((pendente[o.id] for o in entrada), Decimal(0))
        casado = min(bruto_out, bruto_in)

        alocacoes: list[Alocacao] = []
        for fila in (out, entrada):
            restante = casado
            for ordem in fila:
                if restante <= 0:
                    break
                usa = min(pendente[ordem.id], restante)
                if usa <= 0:
                    continue
                pendente[ordem.id] -= usa
                restante -= usa
                alocacoes.append(Alocacao(ordem.id, dia, usa, TipoAlocacao.CASADO))
            assert restante == 0, "casado não coube na fila do próprio lado"

        residuo = Decimal(0)
        # Percorrer na mesma prioridade do casamento, e não na ordem em que as
        # ordens entraram em `abertas`: senão a ordem das alocações REMETIDO na
        # tupla depende da ordem de entrada do cenário, e duas execuções com a
        # mesma seed divergem em silêncio.
        for ordem in sorted(abertas, key=_prioridade):
            # o fim do horizonte drena o que sobrou: sem isso, uma ordem com
            # dia_limite além do horizonte sumiria e a conservação quebraria.
            venceu = ordem.dia_limite <= dia or fim_do_horizonte
            if pendente[ordem.id] > 0 and venceu:
                alocacoes.append(
                    Alocacao(ordem.id, dia, pendente[ordem.id], TipoAlocacao.REMETIDO)
                )
                residuo += pendente[ordem.id]
                pendente[ordem.id] = Decimal(0)
            if pendente[ordem.id] == 0:
                abertas.remove(ordem)

        # Depois do casamento, um dos lados está zerado por construção — o resíduo
        # é sempre de um lado só, então a direção continua bem definida.
        direcao_residuo = Direcao.OUT if bruto_out >= bruto_in else Direcao.IN

        assert casado <= bruto_out and casado <= bruto_in

        ciclos.append(
            Ciclo(
                dia=dia,
                alocacoes=tuple(alocacoes),
                bruto_out=bruto_out,
                bruto_in=bruto_in,
                casado=casado,
                residuo=residuo,
                direcao_residuo=direcao_residuo,
            )
        )
        dia_ultimo_fechamento = dia

    assert not abertas, "sobraram ordens abertas ao fim do horizonte"

    alocado: dict[str, Decimal] = {}
    for ciclo in ciclos:
        for alocacao in ciclo.alocacoes:
            alocado[alocacao.ordem_id] = (
                alocado.get(alocacao.ordem_id, Decimal(0)) + alocacao.valor_brl
            )
    for ordem in cenario.ordens:
        assert alocado.get(ordem.id, Decimal(0)) == ordem.valor_brl, (
            f"conservacao violada em {ordem.id}: alocado != valor_brl"
        )

    return tuple(ciclos)
