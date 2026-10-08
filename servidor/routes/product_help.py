"""Endpoint autenticado do catálogo versionado de ajuda."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from servidor.auth import AuthenticatedUser, require_user
from servidor.catalogs.product_help import ProductHelpCatalogV1

router = APIRouter(prefix="/api/v1/catalogos")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]


@router.get("/ajuda", response_model=ProductHelpCatalogV1)
def product_help_catalog(request: Request, _: CurrentUser) -> ProductHelpCatalogV1:
    return request.app.state.product_help_catalog
