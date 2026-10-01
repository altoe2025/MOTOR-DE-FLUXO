"""Documentos de Replay gerados pelo motor real, usados pelo front para conferir a cena.

Regerar: ``python -m tests.web_api.fixture_replay_fidelidade``. O teste
``test_fixture_do_front_continua_igual_ao_motor`` falha se o arquivo ficar para trás.
"""

from __future__ import annotations

import json
from pathlib import Path

from servidor.replay import construir_replay
from tests.web_api.test_replay import replay_request
from tests.web_api.test_replay_fidelidade_motor import cenario_aleatorio

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "web" / "src" / "replay" / "fixtures" / "replay-motor-fidelity.v1.json"
# Escolhidas para cobrir, juntas: autonetting, multilateral, remessa OUT e IN,
# parciais, vários cartões por dia e período natural com aquecimento.
SEEDS = (3, 7, 12, 30)


def documentos() -> list[dict[str, object]]:
    items = []
    for seed in SEEDS:
        document = construir_replay(replay_request(cenario_aleatorio(seed))).model_dump(mode="json")
        # A identidade do resultado inclui o horário da execução; o conteúdo, não.
        document["result_fingerprint"] = "f" * 64
        # A versão depende de o pacote estar instalado (a CI instala; o ambiente local
        # pode não instalar); ela não descreve o que a cena mostra.
        document["motor_version"] = "fixture+" + "a" * 40
        items.append({"seed": seed, "document": document})
    return items


def conteudo() -> str:
    return json.dumps(documentos(), ensure_ascii=False, indent=1, sort_keys=True) + "\n"


if __name__ == "__main__":
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(conteudo(), encoding="utf-8")
    print(f"escrito {FIXTURE}")
