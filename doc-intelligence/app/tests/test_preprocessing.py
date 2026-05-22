import numpy as np
import pytest
from io import BytesIO

cv2 = pytest.importorskip("cv2", reason="opencv not installed")
from app.core.preprocessing.filters import GrayscaleStep, DenoiseStep, SharpenStep, ContrastEnhanceStep
from app.core.preprocessing.geometry import DeskewStep
from app.core.preprocessing.pipeline import PreprocessingPipeline


def _make_test_image(w: int = 300, h: int = 200) -> bytes:
    img = np.ones((h, w, 3), dtype=np.uint8) * 255
    cv2.putText(img, "TEST", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 0), 3)
    success, buf = cv2.imencode(".png", img)
    return buf.tobytes()


class TestGrayscaleStep:
    def test_color_to_gray(self):
        img_bytes = _make_test_image()
        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        step = GrayscaleStep()
        result = step.process(img)
        assert len(result.shape) == 2

    def test_gray_passthrough(self):
        img = np.ones((100, 100), dtype=np.uint8) * 128
        step = GrayscaleStep()
        result = step.process(img)
        assert np.array_equal(result, img)


class TestDenoiseStep:
    def test_denoise_color(self):
        img_bytes = _make_test_image()
        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        step = DenoiseStep()
        result = step.process(img)
        assert result.shape == img.shape


class TestDeskewStep:
    def test_deskew_straight(self):
        img_bytes = _make_test_image()
        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        step = DeskewStep()
        result = step.process(img)
        assert result.shape[0] > 0 and result.shape[1] > 0


class TestPreprocessingPipeline:
    def test_basic_pipeline(self):
        img_bytes = _make_test_image()
        pipeline = PreprocessingPipeline()
        pipeline.add_step(GrayscaleStep())
        pipeline.add_step(SharpenStep(strength=1.0))
        result = pipeline.process(img_bytes)
        assert len(result) > 0
        assert isinstance(result, bytes)

    def test_pipeline_debug(self):
        img_bytes = _make_test_image()
        pipeline = PreprocessingPipeline(debug=True)
        pipeline.add_step(GrayscaleStep())
        pipeline.process(img_bytes)
        assert len(pipeline.debug_outputs) == 1
