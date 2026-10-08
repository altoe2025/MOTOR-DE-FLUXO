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


def _immutable_catalog_input(document: dict[str, Any]) -> dict[str, Any]:
    """Converte somente arrays JSON do recurso para as coleções imutáveis do contrato."""
    costs = document.get("custos_padrao")
    immutable_costs = (
        {
            **costs,
            "iof_por_finalidade": tuple(costs.get("iof_por_finalidade", ())),
        }
        if isinstance(costs, dict)
        else costs
    )
    finalidades = document.get("finalidades", ())
    immutable_finalidades = tuple(
        {
            **finalidade,
            "aliquotas": tuple(finalidade.get("aliquotas", ())),
        }
        if isinstance(finalidade, dict)
        else finalidade
        for finalidade in finalidades
    ) if isinstance(finalidades, list) else finalidades
    return {
        **document,
        "finalidades": immutable_finalidades,
        "custos_padrao": immutable_costs,
    }


def load_import_catalog(path: Path | None = None) -> CatalogoImportacao:
    """Lê, versiona e valida o recurso publicado antes de atender requisições."""
    document = _read_catalog(path)
    if "catalog_version" in document:
        raise ValueError("catalog_version deve ser calculado pelo loader")
    catalog_version = hashlib.sha256(canonical_catalog_bytes(document)).hexdigest()
    return CatalogoImportacao.model_validate(
        {**_immutable_catalog_input(document), "catalog_version": catalog_version}
    )
