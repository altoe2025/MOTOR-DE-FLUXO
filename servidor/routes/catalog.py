"""Publicação autenticada do catálogo imutável de importação."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from servidor.auth import AuthenticatedUser, require_user
from servidor.contracts.catalog import CatalogoImportacao

router = APIRouter(prefix="/api/v1/catalogos")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]


@router.get("/importacao", response_model=CatalogoImportacao)
def import_catalog(request: Request, _: CurrentUser) -> CatalogoImportacao:
    catalog: CatalogoImportacao = request.app.state.import_catalog
    return catalog
