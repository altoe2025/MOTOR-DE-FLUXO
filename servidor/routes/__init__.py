"""Rotas HTTP versionadas expostas pela aplicação."""

from servidor.routes import (
    diagnostics,
    examples,
    importation,
    preparation,
    preview,
    replay,
    session,
)

__all__ = ["diagnostics", "examples", "importation", "preparation", "preview", "replay", "session"]
