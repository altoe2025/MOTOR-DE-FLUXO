"""Regressões do gate geométrico do relatório A4."""

from pathlib import Path

import pymupdf
import pytest

from tests.web_api.render_stage6_pdf import inspect_pdf


@pytest.mark.parametrize("origin,sentinel", [
    ((585, 100), "RIGHT_EDGE_SENTINEL"),
    ((-12, 100), "LEFT_EDGE_SENTINEL"),
    ((80, 840), "BOTTOM_EDGE_SENTINEL"),
    ((80, 4), "TOP_EDGE_SENTINEL"),
])
def test_rejects_text_partially_outside_media_box(
    tmp_path: Path, origin: tuple[int, int], sentinel: str,
) -> None:
    pdf = tmp_path / "cropped.pdf"
    with pymupdf.open() as document:
        for _ in range(2):
            page = document.new_page(width=595.28, height=841.89)
            page.insert_text((80, 120), "Premissas e proveniência com fontes publicadas")
            page.insert_text((80, 150), "Limitações e versões preservadas")
        document[0].insert_text(origin, sentinel)
        document.save(pdf)
    with pytest.raises(ValueError, match="texto fora da página"):
        inspect_pdf(pdf, tmp_path / "render", [], 2)


def test_checks_executive_assumptions_provenance_and_limitations(tmp_path: Path) -> None:
    pdf = tmp_path / "missing.pdf"
    with pymupdf.open() as document:
        for _ in range(2):
            page = document.new_page(width=595.28, height=841.89)
            page.insert_text((80, 120), "Premissas e proveniência com fontes publicadas")
            page.insert_text((80, 150), "Limitações e versões preservadas")
        document.save(pdf)
    with pytest.raises(ValueError, match="conteúdo ausente no PDF: IOF OUT"):
        inspect_pdf(pdf, tmp_path / "render", ["IOF OUT"], 2)
