"""Entrada operacional do servidor de origem única."""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass

import uvicorn


@dataclass(frozen=True)
class ServerOptions:
    host: str
    port: int


def parse_server_options(environ: Mapping[str, str]) -> ServerOptions:
    """Valida somente o ambiente recebido, sem ler estado nem iniciar o servidor."""
    app_env = environ.get("APP_ENV", "development")
    if app_env not in {"development", "test", "production"}:
        raise ValueError("APP_ENV deve ser development, test ou production")
    host = environ.get("HOST", "0.0.0.0" if app_env == "production" else "127.0.0.1")
    if not host or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in host):
        raise ValueError("HOST deve ser um endereço não vazio e sem espaços")
    raw_port = environ.get("PORT", "8000")
    if re.fullmatch(r"[0-9]{1,5}", raw_port) is None:
        raise ValueError("PORT deve ser um inteiro entre 1 e 65535")
    port = int(raw_port)
    if not 1 <= port <= 65535:
        raise ValueError("PORT deve ser um inteiro entre 1 e 65535")
    return ServerOptions(host=host, port=port)


def main() -> None:
    options = parse_server_options(os.environ)
    uvicorn.run(
        "servidor.app:create_app",
        factory=True,
        host=options.host,
        port=options.port,
        workers=1,
        access_log=False,
    )


if __name__ == "__main__":
    main()
