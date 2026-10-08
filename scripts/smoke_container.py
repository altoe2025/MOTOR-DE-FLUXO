"""Local, synthetic, read-only image smoke; never deploys or calls a paid API."""

from __future__ import annotations

import argparse
import inspect
import json
import re
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4


def scan_packaged_files(roots: list[str]) -> int:
    """Scan application files only; report categories, never matched contents."""
    import re
    from pathlib import Path

    patterns = (
        r"sk-(?:proj-)?[A-Za-z0-9_-]{20,}",
        r"sb_secret_[A-Za-z0-9_-]{10,}",
        r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}",
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        r"SUPABASE_SERVICE_ROLE(?:_KEY)?\s*=\s*(?!example|placeholder|\$\{)[^\s'\"]{8,}",
        (
            r"[?&](?:access_token|refresh_token|id_token|token|apikey)="
            r"(?!example(?:[&#]|$)|placeholder(?:[&#]|$))[^&#\s'\"]{8,}"
        ),
    )
    count = 0
    for root in roots:
        directory = Path(root)
        if not directory.is_dir():
            raise RuntimeError("packaged application directory missing")
        for path in directory.rglob("*"):
            if not path.is_file():
                continue
            if (
                path.name.startswith(".env")
                or path.suffix.lower() in {".xlsx", ".csv", ".log", ".pem", ".key", ".p12", ".pfx"}
                or {"__fixtures__", "fixtures", "node_modules", ".git", "tests", "resultados"}.intersection(path.parts)
            ):
                raise RuntimeError("forbidden artifact in packaged application")
            # Credentials are ASCII; remove NUL padding to cover UTF-16 as well.
            content = path.read_bytes().replace(b"\0", b"").decode("latin-1")
            if any(re.search(pattern, content, re.IGNORECASE) for pattern in patterns):
                raise RuntimeError("credential shape in packaged application")
            count += 1
    return count


def request(base: str, path: str, *, method: str = "GET", body: bytes | None = None):
    req = Request(base + path, data=body, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        response = urlopen(req, timeout=3)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


def probe_http(base: str, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            status, _, body = request(base, "/api/v1/health")
            if status == 200 and json.loads(body).get("status") == "ok":
                break
        except (OSError, URLError, ValueError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError("health timeout")
        time.sleep(0.25)

    for path in ("/login", "/estudos/00000000-0000-4000-8000-000000000001/diagnostico"):
        status, headers, body = request(base, path)
        if status != 200 or "text/html" not in headers.get("Content-Type", ""):
            raise RuntimeError("SPA route failed")
        if headers.get("X-Content-Type-Options") != "nosniff" or not headers.get("Content-Security-Policy"):
            raise RuntimeError("security headers missing")
    assets = re.findall(rb'(?:src|href)="(/assets/[^"?#]+\.(?:js|css))"', body)
    if not assets:
        raise RuntimeError("versioned assets missing")
    for asset in assets:
        status, headers, payload = request(base, asset.decode("ascii"))
        if status != 200 or not payload or "immutable" not in headers.get("Cache-Control", ""):
            raise RuntimeError("versioned asset failed")
    for path in ("/missing-private-file", "/.env", "/assets/missing.js", "/api/v1/missing"):
        status, headers, body = request(base, path)
        if status != 404 or "application/json" not in headers.get("Content-Type", ""):
            raise RuntimeError("safe 404 failed")
        if json.loads(body).get("error", {}).get("code") != "RECURSO_NAO_ENCONTRADO":
            raise RuntimeError("404 error contract failed")
    for path, method, body in (("/api/v1/session", "GET", None), ("/api/v1/chat", "POST", b"{}")):
        status, _, _ = request(base, path, method=method, body=body)
        if status != 401:
            raise RuntimeError("anonymous access was not denied")


def smoke(image: str, *, docker: str = "docker", timeout: float = 60) -> None:
    def run(*args: str, input: str | None = None):
        return subprocess.run(
            [docker, *args], check=True, capture_output=True, text=True,
            input=input, timeout=30,
        ).stdout.strip()

    name = "motor-smoke-" + uuid4().hex
    env = {
        "APP_ENV": "production", "HOST": "0.0.0.0", "PORT": "8000",
        "CHAT_ENABLED": "false", "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_JWT_ISSUER": "https://example.supabase.co/auth/v1",
        "SUPABASE_JWT_AUDIENCE": "authenticated",
        "SUPABASE_ALLOWED_USER_IDS": "00000000-0000-4000-8000-000000000001",
        "MOTOR_BUILD_SHA": "a" * 40,
    }
    env_args = [item for key, value in env.items() for item in ("--env", f"{key}={value}")]
    container = run(
        "create", "--name", name, "--read-only", "--cap-drop=ALL",
        "--security-opt=no-new-privileges", "--publish", "127.0.0.1::8000",
        *env_args, image,
    )
    # Use only Docker's exact returned ID; never remove a pre-existing name.
    if not re.fullmatch(r"[0-9a-f]{64}", container):
        raise RuntimeError("Docker returned an invalid container id")
    try:
        run("start", container)
        address = run("port", container, "8000/tcp")
        if not re.fullmatch(r"127\.0\.0\.1:[0-9]{1,5}", address):
            raise RuntimeError("unexpected local port binding")
        probe_http("http://" + address, timeout)
        image_probe = inspect.getsource(scan_packaged_files) + "\n" + '''
import importlib.metadata
import importlib.util
import os
from pathlib import Path
if os.getuid() == 0:
    raise RuntimeError("root runtime")
if importlib.metadata.version("motor-de-fluxo") != "0.1.0":
    raise RuntimeError("project metadata missing")
for name in ("pytest", "playwright", "pymupdf", "ruff", "mypy", "pip-tools"):
    try:
        importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        continue
    raise RuntimeError("development package in runtime")
roots = ["/app"]
for name in ("motor", "servidor"):
    roots.append(str(Path(importlib.util.find_spec(name).origin).parent))
scan_packaged_files(roots)
'''
        run("exec", "--interactive", container, "python", "-", input=image_probe)
    finally:
        run("rm", "--force", container)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--docker", default="docker")
    parser.add_argument("--timeout", type=float, default=60)
    args = parser.parse_args()
    try:
        smoke(args.image, docker=args.docker, timeout=args.timeout)
    except (RuntimeError, OSError, subprocess.SubprocessError):
        # Docker stderr and HTTP response bodies can contain private data.
        raise SystemExit("container_smoke=FAIL (diagnostic payload suppressed)") from None
    print("container_smoke=PASS health spa assets auth headers nonroot readonly package_scan")


if __name__ == "__main__":
    main()
