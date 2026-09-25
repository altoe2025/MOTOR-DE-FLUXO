"""Exercise the smoke's safety boundaries without a Docker daemon."""

import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def load_smoke():
    path = ROOT / "scripts/smoke_container.py"
    assert path.is_file(), "container smoke is missing"
    spec = importlib.util.spec_from_file_location("smoke_container", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_scan_rejects_secret_without_echoing_value(tmp_path):
    smoke = load_smoke()
    value = "sk-" + "a" * 32
    (tmp_path / "bundle.js").write_text(value)
    with pytest.raises(RuntimeError, match="credential") as error:
        smoke.scan_packaged_files([str(tmp_path)])
    assert value not in str(error.value)


def test_scan_rejects_utf16_encoded_secret(tmp_path):
    smoke = load_smoke()
    (tmp_path / "payload.dat").write_bytes(("sk-" + "a" * 32).encode("utf-16"))
    with pytest.raises(RuntimeError, match="credential"):
        smoke.scan_packaged_files([str(tmp_path)])


def test_cli_never_echoes_docker_diagnostic(monkeypatch, capsys):
    smoke = load_smoke()
    monkeypatch.setattr("sys.argv", ["smoke_container.py", "--image", "local"])

    def fail(*args, **kwargs):
        raise subprocess.CalledProcessError(1, ["docker"], stderr="private payload")

    monkeypatch.setattr(smoke, "smoke", fail)
    with pytest.raises(SystemExit) as error:
        smoke.main()
    assert "private payload" not in str(error.value)
    assert "private payload" not in capsys.readouterr().out


@pytest.mark.parametrize("name", [".env", "real.xlsx", "chat.log", "__fixtures__/observed.json"])
def test_scan_rejects_private_artifacts(tmp_path, name):
    smoke = load_smoke()
    path = tmp_path / name
    path.parent.mkdir(exist_ok=True)
    path.write_text("private artifact")
    with pytest.raises(RuntimeError, match="artifact"):
        smoke.scan_packaged_files([str(tmp_path)])


def test_scan_allows_synthetic_demo_and_public_configuration(tmp_path):
    smoke = load_smoke()
    (tmp_path / "demo-study.v1.json").write_text('{"origin":"SYNTHETIC"}')
    (tmp_path / "bundle.js").write_text('"https://example.supabase.co"; "sb_publishable_test"')
    assert smoke.scan_packaged_files([str(tmp_path)]) == 2


@pytest.mark.parametrize("failure", ["start", "probe", None])
def test_smoke_always_removes_only_its_created_container(monkeypatch, failure):
    smoke = load_smoke()
    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))
        action = command[1]
        if action == "create":
            return subprocess.CompletedProcess(command, 0, "a" * 64 + "\n", "")
        if action == "start" and failure == "start":
            raise subprocess.CalledProcessError(1, command, stderr="sensitive diagnostic")
        if action == "port":
            return subprocess.CompletedProcess(command, 0, "127.0.0.1:43210\n", "")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(smoke.subprocess, "run", run)

    def probe(_base, _timeout):
        if failure == "probe":
            raise RuntimeError("HTTP probe failed")

    monkeypatch.setattr(smoke, "probe_http", probe)
    if failure:
        with pytest.raises((RuntimeError, subprocess.CalledProcessError)):
            smoke.smoke("image:local", docker="docker")
    else:
        smoke.smoke("image:local", docker="docker")
    create = calls[0][0]
    assert "--read-only" in create
    assert "127.0.0.1::8000" in create
    assert "CHAT_ENABLED=false" in create
    assert not any("OPENAI_API_KEY=" in arg for arg in create)
    assert calls[-1][0] == ["docker", "rm", "--force", "a" * 64]
    assert all("prune" not in command for command, _ in calls)


@pytest.mark.parametrize("broken", [None, "header", "asset", "404", "auth"])
def test_http_probe_checks_the_serving_contract(monkeypatch, broken):
    smoke = load_smoke()

    def request(base, path, **kwargs):
        if path == "/api/v1/health":
            return 200, {}, b'{"status":"ok"}'
        if path in {"/api/v1/session", "/api/v1/chat"}:
            return (200 if broken == "auth" else 401), {}, b"{}"
        if path == "/assets/index-abc12345.js":
            return 200, {"Cache-Control": "no-cache" if broken == "asset" else "immutable"}, b"script"
        if path.startswith(("/login", "/estudos/")):
            headers = {"Content-Type": "text/html", "Content-Security-Policy": "default-src 'self'"}
            if broken != "header":
                headers["X-Content-Type-Options"] = "nosniff"
            return 200, headers, b'<script src="/assets/index-abc12345.js"></script>'
        return (
            200 if broken == "404" else 404,
            {"Content-Type": "application/json"},
            json.dumps({"error": {"code": "RECURSO_NAO_ENCONTRADO"}}).encode(),
        )

    monkeypatch.setattr(smoke, "request", request)
    if broken:
        with pytest.raises(RuntimeError):
            smoke.probe_http("http://127.0.0.1:43210", 1)
    else:
        smoke.probe_http("http://127.0.0.1:43210", 1)
