"""Rotas HTTP versionadas expostas pela aplicação."""

from servidor.routes import diagnostics, examples, preparation, preview, replay, session

__all__ = ["diagnostics", "examples", "preparation", "preview", "replay", "session"]
