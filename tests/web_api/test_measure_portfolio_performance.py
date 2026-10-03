import copy

import pytest

from tests.web_api.measure_portfolio_performance import (
    evaluate_budget,
    percentile_50,
    percentile_95,
)


def report() -> dict:
    measured = {
        "environment": {"os": "Windows", "node": "v24", "browser": "Chrome", "viewport": "1280x720"},
        "fixture": {"company_count": 8, "study_count": 1, "scenario_count": 255, "execution_count": 510},
        "samples_ms": {
            "studies_ready": [20] * 20,
            "diagnostics_ready": [30] * 20,
            "interaction": [40] * 20,
            "new_combination_feedback": [50],
        },
        "phases_ms": {
            "studies_route": [100] * 20, "diagnostics_route": [110] * 20,
            "recommendation_first": {"to_dom_ms": 40, "to_paint_ms": 50},
            "recommendation_warm": [{"to_dom_ms": 40, "to_paint_ms": 50}] * 20,
        },
        "request_counts": {"incidental_preparations_post": 0, "incidental_diagnostics_post": 0},
        "dom_counts": {"compact_scenario_rows": 0, "portfolio_toggle_count": 0},
        "long_tasks": [],
    }
    measured["stats_ms"] = {name: {"p50": percentile_50(values), "p95": percentile_95(values)}
                            for name, values in measured["samples_ms"].items()}
    return measured


def restat(measured: dict) -> None:
    measured["stats_ms"] = {name: {"p50": percentile_50(values), "p95": percentile_95(values)}
                            for name, values in measured["samples_ms"].items()}


def test_percentile_95_nearest_rank() -> None:
    assert percentile_95(list(range(20, 0, -1))) == 19
    with pytest.raises(ValueError, match="empty"):
        percentile_95([])


def test_budget_accepts_complete_report_at_limits() -> None:
    measured = report()
    measured["samples_ms"]["studies_ready"][-1] = 200
    measured["samples_ms"]["diagnostics_ready"][-1] = 200
    measured["samples_ms"]["interaction"][-1] = 200
    measured["samples_ms"]["new_combination_feedback"] = [100]
    restat(measured)
    assert evaluate_budget(measured) == []


def test_budget_recomputes_p95_and_rejects_required_field_omissions() -> None:
    measured = report()
    measured["samples_ms"]["studies_ready"][-2:] = [201, 201]
    assert any("studies_ready p95" in failure for failure in evaluate_budget(measured))
    missing = copy.deepcopy(report())
    del missing["environment"]["browser"]
    assert any("environment.browser" in failure for failure in evaluate_budget(missing))
    short = report()
    short["samples_ms"]["interaction"].pop()
    assert any("20 samples" in failure for failure in evaluate_budget(short))


def test_budget_rejects_side_effects_compact_hub_and_local_long_tasks() -> None:
    measured = report()
    measured["request_counts"]["incidental_diagnostics_post"] = 1
    measured["dom_counts"]["portfolio_toggle_count"] = 1
    measured["long_tasks"] = [{"phase": "recommendation_first", "duration_ms": 201, "attributable_to_local_read": True}]
    failures = evaluate_budget(measured)
    assert any("incidental_diagnostics_post" in failure for failure in failures)
    assert any("portfolio_toggle_count" in failure for failure in failures)
    assert any("long task" in failure for failure in failures)


def test_budget_rejects_slow_warm_recommendation_dom() -> None:
    measured = report()
    measured["phases_ms"]["recommendation_warm"][-2:] = [
        {"to_dom_ms": 201, "to_paint_ms": 220},
        {"to_dom_ms": 201, "to_paint_ms": 220},
    ]

    assert any("recommendation_warm to_dom p95" in failure
               for failure in evaluate_budget(measured))
