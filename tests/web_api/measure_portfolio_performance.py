"""Recompute and enforce the browser gate for a persisted 255-result portfolio."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

REPORT = Path(__file__).resolve().parents[2] / "web" / "test-results" / "portfolio-performance.json"
LIMITS_MS = {"studies_ready": 200, "diagnostics_ready": 200, "interaction": 200,
             "new_combination_feedback": 100}


def percentile_95(samples: list[float]) -> float:
    if not samples:
        raise ValueError("empty sample")
    return sorted(samples)[math.ceil(0.95 * len(samples)) - 1]


def percentile_50(samples: list[float]) -> float:
    if not samples:
        raise ValueError("empty sample")
    return sorted(samples)[math.ceil(0.50 * len(samples)) - 1]


def _field(source: Any, key: str, path: str, failures: list[str]) -> Any:
    if not isinstance(source, dict) or key not in source:
        failures.append(f"missing {path}.{key}")
        return None
    return source[key]


def _samples(value: Any, path: str, count: int, failures: list[str]) -> list[float] | None:
    if not isinstance(value, list) or len(value) != count:
        failures.append(f"{path}: expected {count} samples")
        return None
    if any(isinstance(item, bool) or not isinstance(item, (int, float))
           or not math.isfinite(item) or item < 0 for item in value):
        failures.append(f"{path}: samples must be finite nonnegative numbers")
        return None
    return value


def evaluate_budget(report: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    environment = _field(report, "environment", "report", failures)
    for name in ("os", "node", "browser", "viewport"):
        value = _field(environment, name, "environment", failures)
        if value is not None and (not isinstance(value, str) or not value):
            failures.append(f"environment.{name}: expected nonempty string")
    fixture = _field(report, "fixture", "report", failures)
    for name, expected in (("company_count", 8), ("study_count", 1),
                           ("scenario_count", 255), ("execution_count", 510)):
        value = _field(fixture, name, "fixture", failures)
        if value is not None and value != expected:
            failures.append(f"fixture.{name}: {value} != {expected}")

    samples = _field(report, "samples_ms", "report", failures)
    stats = _field(report, "stats_ms", "report", failures)
    for name, limit in LIMITS_MS.items():
        values = _samples(_field(samples, name, "samples_ms", failures), f"samples_ms.{name}",
                          1 if name == "new_combination_feedback" else 20, failures)
        recorded = _field(stats, name, "stats_ms", failures)
        if values is None:
            continue
        p50, p95 = percentile_50(values), percentile_95(values)
        if not isinstance(recorded, dict) or recorded.get("p50") != p50 or recorded.get("p95") != p95:
            failures.append(f"stats_ms.{name}: p50/p95 differ from samples")
        if p95 > limit:
            failures.append(f"{name} p95: {p95:.2f} > {limit} ms")

    phases = _field(report, "phases_ms", "report", failures)
    for name in ("studies_route", "diagnostics_route"):
        _samples(_field(phases, name, "phases_ms", failures), f"phases_ms.{name}", 20, failures)
    for name in ("recommendation_first",):
        timing = _field(phases, name, "phases_ms", failures)
        for field in ("to_dom_ms", "to_paint_ms"):
            _field(timing, field, f"phases_ms.{name}", failures)
        if isinstance(timing, dict) and isinstance(timing.get("to_dom_ms"), (int, float)) \
                and isinstance(timing.get("to_paint_ms"), (int, float)) \
                and timing["to_dom_ms"] > timing["to_paint_ms"]:
            failures.append(f"phases_ms.{name}: DOM appears after paint")
    warm = _field(phases, "recommendation_warm", "phases_ms", failures)
    if not isinstance(warm, list) or len(warm) != 20:
        failures.append("phases_ms.recommendation_warm: expected 20 samples")
    else:
        warm_dom: list[float] = []
        for index, timing in enumerate(warm):
            dom_ms = _field(timing, "to_dom_ms", f"phases_ms.recommendation_warm[{index}]", failures)
            _field(timing, "to_paint_ms", f"phases_ms.recommendation_warm[{index}]", failures)
            if isinstance(dom_ms, (int, float)) and not isinstance(dom_ms, bool) and math.isfinite(dom_ms):
                warm_dom.append(float(dom_ms))
        if len(warm_dom) == 20 and percentile_95(warm_dom) > 200:
            failures.append(
                f"recommendation_warm to_dom p95: {percentile_95(warm_dom):.2f} > 200 ms"
            )
    requests = _field(report, "request_counts", "report", failures)
    for name in ("incidental_preparations_post", "incidental_diagnostics_post"):
        value = _field(requests, name, "request_counts", failures)
        if value is not None and value != 0:
            failures.append(f"request_counts.{name}: expected 0, got {value}")
    dom = _field(report, "dom_counts", "report", failures)
    for name, expected in (("compact_scenario_rows", 0), ("portfolio_toggle_count", 0)):
        value = _field(dom, name, "dom_counts", failures)
        if value is not None and value != expected:
            failures.append(f"dom_counts.{name}: expected {expected}, got {value}")
    tasks = _field(report, "long_tasks", "report", failures)
    if not isinstance(tasks, list):
        failures.append("long_tasks: expected array")
    else:
        violating: dict[str, list[float]] = {}
        for index, task in enumerate(tasks):
            duration = _field(task, "duration_ms", f"long_tasks[{index}]", failures)
            local = _field(task, "attributable_to_local_read", f"long_tasks[{index}]", failures)
            phase = _field(task, "phase", f"long_tasks[{index}]", failures)
            if (isinstance(phase, str) and local is True and isinstance(duration, (int, float))
                    and math.isfinite(duration) and duration > 200):
                violating.setdefault(phase, []).append(duration)
        for phase, durations in violating.items():
            failures.append(f"long tasks >200 ms in {phase}: {len(durations)}, max {max(durations):.2f} ms")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--assert-budget", action="store_true")
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    failures = evaluate_budget(report)
    print(json.dumps({"stats_ms": report.get("stats_ms"), "failures": failures}, ensure_ascii=False, indent=2))
    return 1 if args.assert_budget and failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
