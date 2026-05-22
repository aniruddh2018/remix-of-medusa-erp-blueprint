import pytest
import numpy as np

cv2 = pytest.importorskip("cv2", reason="opencv not installed")
from app.models.contracts import DocumentPage, OCRWord, BoundingBox
from app.core.pipeline.complexity import ComplexityScorer


def _make_image_bytes(blur_sigma: float = 0) -> bytes:
    img = np.ones((200, 300, 3), dtype=np.uint8) * 255
    cv2.putText(img, "TEST TEXT", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 0), 3)
    if blur_sigma > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur_sigma)
    success, buf = cv2.imencode(".png", img)
    return buf.tobytes()


def _make_pages(confidence: float = 0.95) -> list[DocumentPage]:
    words = [
        OCRWord(text=f"WORD_{i}", confidence=confidence, bbox=BoundingBox(x1=10, y1=i * 20, x2=100, y2=i * 20 + 18))
        for i in range(5)
    ]
    return [DocumentPage(page_number=1, width=300, height=200, words=words)]


class TestComplexityScorer:
    def test_clean_image(self):
        scorer = ComplexityScorer()
        img = _make_image_bytes(blur_sigma=0)
        pages = _make_pages(confidence=0.95)
        scores = scorer.score(img, 0.0, pages)
        assert scores.overall < 0.5

    def test_blurry_image(self):
        scorer = ComplexityScorer()
        img = _make_image_bytes(blur_sigma=5.0)
        pages = _make_pages(confidence=0.85)
        scores = scorer.score(img, 0.0, pages)
        assert scores.blur_score > 0.1

    def test_rotated_document(self):
        scorer = ComplexityScorer()
        img = _make_image_bytes()
        pages = _make_pages()
        scores = scorer.score(img, 15.0, pages)
        assert scores.rotation_score > 0.5

    def test_low_ocr_confidence(self):
        scorer = ComplexityScorer()
        img = _make_image_bytes()
        pages = _make_pages(confidence=0.50)
        scores = scorer.score(img, 0.0, pages)
        assert scores.ocr_confidence_penalty > 0.3
