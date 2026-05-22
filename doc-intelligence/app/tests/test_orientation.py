import numpy as np
import pytest
from io import BytesIO

cv2 = pytest.importorskip("cv2", reason="opencv not installed")
from app.core.orientation.detector import OrientationDetector


def _make_straight_image() -> bytes:
    img = np.ones((400, 300, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 20), (280, 380), (0, 0, 0), 2)
    cv2.line(img, (30, 50), (270, 50), (0, 0, 0), 1)
    cv2.line(img, (30, 100), (270, 100), (0, 0, 0), 1)
    cv2.line(img, (50, 30), (50, 370), (0, 0, 0), 1)
    success, buf = cv2.imencode(".png", img)
    return buf.tobytes()


class TestOrientationDetector:
    def test_detect_straight(self):
        img_bytes = _make_straight_image()
        detector = OrientationDetector()
        angle, conf = detector.detect(img_bytes)
        assert isinstance(angle, float)
        assert 0.0 <= conf <= 1.0

    def test_detect_custom_threshold(self):
        img_bytes = _make_straight_image()
        detector = OrientationDetector(confidence_threshold=0.5)
        angle, conf = detector.detect(img_bytes)
        assert isinstance(angle, float)
