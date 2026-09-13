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
    for path in _candidate_paths():
        try:
            text_files[path.relative_to(ROOT).as_posix()] = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
    findings = find_secret_findings(text_files)
    if findings:
        for finding in findings:
            print(f"secret_shape={finding.kind} path={finding.path}")
        raise SystemExit("formatos de segredo encontrados")
    print(f"credential_scan=ok files={len(text_files)}")


if __name__ == "__main__":
    main()
