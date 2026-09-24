"""Structural gates for the production build boundary (MOT-98)."""

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_allowlisted_backend_imports_without_checkout_or_observed_data(tmp_path):
    """Stage the file-glob allowlist, then import with no checkout on sys.path."""
    source = tmp_path / "source"
    context = tmp_path / "context"
    context.mkdir()
    for package in ("motor", "servidor"):
        shutil.copytree(ROOT / package, source / package, ignore=shutil.ignore_patterns("__pycache__"))
    private_files = (
        "motor/analise/observed.csv", "motor/analise/observed.json",
        "motor/analise/.env", "motor/analise/__fixtures__/private.py",
    )
    for relative in private_files:
        path = source / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("private sentinel")

    # Expand only this repository's file-glob rules. Directory rules create no files;
    # the deny-by-default context requires explicit inclusion of every copied file.
    included = set()
    for rule in (ROOT / ".dockerignore").read_text().splitlines():
        if not rule or rule.startswith("#"):
            continue
        if rule.startswith(("!motor/", "!servidor/")):
            pattern = rule[1:]
            pattern = pattern + "/*" if pattern.endswith("**") else pattern
            included.update(path for path in source.glob(pattern) if path.is_file())
        elif not rule.startswith("!") and included:
            pattern = rule + "/*" if rule.endswith("**") else rule
            included.difference_update(source.glob(pattern))
    for path in included:
        destination = context / path.relative_to(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)
    assert not any((context / relative).exists() for relative in private_files)
    probe = (
        "import sys; from pathlib import Path; "
        "root=Path(sys.argv[1]); sys.path.insert(0,str(root)); "
        "import motor,servidor; "
        "assert Path(motor.__file__).is_relative_to(root); "
        "assert Path(servidor.__file__).is_relative_to(root); "
        "import servidor.app; from motor.analise import preparar_execucao_temporal; "
        "assert callable(servidor.app.create_app); assert callable(preparar_execucao_temporal)"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-c", probe, str(context)],
        cwd=context, capture_output=True, text=True, timeout=30, check=False,
    )
    assert result.returncode == 0, result.stderr


def test_container_has_only_public_build_inputs_and_no_root_runtime():
    path = ROOT / "Dockerfile"
    assert path.is_file(), "production Dockerfile is missing"
    source = path.read_text(encoding="utf-8")
    args = re.findall(r"^ARG\s+(\w+)", source, re.MULTILINE)
    assert set(args) == {
        "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_MOTOR_BUILD_SHA",
    }
    assert re.search(r"^FROM node:24\S* AS", source, re.MULTILINE)
    assert re.search(r"^FROM python:3\.12\S*", source, re.MULTILINE)
    assert "npm ci" in source
    assert "--require-hashes" in source
    assert "--no-deps" in source
    assert "COPY . " not in source and "COPY . /" not in source
    assert re.findall(r"^USER\s+(.*)$", source, re.MULTILINE)[-1] not in {"root", "0", "0:0"}
    assert "WEB_DIST_DIR=/app/web/dist" in source
    assert "PYTHONDONTWRITEBYTECODE=1" in source
    assert "PYTHONUNBUFFERED=1" in source
    assert re.search(r'CMD\s+\["python",\s*"-m",\s*"servidor"\]', source)
    assert not re.search(
        r"^(?:ARG|ENV)\s+.*(?:OPENAI_API_KEY|SERVICE_ROLE|JWT_SECRET)",
        source, re.MULTILINE | re.IGNORECASE,
    )


def test_context_defaults_to_excluded_and_blocks_sensitive_nested_files():
    path = ROOT / ".dockerignore"
    assert path.is_file(), "production context allowlist is missing"
    rules = [line for line in path.read_text().splitlines() if line and not line.startswith("#")]
    assert rules[0] == "**"
    for pattern in ("**/.env*", "**/*.pem", "**/*.key", "**/__fixtures__/**",
                    "**/node_modules/**", "**/__pycache__/**", "**/*.test.*"):
        assert pattern in rules
    assert "!web/src/**" in rules
    assert "!motor/cenarios/exemplo_amanda.yaml" in rules
    assert "!servidor/catalogs/*.json" in rules


def test_production_lock_is_hashed_without_development_dependencies():
    path = ROOT / "requirements/web.lock"
    assert path.is_file(), "production lock is missing"
    source = path.read_text()
    packages = re.findall(r"^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?==", source, re.MULTILINE)
    assert {"fastapi", "uvicorn", "numpy", "pyyaml"} <= set(packages)
    assert not {"pytest", "playwright", "pymupdf", "mypy", "ruff", "pip-tools"} & {
        name.lower() for name in packages
    }
    for block in re.split(r"\n(?=[A-Za-z0-9_.-]+(?:\[|==))", source):
        if re.search(r"^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?==", block, re.MULTILINE):
            assert "--hash=sha256:" in block
