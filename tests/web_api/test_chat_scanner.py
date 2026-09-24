"""Chat privacy regressions use planted synthetic canaries, never real secrets."""

import json

import pytest

from tests.web_api import scan_credentials as scanner


@pytest.mark.parametrize("reference", [
    "chat.message", "answer.answer", "document.study.name", "metric.value",
    "ownerSub", "bearer_token", "raw_xlsx", "history",
])
def test_source_scanner_rejects_chat_content_logging(reference):
    source = 'log' + 'ger.info(\n "chat=%s",\n ' + reference + '\n)'
    findings = scanner.find_sensitive_log_findings({"server.py": source})
    assert [finding.kind for finding in findings] == ["sensitive-log-chat"]


def test_source_scanner_rejects_browser_chat_logging_but_allows_metadata():
    unsafe = 'con' + 'sole.log(\n "chat", chat.message\n)'
    safe = 'con' + 'sole.info("chat", { status, requestId, elapsedMs })'
    findings = scanner.find_sensitive_log_findings({"unsafe.ts": unsafe, "safe.ts": safe})
    assert [(item.path, item.kind) for item in findings] == [("unsafe.ts", "sensitive-log-chat")]
    assert scanner.find_sensitive_log_findings({
        "safe.py": 'logger.info("status=%s duration=%s", status, duration_ms)',
    }) == []


@pytest.mark.parametrize("kind,value", [
    ("question", "Pergunta fictícia reservada C6"),
    ("answer", "Resposta fictícia reservada C6"),
    ("study-name", "Estudo privado çã C6"),
    ("financial-value", "98765432109876.123456"),
    ("bearer", "session-canary-c6"),
    ("owner", "owner-canary-c6"),
    ("raw-xlsx", "RAW_XLSX_CANARY_C6"),
])
def test_runtime_scanner_detects_literal_and_json_escaped_private_canaries(kind, value):
    scan = getattr(scanner, "find_runtime_privacy_findings", None)
    assert callable(scan), "runtime artifacts need a canary scanner"
    files = {"runtime.log": value, "response.json": json.dumps({"error": value})}
    findings = scan(files, canaries={kind: value})
    assert [(item.path, item.kind) for item in findings] == [
        ("response.json", f"private-chat-{kind}"), ("runtime.log", f"private-chat-{kind}"),
    ]


def test_runtime_scanner_does_not_ban_public_synthetic_financial_values():
    scan = getattr(scanner, "find_runtime_privacy_findings", None)
    assert callable(scan), "runtime artifacts need a canary scanner"
    assert scan({"app.js": 'const demo = {value: "1000.00", unit: "BRL"}'},
                canaries={"financial-value": "98765432109876.123456"}) == []


@pytest.mark.parametrize("path", ["web/dist/assets/app.js", "web/dist/assets/app.js.map"])
def test_bundle_and_source_map_secret_canaries_are_rejected(path):
    secret = "sk-" + "proj-" + "c6-synthetic-canary-1234567890"
    findings = scanner.find_secret_findings({path: json.dumps({"source": secret})})
    assert [(item.path, item.kind) for item in findings] == [(path, "openai-key")]


def test_runtime_cli_fails_without_printing_private_values(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(scanner, "_candidate_paths", list)
    manifest = tmp_path / "canaries.json"
    artifact = tmp_path / "server.log"
    canary = "private-synthetic-question-C6"
    manifest.write_text(json.dumps({"question": canary}), encoding="utf-8")
    artifact.write_text(canary, encoding="utf-8")
    with pytest.raises(SystemExit, match="formatos de segredo"):
        scanner.main(["--runtime-artifact", str(artifact), "--canary-manifest", str(manifest)])
    output = capsys.readouterr().out
    assert "private-chat-question" in output
    assert canary not in output
    artifact.write_text("status=200 duration_ms=12", encoding="utf-8")
    scanner.main(["--runtime-artifact", str(artifact), "--canary-manifest", str(manifest)])
    assert "runtime_artifacts=1" in capsys.readouterr().out


def test_runtime_cli_fails_closed_when_artifact_is_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(scanner, "_candidate_paths", list)
    manifest = tmp_path / "canaries.json"
    manifest.write_text(json.dumps({"question": "synthetic-canary"}), encoding="utf-8")
    with pytest.raises(SystemExit, match="artifacts or canary manifest invalid"):
        scanner.main(["--runtime-artifact", str(tmp_path / "missing.log"),
                      "--canary-manifest", str(manifest)])


def source_map(sources):
    return json.dumps({"version": 3, "sources": list(sources),
                       "sourcesContent": list(sources.values()), "mappings": ""})


def test_source_map_logging_does_not_join_unrelated_sources_or_generic_dependency_messages():
    content = source_map({
        "../../node_modules/router/warnings.js":
            'function warning(message) { con' + 'sole.warn(message); }',
        "../../node_modules/ajv/core.js":
            'if (opts.validateSchema === "log") this.log' + 'ger.error(message);',
        "../../src/metadata.ts": 'log' + 'ger.info("ok");\nconst payload = getData();',
    })
    assert scanner.find_sensitive_log_findings({"app.js.map": content}) == []


@pytest.mark.parametrize("origin", ["../../src/chat.ts", "../../node_modules/vendor/chat.js"])
@pytest.mark.parametrize("reference", [
    "chat.message", 'chat["message"]', "chat['message']", "chat?.message",
    'chat?.["message"]', "chat?.['message']", 'chat [ "message" ]',
    "conversation.chat?.history", 'request["question"]', "result['answer']",
])
def test_source_map_keeps_concrete_private_logging_checks_in_all_sources(origin, reference):
    content = source_map({origin: 'con' + f'sole.log({reference});'})
    findings = scanner.find_sensitive_log_findings({"app.js.map": content})
    assert [(item.path, item.kind) for item in findings] == [
        (f"app.js.map!{origin}", "sensitive-log-chat"),
    ]


def test_first_party_generic_message_logging_remains_forbidden_in_source_map():
    origin = "../../src/chat.ts"
    content = source_map({origin: 'con' + 'sole.log(message);'})
    assert scanner.find_sensitive_log_findings({"app.js.map": content}) == [
        scanner.SecretFinding(f"app.js.map!{origin}", "sensitive-log-chat"),
    ]


def test_dependency_source_map_secret_and_runtime_canary_scans_are_never_exempted():
    secret = "sk-" + "proj-" + "synthetic-secret-in-source-map-C6"
    canary = "synthetic-private-question-in-source-map-C6"
    content = source_map({"../../node_modules/library/index.js": secret + canary})
    artifacts = {"app.js.map": content}
    assert scanner.find_secret_findings(artifacts) == [
        scanner.SecretFinding("app.js.map", "openai-key"),
    ]
    assert scanner.find_runtime_privacy_findings(artifacts, canaries={"question": canary}) == [
        scanner.SecretFinding("app.js.map", "private-chat-question"),
    ]


@pytest.mark.parametrize("content", ["{", '{"version":3,"sources":[],"sourcesContent":["x"]}'])
def test_invalid_source_maps_fail_closed(content):
    assert scanner.find_sensitive_log_findings({"app.js.map": content}) == [
        scanner.SecretFinding("app.js.map", "source-map-unreadable"),
    ]
