import cv2
import numpy as np
from app.core.preprocessing.step import PreprocessingStep


class GrayscaleStep(PreprocessingStep):
    def process(self, img: np.ndarray) -> np.ndarray:
        if len(img.shape) == 2:
            return img
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    def name(self) -> str:
        return "grayscale"


class DenoiseStep(PreprocessingStep):
    def __init__(self, h: int = 10, template_window: int = 7, search_window: int = 21):
        self.h = h
        self.template_window = template_window
        self.search_window = search_window

    def process(self, img: np.ndarray) -> np.ndarray:
        if len(img.shape) == 3:
            return cv2.fastNlMeansDenoisingColored(img, None, self.h, self.h, self.template_window, self.search_window)
        return cv2.fastNlMeansDenoising(img, None, self.h, self.template_window, self.search_window)

    def name(self) -> str:
        return "denoise"


class AdaptiveThresholdStep(PreprocessingStep):
    def __init__(self, block_size: int = 11, c: int = 2):
        self.block_size = block_size
        self.c = c

    def process(self, img: np.ndarray) -> np.ndarray:
        gray = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, self.block_size, self.c
        )

    def name(self) -> str:
        return "adaptive_threshold"


class SharpenStep(PreprocessingStep):
    def __init__(self, strength: float = 1.5):
        self.kernel = np.array([[0, -1, 0], [-1, strength + 4, -1], [0, -1, 0]]) / strength

    def process(self, img: np.ndarray) -> np.ndarray:
        return cv2.filter2D(img, -1, self.kernel)

    def name(self) -> str:
        return "sharpen"


class ContrastEnhanceStep(PreprocessingStep):
    def __init__(self, clip_limit: float = 2.0, tile_grid_size: tuple[int, int] = (8, 8)):
        self.clip_limit = clip_limit
        self.tile_grid_size = tile_grid_size

    def process(self, img: np.ndarray) -> np.ndarray:
        gray = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=self.clip_limit, tileGridSize=self.tile_grid_size)
        return clahe.apply(gray)

    def name(self) -> str:
        return "contrast_enhance"
