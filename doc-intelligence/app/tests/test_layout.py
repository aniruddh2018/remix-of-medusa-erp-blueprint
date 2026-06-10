import pytest
from app.models.contracts import DocumentPage, OCRWord, OCRLine, BoundingBox
from app.core.layout.reconstructor import LayoutReconstructor


def _make_test_lines() -> list[OCRLine]:
    lines = []
    for i, (text, y) in enumerate([
        ("TAX INVOICE", 10),
        ("Supplier: ABC Pharma", 30),
        ("GST: 27AABCT1234Q1Z5", 50),
        ("", 65),
        ("Sr  Description    Qty  Rate  Amount", 80),
        ("1   DOLO 650 TAB   10   50.00  500.00", 100),
        ("2   TELZY 40 TAB   5    120.00 600.00", 120),
        ("", 140),
        ("Total: 1100.00", 155),
    ]):
        words = [
            OCRWord(text=text, confidence=0.99, bbox=BoundingBox(x1=10, y1=y, x2=200, y2=y + 18))
        ]
        lines.append(
            OCRLine(words=words, bbox=BoundingBox(x1=10, y1=y, x2=200, y2=y + 18), confidence=0.99)
        )
    return lines


class TestLayoutReconstructor:
    def test_paragraph_grouping(self):
        lines = _make_test_lines()
        page = DocumentPage(page_number=1, width=300, height=200, lines=lines)
        reconstructor = LayoutReconstructor(y_tolerance=8)
        result = reconstructor.reconstruct([page])
        assert len(result[0].paragraphs) >= 2

    def test_reading_order(self):
        lines = _make_test_lines()
        page = DocumentPage(page_number=1, width=300, height=200, lines=lines)
        reconstructor = LayoutReconstructor()
        result = reconstructor.reconstruct([page])
        for p in result[0].paragraphs:
            assert p.reading_order_index is not None
