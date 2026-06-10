import pytest
from app.models.contracts import DocumentPage, OCRWord, OCRTable, BoundingBox
from app.core.tables.detector import TableDetector


def _make_table_words() -> list[OCRWord]:
    data = [
        ("Item", 0.99, 50, 10, 100, 25),
        ("Qty", 0.99, 150, 10, 180, 25),
        ("Rate", 0.99, 220, 10, 260, 25),
        ("DOLO", 0.98, 50, 30, 100, 45),
        ("10", 0.97, 150, 30, 170, 45),
        ("50.00", 0.96, 220, 30, 260, 45),
        ("TELZY", 0.98, 50, 50, 100, 65),
        ("5", 0.97, 150, 50, 160, 65),
        ("120.00", 0.96, 220, 50, 270, 65),
    ]
    return [
        OCRWord(text=t, confidence=c, bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2))
        for t, c, x1, y1, x2, y2 in data
    ]


class TestTableDetector:
    def test_detect_table_region(self):
        words = _make_table_words()
        page = DocumentPage(page_number=1, width=300, height=100, words=words)
        detector = TableDetector()
        result = detector.detect([page])
        assert len(result[0].tables) >= 1

    def test_table_content(self):
        words = _make_table_words()
        page = DocumentPage(page_number=1, width=300, height=100, words=words)
        detector = TableDetector()
        result = detector.detect([page])
        if result[0].tables:
            table = result[0].tables[0]
            assert len(table.rows) >= 3
            assert "DOLO" in " ".join(table.rows[1])
