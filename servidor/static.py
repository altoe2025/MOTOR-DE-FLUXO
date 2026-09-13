"""Distribuição segura do build React na mesma origem da API."""

from __future__ import annotations

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
}
_HASHED_ASSET = re.compile(r"\.[0-9a-fA-F]{8,}\.")


def _not_found() -> ApiFailure:
    return ApiFailure(404, "RECURSO_NAO_ENCONTRADO", "Recurso não encontrado.")


def install_static_routes(app: FastAPI, dist_dir: Path | None) -> None:
    dist = dist_dir.resolve() if dist_dir is not None else None
    assets = (dist / "assets").resolve() if dist is not None else None
    if dist is not None and assets is not None and not assets.is_relative_to(dist):
        assets = None

    @app.get("/assets/{asset_path:path}", include_in_schema=False)
    async def static_asset(asset_path: str) -> FileResponse:
        if assets is None:
            raise _not_found()
        candidate = (assets / asset_path).resolve()
        if not candidate.is_relative_to(assets) or not candidate.is_file():
            raise _not_found()
        cache = (
            "public, max-age=31536000, immutable"
            if _HASHED_ASSET.search(candidate.name)
            else "no-cache"
        )
        return FileResponse(candidate, headers={"Cache-Control": cache})

    @app.get("/{spa_path:path}", include_in_schema=False)
    async def spa_fallback(spa_path: str) -> FileResponse:
        if spa_path not in _SPA_PATHS or dist is None:
            raise _not_found()
        index = (dist / "index.html").resolve()
        if not index.is_relative_to(dist) or not index.is_file():
            raise _not_found()
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
