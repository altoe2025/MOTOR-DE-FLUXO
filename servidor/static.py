"""Distribuição segura do build React na mesma origem da API."""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from servidor.errors import ApiFailure

_SPA_PATHS = {
    "",
    "login",
    "auth/callback",
    "auth/definir-senha",
    "carteira",
    "diagnostico",
    "comparar",
    "replay",
    "premissas",
    "estudos",
}
_LEGACY_HASHED_ASSET = re.compile(r"\.[0-9a-fA-F]{8,}\.")
_STUDY_PATH = re.compile(
    r"estudos/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def _not_found() -> ApiFailure:
    return ApiFailure(404, "RECURSO_NAO_ENCONTRADO", "Recurso não encontrado.")


def _vite_manifest_assets(dist: Path | None) -> frozenset[str]:
    if dist is None:
        return frozenset()
    manifest = (dist / ".vite" / "manifest.json").resolve()
    if not manifest.is_relative_to(dist) or not manifest.is_file():
        return frozenset()
    try:
        document = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return frozenset()
    if not isinstance(document, dict):
        return frozenset()
    paths: set[str] = set()
    for entry in document.values():
        if not isinstance(entry, dict):
            continue
        file = entry.get("file")
        if isinstance(file, str):
            paths.add(file)
        for field in ("css", "assets"):
            values = entry.get(field)
            if isinstance(values, list):
                paths.update(value for value in values if isinstance(value, str))
    return frozenset(paths)


def install_static_routes(app: FastAPI, dist_dir: Path | None) -> None:
    dist = dist_dir.resolve() if dist_dir is not None else None
    assets = (dist / "assets").resolve() if dist is not None else None
    if dist is not None and assets is not None and not assets.is_relative_to(dist):
        assets = None
    manifest_assets = _vite_manifest_assets(dist)

    @app.get("/assets/{asset_path:path}", include_in_schema=False)
    async def static_asset(asset_path: str) -> FileResponse:
        if assets is None:
            raise _not_found()
        candidate = (assets / asset_path).resolve()
        if not candidate.is_relative_to(assets) or not candidate.is_file():
            raise _not_found()
        relative = candidate.relative_to(dist).as_posix() if dist is not None else ""
        immutable = (
            relative in manifest_assets
            or _LEGACY_HASHED_ASSET.search(candidate.name) is not None
        )
        cache = "public, max-age=31536000, immutable" if immutable else "no-cache"
        return FileResponse(candidate, headers={"Cache-Control": cache})

    @app.get("/{spa_path:path}", include_in_schema=False)
    async def spa_fallback(spa_path: str) -> FileResponse:
        if (spa_path not in _SPA_PATHS and _STUDY_PATH.fullmatch(spa_path) is None) or dist is None:
            raise _not_found()
        index = (dist / "index.html").resolve()
        if not index.is_relative_to(dist) or not index.is_file():
            raise _not_found()
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
