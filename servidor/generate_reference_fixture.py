"""Gera a entrada de referência versionada diretamente do YAML do motor."""

from __future__ import annotations

import copy
import json
from importlib.resources import files
from pathlib import Path

import yaml


def _origin_paths(value: object, pointer: str = ""):
    if isinstance(value, dict):
        for key, child in value.items():
            escaped = key.replace("~", "~0").replace("/", "~1")
            yield from _origin_paths(child, f"{pointer}/{escaped}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _origin_paths(child, f"{pointer}/{index}")
    elif pointer.rsplit("/", 1)[-1] not in {"id", "cliente_id", "direcao"}:
        yield pointer


def build_reference_request() -> dict[str, object]:
    relative_source = "motor/cenarios/exemplo_amanda.yaml"
    source = files("motor").joinpath("cenarios", "exemplo_amanda.yaml")
    scenario = yaml.safe_load(source.read_text(encoding="utf-8"))
    scenario["custo"]["iof_por_finalidade"] = []
    origin = {
        "tipo": "PADRAO_SINTETICO",
        "fonte": relative_source,
        "registrado_em_utc": "2026-09-11T00:00:00Z",
    }
    return {
        "api_version": "1.0.0",
        "request_id": "00000000-0000-4000-8000-000000000001",
        "study_id": "00000000-0000-4000-8000-000000000002",
        "scenario_id": "00000000-0000-4000-8000-000000000003",
        "scenario_revision": 1,
        "cenario": scenario,
        "periodo": {"modo": "LEGADO"},
        "proveniencia": {
            path: copy.deepcopy(origin) for path in _origin_paths(scenario)
        },
    }


def generate_reference_fixture(
    destination: str | Path = "contracts/fixtures/reference-request.json",
) -> None:
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            build_reference_request(), ensure_ascii=False, sort_keys=True, indent=2
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    generate_reference_fixture()
