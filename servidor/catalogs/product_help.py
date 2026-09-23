"""Carregamento estrito do catálogo versionado de ajuda do produto."""

from __future__ import annotations

import hashlib
import json
from importlib.resources import files
from pathlib import Path
from typing import Annotated, Any, Literal, Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from servidor.contracts.primitives import StrictModel

_HELP_ID = r"^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$"
_ROUTE_PATTERN = r"^/[A-Za-z0-9_:/?&=.-]*$"
_TEXT = Annotated[str, Field(strict=True, min_length=1, max_length=2_000)]
_HELP_IDS = Annotated[tuple[str, ...], Field(max_length=40)]


class ProductHelpItem(StrictModel):
    """Explicação contextual fechada, independente de conteúdo visual da página."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    id: Annotated[str, Field(pattern=_HELP_ID, min_length=3, max_length=120)]
    routePattern: Annotated[str, Field(pattern=_ROUTE_PATTERN, min_length=1, max_length=300)]
    elementKind: Literal["PAGE", "SECTION", "CONTROL", "METRIC", "MESSAGE"]
    label: Annotated[str, Field(strict=True, min_length=1, max_length=200)]
    purpose: _TEXT
    changes: _TEXT
    doesNotChange: _TEXT
    disabledWhen: Annotated[tuple[str, ...], Field(max_length=30)]
    recovery: Annotated[tuple[str, ...], Field(max_length=30)]
    relatedConceptIds: _HELP_IDS

    @field_validator("disabledWhen", "recovery", "relatedConceptIds")
    @classmethod
    def values_are_unique_and_nonempty(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(not item.strip() for item in value):
            raise ValueError("listas do catálogo não aceitam texto vazio")
        if len(value) != len(set(value)):
            raise ValueError("listas do catálogo não aceitam valores repetidos")
        return value


class ProductHelpCatalogV1(StrictModel):
    """Documento imutável servido ao chat e à ajuda contextual."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    apiVersion: Literal["1.0.0"]
    catalogVersion: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    items: Annotated[tuple[ProductHelpItem, ...], Field(min_length=1, max_length=200)]

    @model_validator(mode="after")
    def validate_references(self) -> Self:
        ids = [item.id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("ids de ajuda repetidos")
        known = set(ids)
        unknown = {
            related
            for item in self.items
            for related in item.relatedConceptIds
            if related not in known
        }
        if unknown:
            raise ValueError(f"conceitos relacionados ausentes: {sorted(unknown)!r}")
        return self


def canonical_catalog_bytes(document: dict[str, Any]) -> bytes:
    """Serializa o recurso sem espaços para a versão auditável."""
    return json.dumps(
        document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _read_catalog(path: Path | None) -> dict[str, Any]:
    content = (
        files("servidor.catalogs").joinpath("product_help.v1.json").read_text(
            encoding="utf-8"
        )
        if path is None
        else path.read_text(encoding="utf-8")
    )
    document = json.loads(content)
    if not isinstance(document, dict):
        raise TypeError("catálogo de ajuda deve ser um objeto JSON")
    return document


def _immutable_catalog_input(document: dict[str, Any]) -> dict[str, Any]:
    """Converte as listas JSON em tuplas antes da fronteira imutável do contrato."""
    items = document.get("items", ())
    immutable_items = tuple(
        {
            **item,
            "disabledWhen": tuple(item.get("disabledWhen", ())),
            "recovery": tuple(item.get("recovery", ())),
            "relatedConceptIds": tuple(item.get("relatedConceptIds", ())),
        }
        if isinstance(item, dict)
        else item
        for item in items
    ) if isinstance(items, list) else items
    return {**document, "items": immutable_items}


def load_product_help_catalog(path: Path | None = None) -> ProductHelpCatalogV1:
    """Lê e valida o recurso antes de aceitar tráfego HTTP."""
    document = _read_catalog(path)
    if "catalogVersion" in document:
        raise ValueError("catalogVersion deve ser calculado pelo loader")
    version = hashlib.sha256(canonical_catalog_bytes(document)).hexdigest()
    return ProductHelpCatalogV1.model_validate(
        {**_immutable_catalog_input(document), "catalogVersion": version}
    )
