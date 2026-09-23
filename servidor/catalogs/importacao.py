"""Carregamento determinístico do catálogo técnico de importação."""

from __future__ import annotations

import hashlib
import json
from importlib.resources import files
from pathlib import Path
from typing import Any

from servidor.contracts.importation import CatalogoImportacao


def canonical_catalog_bytes(document: dict[str, Any]) -> bytes:
    """Serializa o documento sem espaços para a versão auditável do catálogo."""
    return json.dumps(
        document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _read_catalog(path: Path | None) -> dict[str, Any]:
    if path is None:
        content = files("servidor.catalogs").joinpath("importacao.v1.json").read_text(
            encoding="utf-8"
        )
    else:
        content = path.read_text(encoding="utf-8")
    document = json.loads(content)
    if not isinstance(document, dict):
        raise TypeError("catálogo de importação deve ser um objeto JSON")
    return document


def load_import_catalog(path: Path | None = None) -> CatalogoImportacao:
    """Lê, versiona e valida o recurso publicado antes de atender requisições."""
    document = _read_catalog(path)
    if "catalog_version" in document:
        raise ValueError("catalog_version deve ser calculado pelo loader")
    catalog_version = hashlib.sha256(canonical_catalog_bytes(document)).hexdigest()
    return CatalogoImportacao.model_validate({**document, "catalog_version": catalog_version})
