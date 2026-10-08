from tests.web_api.measure_stage6 import evaluate_budget, percentile_95


def test_percentile_95_uses_20_sorted_samples() -> None:
    assert percentile_95(list(range(1, 21))) == 19


def test_budget_rejects_oversized_initial_bundle() -> None:
    measurements = {
        "initial_js_gzip_bytes": 358401,
        "presentation_lazy_gzip_bytes": 10000,
        "opening_ms": [10] * 20,
        "section_ms": [10] * 20,
        "document_ms": [10] * 20,
        "long_tasks_over_200_ms": 0,
        "max_cls": 0.0,
    }
    assert evaluate_budget(measurements) == ["initial_js_gzip_bytes: 358401 > 358400"]


def test_budget_requires_20_samples() -> None:
    measurements = {
        "initial_js_gzip_bytes": 100,
        "presentation_lazy_gzip_bytes": 100,
        "opening_ms": [10] * 19,
        "section_ms": [10] * 20,
        "document_ms": [10] * 20,
        "long_tasks_over_200_ms": 0,
        "max_cls": 0.0,
    }
    assert evaluate_budget(measurements) == ["opening_ms: expected 20 samples, got 19"]
