"""Exportação determinística do contrato HTTP, sem settings ou rede."""

from __future__ import annotations

import json
from pathlib import Path

from servidor.app import create_schema_app


def export_openapi(path: str | Path = "contracts/openapi.json") -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(
        create_schema_app().openapi(),
        ensure_ascii=False,
        sort_keys=True,
        indent=2,
        allow_nan=False,
    )
    destination.write_text(serialized + "\n", encoding="utf-8")


if __name__ == "__main__":
    export_openapi()
