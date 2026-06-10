import pytest
from app.models.contracts import DocumentPage, OCRWord, OCRLine, BoundingBox


def _make_ocr_words(words_data: list[tuple[str, float, float, float, float, float]]) -> list[OCRWord]:
    return [
        OCRWord(
            text=text,
            confidence=conf,
            bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
        )
        for text, conf, x1, y1, x2, y2 in words_data
    ]


def _make_lines_from_words(words: list[OCRWord]) -> list[OCRLine]:
    if not words:
        return []
    return [
        OCRLine(
            words=[w],
            bbox=w.bbox,
            confidence=w.confidence,
        )
        for w in words
    ]


class TestDocumentPage:
    def test_empty_page(self):
        page = DocumentPage(page_number=1, width=800, height=600)
        assert page.words == []
        assert page.lines == []
        assert page.tables == []

    def test_page_with_words(self):
        words = _make_ocr_words([("HELLO", 0.99, 10, 10, 50, 30)])
        lines = _make_lines_from_words(words)
        page = DocumentPage(page_number=1, width=800, height=600, words=words, lines=lines)
        assert len(page.words) == 1
        assert page.words[0].text == "HELLO"


class TestBoundingBox:
    def test_properties(self):
        bbox = BoundingBox(x1=10, y1=20, x2=50, y2=70)
        assert bbox.width == 40
        assert bbox.height == 50
        assert bbox.center_x == 30
        assert bbox.center_y == 45


class TestOCRLine:
    def test_text_property(self):
        words = _make_ocr_words([
            ("DOLO", 0.98, 10, 10, 40, 25),
            ("650", 0.97, 45, 10, 70, 25),
        ])
        line = OCRLine(words=words, bbox=BoundingBox(x1=10, y1=10, x2=70, y2=25), confidence=0.975)
        assert line.text == "DOLO 650"
