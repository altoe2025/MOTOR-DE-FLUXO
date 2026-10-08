"""Endpoint autenticado do catálogo técnico de importação."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from servidor.auth import AuthenticatedUser, require_user
from servidor.contracts.importation import CatalogoImportacao

router = APIRouter(prefix="/api/v1/catalogos")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]


@router.get("/importacao", response_model=CatalogoImportacao)
def import_catalog(request: Request, _: CurrentUser) -> CatalogoImportacao:
    return request.app.state.import_catalog
