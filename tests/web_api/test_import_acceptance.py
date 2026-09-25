"""Regression checks for the local-first XLSX acceptance tooling."""

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from tests.web_api.scan_credentials import find_binary_secret_findings


def _xlsx(xml: bytes) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("xl/sharedStrings.xml", xml)
    return output.getvalue()


def test_scanner_finds_secret_inside_compressed_xlsx_without_extracting_to_disk():
    secret = ("sk-" + "proj-abcdefghijklmnopqrstuvwx123456").encode()
    findings = find_binary_secret_findings({"synthetic.xlsx": _xlsx(b"<sst>" + secret + b"</sst>")})
    assert [(item.path, item.kind) for item in findings] == [
        ("synthetic.xlsx!xl/sharedStrings.xml", "openai-key")
    ]


def test_scanner_accepts_safe_xlsx_and_reports_corrupt_archive():
    assert find_binary_secret_findings({"safe.xlsx": _xlsx(b"<sst>TESTE_FICTICIO</sst>")}) == []
    findings = find_binary_secret_findings({"broken.xlsx": b"PK\x03\x04broken"})
    assert [(item.path, item.kind) for item in findings] == [
        ("broken.xlsx", "archive-unreadable")
    ]


def test_scanner_bounds_archive_expansion_and_still_scans_non_zip_markers():
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for index in range(4097):
            archive.writestr(str(index), b"safe")
    findings = find_binary_secret_findings({"excess.xlsx": output.getvalue()})
    assert [(item.path, item.kind) for item in findings] == [
        ("excess.xlsx", "archive-scan-limit")
    ]
    marker = bytes.fromhex("d0cf11e0a1b11ae1")
    assert find_binary_secret_findings({"encrypted-marker.xlsx": marker}) == []
    secret = ("sk-" + "proj-abcdefghijklmnopqrstuvwx123456").encode()
    findings = find_binary_secret_findings({"marker-with-secret.xlsx": marker + secret})
    assert [(item.path, item.kind) for item in findings] == [
        ("marker-with-secret.xlsx", "openai-key")
    ]
