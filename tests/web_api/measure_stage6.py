"""Verify the Stage 6 browser measurements and bundle budgets."""

from __future__ import annotations

import argparse
import gzip
import json
import math
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "web" / "dist"
REPORT = ROOT / "web" / "test-results" / "stage6-performance.json"


def percentile_95(samples: list[float]) -> float:
    if not samples:
        raise ValueError("empty sample")
    return sorted(samples)[math.ceil(0.95 * len(samples)) - 1]


def evaluate_budget(measurements: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    for field, limit in (("initial_js_gzip_bytes", 350 * 1024),
                         ("presentation_lazy_gzip_bytes", 300 * 1024)):
        value = measurements[field]
        if value > limit:
            failures.append(f"{field}: {value} > {limit}")
    for field, limit in (("opening_ms", 1500), ("section_ms", 100),
                         ("document_ms", 2000)):
        samples = measurements[field]
        if len(samples) != 20:
            failures.append(f"{field}: expected 20 samples, got {len(samples)}")
        elif percentile_95(samples) > limit:
            failures.append(f"{field} p95: {percentile_95(samples):.1f} > {limit}")
    if measurements["long_tasks_over_200_ms"] > 0:
        failures.append("long_tasks_over_200_ms: expected 0")
    if measurements["max_cls"] > 0.10:
        failures.append(f"max_cls: {measurements['max_cls']:.3f} > 0.10")
    return failures


def bundle_measurements(dist: Path = DIST) -> dict[str, int]:
    manifest = json.loads((dist / ".vite" / "manifest.json").read_text(encoding="utf-8"))
    entry = next(value for value in manifest.values() if value.get("isEntry"))
    initial: set[str] = set()

    def visit(value: dict[str, Any]) -> None:
        file = value["file"]
        if file in initial:
            return
        initial.add(file)
        for dependency in value.get("imports", []):
            visit(manifest[dependency])

    visit(entry)

    def compressed(file: str) -> int:
        return len(gzip.compress((dist / file).read_bytes(), compresslevel=9))

    presentation = next(value for key, value in manifest.items()
                        if "PresentationRoute" in key)
    return {
        "initial_js_gzip_bytes": sum(compressed(file) for file in initial if file.endswith(".js")),
        "presentation_lazy_gzip_bytes": compressed(presentation["file"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assert-budget", action="store_true")
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args()
    browser = json.loads(args.report.read_text(encoding="utf-8"))
    measured = {**browser, **bundle_measurements()}
    failures = evaluate_budget(measured)
    print(json.dumps({"measurements": measured, "failures": failures}, ensure_ascii=False, indent=2))
    return 1 if args.assert_budget and failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
