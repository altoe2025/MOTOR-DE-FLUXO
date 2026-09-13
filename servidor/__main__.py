"""Entrada operacional do servidor de origem única."""

import uvicorn


def main() -> None:
    uvicorn.run(
        "servidor.app:create_app",
        factory=True,
        host="127.0.0.1",
        port=8000,
        workers=1,
        access_log=False,
    )


if __name__ == "__main__":
    main()
