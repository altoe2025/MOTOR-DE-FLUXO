"""Inspeciona e renderiza cada página de um PDF A4 gerado pelo navegador."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


def _overlap_fraction(first: tuple[float, ...], second: tuple[float, ...]) -> float:
    left = max(first[0], second[0])
    top = max(first[1], second[1])
    right = min(first[2], second[2])
    bottom = min(first[3], second[3])
    if right <= left or bottom <= top:
        return 0.0
    minimum = min((first[2] - first[0]) * (first[3] - first[1]),
                  (second[2] - second[0]) * (second[3] - second[1]))
    return (right - left) * (bottom - top) / minimum if minimum > 0 else 0.0


def inspect_pdf(pdf: Path, render_dir: Path, expected: list[str], expected_pages: int | None) -> dict[str, object]:
    with pymupdf.open(pdf) as document:
        count = len(document)
        if count < 2 or count > 12 or (expected_pages is not None and count != expected_pages):
            raise ValueError(f"quantidade inesperada de páginas: {count}")
        render_dir.mkdir(parents=True, exist_ok=True)
        texts: list[str] = []
        for index, page in enumerate(document):
            rect = page.rect
            if abs(rect.width - 595.28) > 1 or abs(rect.height - 841.89) > 1:
                raise ValueError(f"página {index + 1} não é A4 retrato: {rect}")
            extracted = page.get_text("text", sort=True)
            if len(extracted.strip()) < 20:
                raise ValueError(f"página {index + 1} em branco")
            texts.append(extracted)
            lines: list[tuple[float, ...]] = []
            for block in page.get_text("dict")["blocks"]:
                if "lines" not in block:
                    continue
                for line in block["lines"]:
                    if not any(span["text"].strip() for span in line["spans"]):
                        continue
                    bbox = tuple(line["bbox"])
                    if bbox[0] < rect.x0 - 1 or bbox[1] < rect.y0 - 1 or bbox[2] > rect.x1 + 1 or bbox[3] > rect.y1 + 1:
                        raise ValueError(f"texto fora da página {index + 1}: {bbox}")
                    if any(_overlap_fraction(bbox, prior) > 0.3 for prior in lines):
                        raise ValueError(f"sobreposição de linhas na página {index + 1}: {bbox}")
                    lines.append(bbox)
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
            pixmap.save(render_dir / f"page-{index + 1:02d}.png")
        text = "\n".join(texts)
        normalized = "".join(text.split())
        for section in expected:
            if "".join(section.split()) not in normalized:
                raise ValueError(f"conteúdo ausente no PDF: {section}")
        return {"pageCount": count, "text": text}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--pdf", type=Path)
    parser.add_argument("--render-dir", type=Path)
    parser.add_argument("--expected-pages", type=int)
    parser.add_argument("--expect", action="append", default=[])
    args = parser.parse_args()
    if pymupdf.VersionBind != "1.28.2":
        raise RuntimeError(f"PyMuPDF inesperado: {pymupdf.VersionBind}")
    if args.check_only:
        print(json.dumps({"PyMuPDF": pymupdf.VersionBind}))
        return
    if args.pdf is None or args.render_dir is None:
        parser.error("--pdf e --render-dir são obrigatórios")
    print(json.dumps(inspect_pdf(args.pdf, args.render_dir, args.expect, args.expected_pages)))


if __name__ == "__main__":
    main()
