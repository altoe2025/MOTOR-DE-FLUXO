"""Servidor local controlado para o percurso Playwright ponta a ponta."""

from __future__ import annotations

import subprocess
from pathlib import Path
from uuid import UUID

import uvicorn
from fastapi import BackgroundTasks

from servidor.app import create_app
from servidor.auth import AuthenticatedUser, SessionInvalid
from servidor.catalogs.importacao import load_import_catalog
from servidor.config import Settings

CONTROLLED_TOKEN = "mot21-controlled-e2e-token"
CONTROLLED_USER_ID = UUID("00000000-0000-4000-8000-000000000021")
CONTROLLED_TOKEN_B = "mot61-controlled-e2e-token-b"
CONTROLLED_USER_ID_B = UUID("00000000-0000-4000-8000-000000000061")
ROOT = Path(__file__).resolve().parents[2]


class ControlledVerifier:
    """Aceita somente o token sintético do build E2E local."""

    def verify(self, token: str) -> AuthenticatedUser:
        users = {
            CONTROLLED_TOKEN: CONTROLLED_USER_ID,
            CONTROLLED_TOKEN_B: CONTROLLED_USER_ID_B,
        }
        user = users.get(token)
        if user is None:
            raise SessionInvalid("token controlado inválido")
        return AuthenticatedUser(user)


def _head_sha() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def build_e2e_app():
    settings = Settings(
        app_env="test",
        supabase_url="https://e2e.invalid",
        supabase_jwt_issuer="https://e2e.invalid/auth/v1",
        supabase_allowed_user_ids=frozenset({CONTROLLED_USER_ID, CONTROLLED_USER_ID_B}),
        motor_build_sha=_head_sha(),
        web_dist_dir=ROOT / "web" / "dist",
    )
    catalog = load_import_catalog(ROOT / "web" / "e2e" / "fixtures" / "import-catalog.json")
    return create_app(settings=settings, verifier=ControlledVerifier(), import_catalog=catalog)


def main() -> None:
    app = build_e2e_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=8021, access_log=False)
    server = uvicorn.Server(config)

    @app.post("/__e2e__/shutdown", include_in_schema=False)
    def shutdown(background_tasks: BackgroundTasks) -> dict[str, str]:
        background_tasks.add_task(setattr, server, "should_exit", True)
        return {"status": "stopping"}

    server.run()


if __name__ == "__main__":
    main()
