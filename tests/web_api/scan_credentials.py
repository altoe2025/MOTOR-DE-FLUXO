"""Falha se arquivos publicados ou o bundle contiverem formatos de segredo."""

from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile

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
    "sensitive-log-chat": re.compile(
        r"(?:console|logger|logging|_LOGGER)\.(?:log|debug|info|warn|warning|error|exception)"
        r"\([^;]*?\b(?:question|answer|message|history|ownerSub|bearer_token|raw_xlsx|"
        r"study\.name|metric\.value)\b[^;]*?\)",
        re.IGNORECASE,
    ),
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
_LOG_METHODS = {"debug", "info", "warning", "error", "exception"}
_LOGGER_NAMES = {"logger", "logging", "_LOGGER"}
_CHAT_PRIVATE_NAMES = {
    "question", "answer", "message", "history", "ownerSub", "owner_sub",
    "bearer_token", "raw_xlsx", "study_name", "financial_value",
}
_CONCRETE_PRIVATE_CHAT_REFERENCE = re.compile(
    r"\b[\w$]+\s*(?:\??\.\s*(?:question|answer|message|history)\b|"
    r"(?:\?\.)?\[\s*['\"](?:question|answer|message|history)['\"]\s*\])|"
    r"\b(?:ownerSub|owner_sub|bearer_token|raw_xlsx|study_name|financial_value|"
    r"study\.name|metric\.value)\b",
)


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


def find_runtime_privacy_findings(
    files: Mapping[str, str], *, canaries: Mapping[str, str],
) -> list[SecretFinding]:
    """Scan observed logs/errors against private synthetic input, not all money.

    Successful chat responses legitimately contain the requested answer/evidence;
    callers must select the relevant forbidden canaries for each artifact boundary.
    Findings contain categories and paths only, never the matched private value.
    """
    findings: set[SecretFinding] = set()
    for kind, value in canaries.items():
        if not isinstance(value, str) or not value or not re.fullmatch(r"[a-z0-9-]+", kind):
            raise ValueError("invalid privacy canary manifest")
        variants = {value, json.dumps(value, ensure_ascii=True)[1:-1],
                    json.dumps(value, ensure_ascii=False)[1:-1]}
        for path, content in files.items():
            if any(candidate in content for candidate in variants):
                findings.add(SecretFinding(path, f"private-chat-{kind}"))
    return sorted(findings, key=lambda item: (item.path, item.kind))


def find_binary_secret_findings(
    files: Mapping[str, bytes], *, inspect_archives: bool = True
) -> list[SecretFinding]:
    """Normaliza ASCII binário e UTF-16 explícito antes de procurar segredos."""
    findings: set[SecretFinding] = set()
    for path, content in files.items():
        if inspect_archives and Path(path).suffix.lower() == ".xlsx" and content.startswith(b"PK"):
            try:
                with ZipFile(BytesIO(content)) as archive:
                    entries = archive.infolist()
                    budget = 64 * 1024 * 1024
                    if len(entries) > 4096 or sum(item.file_size for item in entries) > budget:
                        findings.add(SecretFinding(path, "archive-scan-limit"))
                    else:
                        for entry in entries:
                            if entry.is_dir():
                                continue
                            with archive.open(entry) as source:
                                expanded = source.read(budget + 1)
                            budget -= len(expanded)
                            if budget < 0:
                                findings.add(SecretFinding(path, "archive-scan-limit"))
                                break
                            findings.update(find_binary_secret_findings(
                                {f"{path}!{entry.filename}": expanded},
                                inspect_archives=False,
                            ))
            except (BadZipFile, OSError, RuntimeError, NotImplementedError):
                findings.add(SecretFinding(path, "archive-unreadable"))
        views = {content.decode("latin-1")}
        if content.startswith((b"\xff\xfe", b"\xfe\xff")):
            try:
                views.add(content.decode("utf-16"))
            except UnicodeDecodeError:
                pass
        elif len(content) >= 4 and len(content) % 2 == 0:
            even_nulls = content[0::2].count(0)
            odd_nulls = content[1::2].count(0)
            threshold = len(content) // 8
            encoding = (
                "utf-16le"
                if odd_nulls > threshold and even_nulls == 0
                else "utf-16be"
                if even_nulls > threshold and odd_nulls == 0
                else None
            )
            if encoding is not None:
                try:
                    views.add(content.decode(encoding))
                except UnicodeDecodeError:
                    pass
        for view in views:
            findings.update(find_secret_findings({path: view}))
    return sorted(findings, key=lambda item: (item.path, item.kind))


def _attribute_path(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = _attribute_path(node.value)
        return f"{parent}.{node.attr}" if parent is not None else None
    return None


def _sensitive_references(node: ast.AST) -> set[str]:
    path = _attribute_path(node)
    if path is not None and (
        set(path.split(".")) & _CHAT_PRIVATE_NAMES
        or path.endswith(("study.name", "metric.value"))
    ):
        return {"sensitive-log-chat"}
    if (isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Constant)
            and node.slice.value in _CHAT_PRIVATE_NAMES):
        return {"sensitive-log-chat"}
    if path == "request.url.path" or (
        path is not None and path.startswith("request.url.path.")
    ):
        return set()
    if path in {"request.url", "originalUrl", "full_url"}:
        return {"sensitive-log-url"}
    if path in {"request.json", "request.body", "payload", "cenario", "ordens"}:
        return {"sensitive-log-payload"}
    findings: set[str] = set()
    for child in ast.iter_child_nodes(node):
        findings.update(_sensitive_references(child))
    return findings


def _python_sensitive_log_kinds(content: str) -> set[str]:
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return set()
    findings: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        logger_name = _attribute_path(node.func.value)
        if logger_name not in _LOGGER_NAMES or node.func.attr not in _LOG_METHODS:
            continue
        for argument in [*node.args, *(keyword.value for keyword in node.keywords)]:
            findings.update(_sensitive_references(argument))
    return findings


def _source_log_findings(path: str, content: str) -> set[SecretFinding]:
    if Path(path).suffix == ".py":
        return {SecretFinding(path, kind) for kind in _python_sensitive_log_kinds(content)}
    dependency = "/node_modules/" in path.replace("\\", "/")
    return {
        SecretFinding(path, kind)
        for kind, pattern in SENSITIVE_LOG_PATTERNS.items()
        for match in pattern.finditer(content)
        # Bare `message` in a library warning helper is not evidence of chat data.
        # Keep concrete private field checks in dependencies, and the strict
        # variable-name policy in application sources. Runtime canaries and raw
        # secret shapes have no dependency exemption.
        if not (dependency and kind == "sensitive-log-chat")
        or _CONCRETE_PRIVATE_CHAT_REFERENCE.search(match.group())
    }


def find_sensitive_log_findings(files: Mapping[str, str]) -> list[SecretFinding]:
    findings: set[SecretFinding] = set()
    for path, content in files.items():
        if Path(path).suffix != ".map":
            findings.update(_source_log_findings(path, content))
            continue
        # Source maps are JSON containers: escaped newlines must not turn a
        # logging call in one source into a match on a different source's data.
        try:
            document = json.loads(content)
            sources = document["sources"]
            contents = document["sourcesContent"]
            if (document.get("version") != 3 or not isinstance(sources, list)
                    or not isinstance(contents, list) or len(sources) != len(contents)
                    or not all(isinstance(source, str) for source in sources)
                    or not all(isinstance(source, str) for source in contents)):
                raise ValueError
        except (ValueError, TypeError, KeyError):
            findings.add(SecretFinding(path, "source-map-unreadable"))
            continue
        for source, source_content in zip(sources, contents, strict=True):
            findings.update(_source_log_findings(f"{path}!{source}", source_content))
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


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-artifact", action="append", type=Path, default=[])
    parser.add_argument("--canary-manifest", type=Path)
    args = parser.parse_args(argv)
    if bool(args.runtime_artifact) != bool(args.canary_manifest):
        parser.error("runtime artifacts and canary manifest must be supplied together")
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
    runtime_files: dict[str, str] = {}
    canaries: dict[str, str] = {}
    if args.canary_manifest:
        try:
            canaries = json.loads(args.canary_manifest.read_text(encoding="utf-8"))
            if not isinstance(canaries, dict) or not canaries:
                raise ValueError
            runtime_files = {
                str(path): path.read_text(encoding="utf-8") for path in args.runtime_artifact
            }
            runtime_findings = find_runtime_privacy_findings(runtime_files, canaries=canaries)
        except (OSError, UnicodeError, ValueError, TypeError):
            raise SystemExit("privacy artifacts or canary manifest invalid") from None
    else:
        runtime_findings = []
    findings = sorted(
        [
            *find_secret_findings(text_files),
            *find_binary_secret_findings(binary_files),
            *find_sensitive_log_findings(text_files),
            *find_secret_findings(runtime_files),
            *runtime_findings,
        ],
        key=lambda item: (item.path, item.kind),
    )
    if findings:
        for finding in findings:
            print(f"secret_shape={finding.kind} path={finding.path}")
        raise SystemExit("formatos de segredo encontrados")
    print(
        "credential_scan=ok "
        f"text_files={len(text_files)} binary_files={len(binary_files)} "
        f"runtime_artifacts={len(runtime_files)}"
    )


if __name__ == "__main__":
    main()
