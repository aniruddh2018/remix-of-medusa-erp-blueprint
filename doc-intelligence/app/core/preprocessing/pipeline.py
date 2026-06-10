import cv2
import numpy as np
from io import BytesIO
from typing import Optional
from app.core.preprocessing.step import PreprocessingStep
from app.core.preprocessing.filters import (
    GrayscaleStep,
    DenoiseStep,
    AdaptiveThresholdStep,
    SharpenStep,
    ContrastEnhanceStep,
)
from app.core.preprocessing.geometry import DeskewStep, PerspectiveCorrectionStep
from app.config.settings import settings
from app.utils.logging import logger


class PreprocessingPipeline:
    def __init__(self, debug: bool = False):
        self.steps: list[PreprocessingStep] = []
        self.debug = debug
        self.debug_outputs: list[np.ndarray] = []

    def add_step(self, step: PreprocessingStep) -> "PreprocessingPipeline":
        self.steps.append(step)
        return self

    def process(self, image_bytes: bytes) -> bytes:
        img = self._decode(image_bytes)
        logger.info("preprocessing_start", steps=len(self.steps))
        for step in self.steps:
            img = step.process(img)
            logger.debug("preprocessing_step", step=step.name(), shape=img.shape)
            if self.debug:
                self.debug_outputs.append(img.copy())
        return self._encode(img)

    def _decode(self, data: bytes) -> np.ndarray:
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image")
        return img

    def _encode(self, img: np.ndarray) -> bytes:
        success, buf = cv2.imencode(".png", img)
        if not success:
            raise ValueError("Failed to encode image")
        return buf.tobytes()


def create_default_preprocessing_pipeline(debug: bool = False) -> PreprocessingPipeline:
    pipeline = PreprocessingPipeline(debug=debug)
    pipeline.add_step(DenoiseStep(h=10))
    pipeline.add_step(ContrastEnhanceStep(clip_limit=2.0))
    pipeline.add_step(DeskewStep())
    pipeline.add_step(GrayscaleStep())
    pipeline.add_step(SharpenStep(strength=1.0))
    return pipeline


def create_text_optimized_pipeline(debug: bool = False) -> PreprocessingPipeline:
    pipeline = PreprocessingPipeline(debug=debug)
    pipeline.add_step(GrayscaleStep())
    pipeline.add_step(DenoiseStep(h=8))
    pipeline.add_step(AdaptiveThresholdStep(block_size=11, c=2))
    pipeline.add_step(DeskewStep())
    return pipeline
