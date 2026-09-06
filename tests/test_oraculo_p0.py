"""Oráculo diferencial: `executar_p0` contra uma reimplementação independente.

Os demais testes de netting conferem valores previstos à mão, cenário a cenário. São
precisos, mas só cobrem os casos que alguém pensou em escrever. Este arquivo cobre o
complemento: gera carteiras heterogêneas ao acaso (com seed fixa) e exige que o motor
concorde **exatamente** com uma segunda implementação da mesma política, escrita aqui
de forma independente — outra estrutura de dados, outra contabilidade, sem `Alocacao`
nem `Ciclo`.

Vale a pena porque foi exatamente essa comparação que revelou o bug de semântica de
remessa do MOT-11 (o P0 remetia o lote inteiro quando qualquer ordem vencia, custando
~33 pontos de netabilidade). É o script `diagnostico_semantica.py` — que era avulso e
não versionado — convertido em regressão permanente.

## O detalhe de política que este oráculo fixou

Escrever a sombra expôs uma sutileza do P0 que não estava escrita em lugar nenhum:
**uma ordem totalmente coberta sai do lote na hora**, e portanto o vencimento dela
NÃO dispara fechamento. Sem isso a sombra fechava lotes a mais e netava até 1,7 pp
menos que o motor — casar cedo demais gasta contraparte escassa com ordem que ainda
tinha folga, o mesmo motivo pelo qual o P1 guloso é dominado. O motor sempre esteve
certo; era a sombra que descrevia outra política. Com a regra correta a concordância
é exata, e é isso que este arquivo passa a proteger.
"""

from decimal import Decimal
import random

from motor.dominio import Cenario, Direcao, Ordem, ParametrosCusto
from motor.netting import executar_p0

HORIZONTE = 180
N_CLIENTES = 8
JANELA = 5
SEEDS = tuple(range(1, 13))

# Heterogêneos no buffer de propósito: é com prazos desiguais que a ordem de cobertura
# passa a importar, e onde uma divergência de política apareceria.
_ARQUETIPOS = (
    # nome,              p_out, ordens/mês, buffer_min, buffer_max, ticket
    ("remessa_outbound", 0.90, 40, 3, 7, 15_000),
    ("psp_inbound", 0.30, 6, 20, 30, 500_000),
    ("cripto_d0", 0.70, 15, 0, 1, 200_000),
    ("exportador", 0.10, 3, 15, 30, 1_200_000),
)

_CUSTO = ParametrosCusto(
    iof_out=Decimal("0.035"),
    iof_in=Decimal("0.0038"),
    carry_cnr=Decimal("0.0004"),
    spread_rail_bps=Decimal("0"),
    custo_fixo_remessa=Decimal("0"),
    custo_oportunidade_aa=Decimal("0"),
    ptax=Decimal("5.40"),
)


def _gerar_ordens(seed: int) -> tuple[Ordem, ...]:
    """Gerador local com `random.Random(seed)`, independente de `motor.geracao`.

    Independente de propósito: se o oráculo usasse a Camada A, um defeito na geração
    apareceria dos dois lados da comparação e se cancelaria.
    """
    rng = random.Random(seed)
    ordens: list[Ordem] = []
    for indice_cliente in range(N_CLIENTES):
        nome, p_out, cadencia, buffer_min, buffer_max, ticket = _ARQUETIPOS[
            indice_cliente % len(_ARQUETIPOS)
        ]
        quantidade = max(1, int(rng.gauss(cadencia * HORIZONTE / 30, 2)))
        for _ in range(quantidade):
            dia_conhecida = rng.randrange(HORIZONTE)
            # Preso ao horizonte: ordem que vence depois dele é drenada no último dia
            # (ver "Limitações conhecidas" no AGENTS.md), e esse efeito de borda não é
            # o que este teste mede.
            dia_limite = min(
                dia_conhecida + rng.randint(buffer_min, buffer_max), HORIZONTE - 1
            )
            valor = Decimal(str(round(rng.lognormvariate(0, 0.6) * ticket, 2)))
            ordens.append(
                Ordem(
                    id=f"c{indice_cliente}-{nome}-{len(ordens):05d}",
                    cliente_id=f"c{indice_cliente}",
                    direcao=Direcao.OUT if rng.random() < p_out else Direcao.IN,
                    valor_brl=valor,
                    dia_conhecida=dia_conhecida,
                    dia_limite=dia_limite,
                    eh_efx=True,
                    finalidade="ORACULO",
                )
            )
    return tuple(ordens)


def _gerar_ordens_esparsas(seed: int) -> tuple[Ordem, ...]:
    """Poucas ordens, buffers longos — o regime em que a JANELA decide o fechamento.

    Existe porque na carteira densa acima alguma ordem vence quase todo dia, então
    `vence_hoje` dispara antes da janela e o gatilho de janela nunca é exercitado.
    (É o mesmo motivo pelo qual o eixo W da varredura sai degenerado.) Sem este regime,
    trocar `>=` por `>` no gatilho de janela do motor passava despercebido.
    """
    rng = random.Random(1000 + seed)
    ordens: list[Ordem] = []
    for indice_cliente in range(3):
        for _ in range(rng.randint(4, 7)):
            dia_conhecida = rng.randrange(HORIZONTE - 40)
            dia_limite = min(dia_conhecida + rng.randint(25, 38), HORIZONTE - 1)
            ordens.append(
                Ordem(
                    id=f"e{indice_cliente}-{len(ordens):04d}",
                    cliente_id=f"e{indice_cliente}",
                    direcao=Direcao.OUT if rng.random() < 0.5 else Direcao.IN,
                    valor_brl=Decimal(str(round(rng.lognormvariate(0, 0.6) * 100_000, 2))),
                    dia_conhecida=dia_conhecida,
                    dia_limite=dia_limite,
                    eh_efx=True,
                    finalidade="ORACULO",
                )
            )
    return tuple(ordens)


# Uma alocação, no formato mínimo que as duas implementações conseguem produzir:
# (ordem_id, dia, valor, "CASADO"|"REMETIDO").
Linha = tuple[str, int, Decimal, str]


def _sombra(ordens: tuple[Ordem, ...], *, remete_lote_inteiro: bool = False) -> list[Linha]:
    """Reimplementação independente do P0. Devolve a linha do tempo de alocações.

    Devolve alocações, e não só o volume casado, de propósito: o volume total é
    `min(soma_out, soma_in)`, que não depende de QUEM foi coberto nem de QUANDO. Um
    oráculo que comparasse só o total seria cego justamente às duas coisas que este
    motor promete — prioridade EDF e o dia em que o resíduo sai.

    Com `remete_lote_inteiro=True` reproduz a semântica ANTIGA, anterior ao MOT-11: o
    vencimento de uma ordem qualquer arrastava o lote inteiro para a remessa. Serve só
    para provar que este oráculo tem sensibilidade — ver o segundo teste.
    """
    pendente = {o.id: o.valor_brl for o in ordens}
    linhas: list[Linha] = []
    por_chegada = sorted(ordens, key=lambda o: o.dia_conhecida)
    proxima = 0
    abertas: list[Ordem] = []
    dia_ultimo_fechamento = -1

    for dia in range(HORIZONTE + 1):
        while proxima < len(por_chegada) and por_chegada[proxima].dia_conhecida == dia:
            abertas.append(por_chegada[proxima])
            proxima += 1

        vence_hoje = any(o.dia_limite == dia for o in abertas)
        janela_completa = (dia - dia_ultimo_fechamento) >= JANELA
        fim_do_horizonte = dia == HORIZONTE

        if not abertas or not (vence_hoje or janela_completa or fim_do_horizonte):
            continue

        edf = lambda o: (o.dia_limite, o.id)  # noqa: E731 - EDF, desempate por id
        out = sorted((o for o in abertas if o.direcao is Direcao.OUT), key=edf)
        entrada = sorted((o for o in abertas if o.direcao is Direcao.IN), key=edf)
        casado = min(
            sum((pendente[o.id] for o in out), Decimal(0)),
            sum((pendente[o.id] for o in entrada), Decimal(0)),
        )

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
                linhas.append((ordem.id, dia, usa, "CASADO"))

        sobrevivem = []
        for ordem in abertas:
            venceu = ordem.dia_limite <= dia or fim_do_horizonte or remete_lote_inteiro
            if pendente[ordem.id] > 0 and venceu:
                linhas.append((ordem.id, dia, pendente[ordem.id], "REMETIDO"))
                pendente[ordem.id] = Decimal(0)
            if pendente[ordem.id] > 0:
                sobrevivem.append(ordem)
        abertas = sobrevivem

        dia_ultimo_fechamento = dia

    return linhas


def _do_motor(ordens: tuple[Ordem, ...]) -> list[Linha]:
    cenario = Cenario(
        ordens=ordens, janela_dias=JANELA, horizonte_dias=HORIZONTE, custo=_CUSTO
    )
    return [
        (a.ordem_id, a.dia, a.valor_brl, a.tipo.value)
        for ciclo in executar_p0(cenario)
        for a in ciclo.alocacoes
    ]


def _casado(linhas: list[Linha]) -> Decimal:
    return sum((valor for _, _, valor, tipo in linhas if tipo == "CASADO"), Decimal(0)) * 2


def _netabilidade(casado: Decimal, ordens: tuple[Ordem, ...]) -> Decimal:
    return casado / sum((o.valor_brl for o in ordens), Decimal(0)) * 100


def test_p0_real_concorda_exatamente_com_uma_reimplementacao_independente():
    """Motor e sombra têm que produzir a MESMA linha do tempo de alocações.

    Não é só o volume: quem foi coberto, com quanto e em que dia. Falha se
    `executar_p0` mudar de comportamento sem que a sombra mude junto — o caso de
    alguém "otimizar" a política sem perceber que mudou a semântica. A igualdade é
    exata: qualquer folga aqui seria espaço para um defeito se esconder.
    """
    for regime, gerar in (("densa", _gerar_ordens), ("esparsa", _gerar_ordens_esparsas)):
        for seed in SEEDS:
            ordens = gerar(seed)

            do_motor = sorted(_do_motor(ordens))
            da_sombra = sorted(_sombra(ordens))

            assert do_motor == da_sombra, (
                f"carteira {regime}, seed {seed}: as alocações divergem. "
                f"Só no motor: {sorted(set(do_motor) - set(da_sombra))[:3]} | "
                f"só na sombra: {sorted(set(da_sombra) - set(do_motor))[:3]}"
            )


def test_o_oraculo_detectaria_a_semantica_antiga_de_remessa():
    """Prova que o teste acima tem dentes.

    Um oráculo diferencial que concorda com tudo não testa nada. Aqui a sombra roda com
    a semântica anterior ao MOT-11 (vencimento de uma ordem arrasta o lote inteiro), e o
    motor tem que divergir dela de forma gritante. Se algum dia esta diferença encolher,
    ou o motor regrediu para a semântica antiga, ou o gerador deixou de produzir
    carteiras com prazos heterogêneos — e o teste de cima virou decoração.
    """
    divergencias = []
    for seed in SEEDS:
        ordens = _gerar_ordens(seed)

        do_motor = _netabilidade(_casado(_do_motor(ordens)), ordens)
        com_bug = _netabilidade(_casado(_sombra(ordens, remete_lote_inteiro=True)), ordens)
        divergencias.append(do_motor - com_bug)

    media = sum(divergencias) / len(divergencias)
    assert media > 10, (
        f"a semântica antiga só divergiu {media:.2f} pp do motor — era ~33 pp quando o "
        f"bug foi encontrado. O oráculo perdeu sensibilidade."
    )
