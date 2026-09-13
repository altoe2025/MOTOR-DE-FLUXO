from __future__ import annotations

from pathlib import Path

import yaml

from tests.web_api.measure_reference import summarize_measurements
from tests.web_api.scan_credentials import find_secret_findings

ROOT = Path(__file__).resolve().parents[2]


def _workflow() -> dict[str, object]:
    return yaml.safe_load((ROOT / ".github/workflows/test.yml").read_text(encoding="utf-8"))


def test_ci_covers_every_pull_request_and_locked_runtimes():
    workflow = _workflow()
    triggers = workflow.get("on", workflow.get(True))
    assert isinstance(triggers, dict)
    assert triggers["pull_request"] == {}
    assert "pytest" in workflow["jobs"]

    serialized = (ROOT / ".github/workflows/test.yml").read_text(encoding="utf-8")
    assert 'python-version: "3.11"' in serialized
    assert 'node-version: "24"' in serialized
    assert "npm --prefix web ci" in serialized
    assert "playwright install --with-deps chromium" in serialized


def test_ci_runs_the_complete_acceptance_gate_and_detects_generated_diff():
    serialized = (ROOT / ".github/workflows/test.yml").read_text(encoding="utf-8")
    required = (
        "python -m pytest -q",
        "python -O -m pytest -q",
        "python -m ruff check servidor tests/web_api",
        "python -m mypy servidor",
        "python -m servidor.export_openapi",
        "npm --prefix web run generate:api",
        "npm --prefix web run typecheck",
        "npm --prefix web run lint",
        "npm --prefix web run test:unit",
        "npm --prefix web run build",
        "npm --prefix web run test:e2e",
        "python -m build --wheel",
        "python -m tests.web_api.scan_credentials",
        "python -m tests.web_api.measure_reference",
    )
    for command in required:
        assert command in serialized
    assert "exemplo_amanda.yaml" in serialized
    assert (
        "git diff --exit-code -- contracts web/src/api/generated.ts "
        "web/src/api/schemas.json web/src/api/validators.ts"
    ) in serialized


def test_playwright_exposes_local_and_real_auth_projects():
    package = (ROOT / "web/package.json").read_text(encoding="utf-8")
    config = (ROOT / "web/playwright.config.ts").read_text(encoding="utf-8")
    assert '"test:e2e": "vite build --mode e2e && playwright test --project=local"' in package
    assert '"test:e2e:real": "node scripts/run-real-e2e.mjs"' in package
    assert "name: 'local'" in config
    assert "name: 'real-auth'" in config
    assert "process.env.CI === 'true'" in config
    real_runner = (ROOT / "web/scripts/run-real-e2e.mjs").read_text(encoding="utf-8")
    assert "MOT_REAL_AUTH_ONLY: '1'" in real_runner
    assert "--project=real-auth" in real_runner


def test_measurement_summary_uses_slowest_of_five_as_small_sample_p95():
    summary = summarize_measurements([100.0, 400.0, 200.0, 500.0, 300.0], 1234)
    assert summary == {"runs": 5, "p95_ms": 500.0, "envelope_bytes": 1234}


def test_credential_scan_detects_secret_shapes_without_flagging_publishable_key():
    scanner = (ROOT / "tests/web_api/scan_credentials.py").read_text(encoding="utf-8")
    assert '"--cached", "--others", "--exclude-standard"' in scanner
    findings = find_secret_findings(
        {
            "safe.ts": "VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example",
            "openai.txt": "OPENAI_API_KEY=" + "sk-proj-" + "abcdefghijklmnopqrstuvwxyz123456",
            "service.txt": "SUPABASE_" + "SERVICE_ROLE_KEY=super-secret-value",
            "jwt.txt": "token=" + "eyJhbGciOiJIUzI1NiJ9." + "eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature",
        }
    )
    assert [finding.path for finding in findings] == [
        "jwt.txt",
        "openai.txt",
        "service.txt",
    ]
