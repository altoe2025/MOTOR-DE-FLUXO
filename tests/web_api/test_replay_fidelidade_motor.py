"""O Replay conta a mesma história que o motor: conferência independente, dia a dia.

Cada cenário é executado duas vezes: pelo caminho real do diagnóstico (que gera o
documento do Replay) e direto por ``executar_p0``. O teste reconstrói do zero os
saldos, gatilhos e alocações a partir do motor e exige que o documento bata em tudo.
"""

from __future__ import annotations

import random
from collections import defaultdict
from decimal import Decimal

import pytest

from motor.analise import ConfiguracaoTemporal, preparar_execucao_temporal
from motor.dominio import Cenario, Direcao
from motor.netting import executar_p0
from servidor.contracts.input import PeriodoNatural
from servidor.contracts.replay import ReplayDocumentV1, ReplayRequestV1
from servidor.motor_adapter import construir_cenario
from servidor.replay import construir_replay
from tests.web_api.test_replay import order, payload_with_orders, replay_request


def cenario_aleatorio(seed: int) -> dict[str, object]:
    """Poucos clientes para forçar autonetting; prazos curtos e longos; centavos."""
    rng = random.Random(seed)
    horizon = rng.randint(4, 18)
    clients = [f"c{index}" for index in range(rng.randint(1, 4))]
    natural = seed % 3 == 0
    orders = []
    for index in range(rng.randint(2, 22)):
        known = rng.randint(0, horizon - 1 if natural else horizon)
        orders.append(order(
            f"o{index:02d}",
            rng.choice(clients),
            rng.choice(("OUT", "IN")),
            f"{rng.randint(1, 900_000) / 100:.2f}",
            known,
            known + rng.randint(0, 7),
        ))
    payload = payload_with_orders(orders, horizon=horizon, window=rng.randint(1, 5))
    if natural:
        # O período natural precisa conter todas as chegadas e caber no horizonte.
        warmup = rng.randint(0, min(3, horizon - 1))
        payload["periodo"] = {"modo": "NATURAL", "dias_aquecimento": warmup, "periodo_medicao_dias": horizon - warmup}
    return payload


def cenario_executado(request: ReplayRequestV1) -> Cenario:
    snapshot = request.diagnostic_envelope.selected_execution.input_snapshot
    scenario = construir_cenario(snapshot.cenario)
    if isinstance(snapshot.periodo, PeriodoNatural):
        return preparar_execucao_temporal(
            scenario,
            ConfiguracaoTemporal(snapshot.periodo.dias_aquecimento, snapshot.periodo.periodo_medicao_dias),
        ).cenario
    return scenario


def conferir_contra_motor(document: ReplayDocumentV1, scenario: Cenario) -> dict[str, int]:
    cycles = {cycle.dia: cycle for cycle in executar_p0(scenario)}
    orders = {item.id: item for item in scenario.ordens}
    pending = {item.id: item.valor_brl for item in scenario.ordens}
    allocated: dict[str, Decimal] = defaultdict(Decimal)
    open_ids: set[str] = set()
    last_closing = -1
    seen = defaultdict(int)

    assert document.period.settlement_end_day == scenario.horizonte_dias
    assert [day.day for day in document.days] == list(range(scenario.horizonte_dias + 1))
    assert {day.day for day in document.days if day.closing is not None} == set(cycles)

    for day in document.days:
        arrivals = sorted(item.id for item in scenario.ordens if item.dia_conhecida == day.day)
        assert sorted(event.order_id for event in day.events if event.kind == "ORDER_ARRIVED") == arrivals
        open_ids |= set(arrivals)
        window = day.day - last_closing >= scenario.janela_dias
        deadline = any(orders[order_id].dia_limite == day.day for order_id in open_ids)
        horizon = day.day == scenario.horizonte_dias
        cycle = cycles.get(day.day)

        if cycle is None:
            # O motor só pula o dia quando a regra P0 manda pular.
            assert not open_ids or not (window or deadline or horizon), f"dia {day.day}"
            assert not [event for event in day.events if event.kind == "ALLOCATION"]
        else:
            closing = day.closing
            assert closing is not None
            expected = [name for name, hit in (("WINDOW", window), ("DEADLINE", deadline), ("HORIZON_END", horizon)) if hit]
            assert list(closing.triggers) == expected, f"gatilhos do dia {day.day}"
            last_closing = day.day
            assert closing.gross_out_brl == sum((pending[i] for i in open_ids if orders[i].direcao is Direcao.OUT), Decimal(0))
            assert closing.gross_in_brl == sum((pending[i] for i in open_ids if orders[i].direcao is Direcao.IN), Decimal(0))
            assert closing.matched_position_brl == cycle.casado

            motor_allocations: dict[tuple[str, str, str | None], Decimal] = defaultdict(Decimal)
            for allocation in cycle.alocacoes:
                origin = None if allocation.origem_casamento is None else allocation.origem_casamento.value
                motor_allocations[(allocation.ordem_id, allocation.tipo.value, origin)] += allocation.valor_brl
            replay_allocations: dict[tuple[str, str, str | None], Decimal] = defaultdict(Decimal)
            for event in day.events:
                if event.kind != "ALLOCATION":
                    continue
                assert event.direction == orders[event.order_id].direcao.value
                replay_allocations[(event.order_id, event.allocation_type, event.matching_origin)] += event.value_brl
            assert dict(replay_allocations) == dict(motor_allocations), f"alocações do dia {day.day}"

            # Setas: cada ordem recebe nas setas exatamente o que casou, na mesma origem.
            by_arrow: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
            for segment in closing.flow_segments:
                assert orders[segment.out_order_id].direcao is Direcao.OUT
                assert orders[segment.in_order_id].direcao is Direcao.IN
                same_client = orders[segment.out_order_id].cliente_id == orders[segment.in_order_id].cliente_id
                assert same_client == (segment.matching_origin == "INTRA_CLIENTE")
                by_arrow[(segment.out_order_id, segment.matching_origin)] += segment.value_brl
                by_arrow[(segment.in_order_id, segment.matching_origin)] += segment.value_brl
                seen[segment.matching_origin] += 1
            matched = {(key[0], key[2]): value for key, value in motor_allocations.items() if key[1] == "CASADO"}
            assert dict(by_arrow) == matched, f"setas do dia {day.day}"

            for (order_id, kind, _), value in motor_allocations.items():
                pending[order_id] -= value
                allocated[order_id] += value
                if kind == "REMETIDO":
                    seen[f"REMETIDO_{orders[order_id].direcao.value}"] += 1
                assert pending[order_id] >= 0
            open_ids = {order_id for order_id in open_ids if pending[order_id] > 0}

        assert day.end_state.open_out_brl == sum((pending[i] for i in open_ids if orders[i].direcao is Direcao.OUT), Decimal(0))
        assert day.end_state.open_in_brl == sum((pending[i] for i in open_ids if orders[i].direcao is Direcao.IN), Decimal(0))

    # Conservação: toda ordem termina inteira, casada ou remetida.
    assert not open_ids
    for item in scenario.ordens:
        assert allocated[item.id] == item.valor_brl, item.id
    return dict(seen)


SEEDS = range(120)

# Defeito conhecido da análise do motor: motor/analise/modelo.py exige igualdade exata entre
# taxa_autonetting + taxa_multilateral e a netabilidade, mas as três são divisões Decimal
# arredondadas; em alguns valores diferem na 28ª casa e o diagnóstico é recusado.
TAXAS_ARREDONDADAS = "taxas por mecanismo não reconciliam com netabilidade"
DEFEITOS_CONHECIDOS = (TAXAS_ARREDONDADAS,)


def replay_do_cenario(seed: int) -> ReplayRequestV1:
    try:
        return replay_request(cenario_aleatorio(seed))
    except ValueError as error:
        known = next((item for item in DEFEITOS_CONHECIDOS if item in str(error)), None)
        if known is not None:
            pytest.xfail(f"diagnóstico recusa o cenário: {known}")
        raise


@pytest.mark.parametrize("seed", SEEDS)
def test_replay_bate_com_execucao_independente_do_motor(seed: int) -> None:
    request = replay_do_cenario(seed)
    conferir_contra_motor(construir_replay(request), cenario_executado(request))


def test_amostra_aleatoria_exercita_todos_os_caminhos_da_cena() -> None:
    """Sem isso, a bateria acima poderia passar sem nunca ver autonetting ou remessa IN."""
    total: dict[str, int] = defaultdict(int)
    for seed in SEEDS:
        try:
            request = replay_request(cenario_aleatorio(seed))
        except ValueError as error:
            if any(item in str(error) for item in DEFEITOS_CONHECIDOS):
                continue
            raise
        for key, count in conferir_contra_motor(construir_replay(request), cenario_executado(request)).items():
            total[key] += count
    for key in ("INTRA_CLIENTE", "INTER_CLIENTE", "REMETIDO_OUT", "REMETIDO_IN"):
        assert total[key] >= 20, (key, dict(total))


def test_cenario_de_referencia_bate_com_o_motor() -> None:
    request = replay_request()
    conferir_contra_motor(construir_replay(request), cenario_executado(request))


def test_fixture_do_front_continua_igual_ao_motor() -> None:
    from tests.web_api.fixture_replay_fidelidade import FIXTURE, conteudo

    assert FIXTURE.read_text(encoding="utf-8") == conteudo(), (
        "regerar com: python -m tests.web_api.fixture_replay_fidelidade"
    )
