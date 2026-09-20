"""Falha se arquivos publicados ou o bundle contiverem formatos de segredo."""

from __future__ import annotations

import re
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "openai-key": re.compile(r"(?:OPENAI_API_KEY\s*=\s*)?sk-(?:proj-)?[A-Za-z0-9_-]{20,}"),
    "supabase-service-role": re.compile(
        r"SUPABASE_SERVICE_ROLE(?:_KEY)?\s*=\s*(?!example|placeholder|\$\{)[^\s'\"]{8,}",
        re.IGNORECASE,
    ),
    "jwt": re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "url-secret-query": re.compile(
        r"[?&](?:access_token|refresh_token|id_token|token|apikey)="
        r"(?!example(?:[&#]|$)|placeholder(?:[&#]|$))[^&#\s'\"]{8,}",
        re.IGNORECASE,
    ),
}
SENSITIVE_LOG_PATTERNS = {
    "sensitive-log-url": re.compile(
        r"(?:logger|logging|_LOGGER)\.(?:debug|info|warning|error|exception)"
        r"\([^\n]*(?:request\.url(?!\.path)|originalUrl|full_url)",
        re.IGNORECASE,
    ),
    "sensitive-log-payload": re.compile(
        r"(?:logger|logging|_LOGGER)\.(?:debug|info|warning|error|exception)"
        r"\([^\n]*(?:request\.(?:json|body)|payload|cenario|ordens)",
        re.IGNORECASE,
    ),
}


@dataclass(frozen=True)
class SecretFinding:
    path: str
    kind: str


def find_secret_findings(files: Mapping[str, str]) -> list[SecretFinding]:
    findings = {
        SecretFinding(path, kind)
        for path, content in files.items()
        for kind, pattern in PATTERNS.items()
        if pattern.search(content)
    }
    return sorted(findings, key=lambda item: (item.path, item.kind))


def find_binary_secret_findings(files: Mapping[str, bytes]) -> list[SecretFinding]:
    """Inspeciona shapes ASCII mesmo quando o arquivo nao e texto UTF-8."""
    decoded = {path: content.decode("latin-1") for path, content in files.items()}
    return find_secret_findings(decoded)


def find_sensitive_log_findings(files: Mapping[str, str]) -> list[SecretFinding]:
    findings = {
        SecretFinding(path, kind)
        for path, content in files.items()
        for kind, pattern in SENSITIVE_LOG_PATTERNS.items()
        if pattern.search(content)
    }
    return sorted(findings, key=lambda item: (item.path, item.kind))


def _candidate_paths() -> list[Path]:
    tracked = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    ).stdout.decode().split("\0")
    paths = [ROOT / path for path in tracked if path]
    dist = ROOT / "web" / "dist"
    if dist.exists():
        paths.extend(path for path in dist.rglob("*") if path.is_file())
    return paths


def main() -> None:
    text_files: dict[str, str] = {}
    binary_files: dict[str, bytes] = {}
    for path in _candidate_paths():
        relative = path.relative_to(ROOT).as_posix()
        try:
            content = path.read_bytes()
        except OSError:
            continue
        try:
            text_files[relative] = content.decode("utf-8")
        except UnicodeDecodeError:
            binary_files[relative] = content
    findings = sorted(
        [
            *find_secret_findings(text_files),
            *find_binary_secret_findings(binary_files),
            *find_sensitive_log_findings(text_files),
        ],
        key=lambda item: (item.path, item.kind),
    )
    if findings:
        for finding in findings:
            print(f"secret_shape={finding.kind} path={finding.path}")
        raise SystemExit("formatos de segredo encontrados")
    print(
        "credential_scan=ok "
        f"text_files={len(text_files)} binary_files={len(binary_files)}"
    )


if __name__ == "__main__":
    main()
