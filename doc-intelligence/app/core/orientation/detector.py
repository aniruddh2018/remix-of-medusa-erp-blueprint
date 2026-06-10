import cv2
import numpy as np
import math
from typing import Optional
from app.utils.logging import logger


class OrientationDetector:
    def __init__(self, confidence_threshold: float = 0.85):
        self.confidence_threshold = confidence_threshold

    def detect(self, image_bytes: bytes) -> tuple[float, float]:
        img = self._decode(image_bytes)
        gray = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, math.pi / 180, 150)
        if lines is None:
            return 0.0, 1.0
        vertical_angles = []
        horizontal_angles = []
        for line in lines:
            rho, theta = line[0]
            angle_degrees = theta * 180 / math.pi
            if angle_degrees < 2 or angle_degrees > 178:
                horizontal_angles.append(angle_degrees)
            elif 88 < angle_degrees < 92:
                vertical_angles.append(angle_degrees)
        dominant_angle = self._dominant_skew(horizontal_angles, vertical_angles)
        confidence = self._compute_confidence(horizontal_angles, vertical_angles)
        return dominant_angle, confidence

    def _dominant_skew(self, horizontal: list[float], vertical: list[float]) -> float:
        all_angles = horizontal + [a - 90 for a in vertical if a > 45]
        if not all_angles:
            return 0.0
        return float(np.median(all_angles))

    def _compute_confidence(self, horizontal: list[float], vertical: list[float]) -> float:
        total = len(horizontal) + len(vertical)
        if total == 0:
            return 0.0
        h_std = float(np.std(horizontal)) if len(horizontal) > 1 else 0.0
        v_std = float(np.std(vertical)) if len(vertical) > 1 else 0.0
        avg_std = (h_std + v_std) / 2
        conf = max(0.0, min(1.0, 1.0 - avg_std / 5.0))
        conf *= min(1.0, total / 30.0)
        return conf

    def _decode(self, data: bytes) -> np.ndarray:
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image for orientation detection")
        return img


def rotate_image(image_bytes: bytes, angle: float) -> bytes:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image for rotation")
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(img, matrix, (w, h), borderMode=cv2.BORDER_REPLICATE)
    success, buf = cv2.imencode(".png", rotated)
    if not success:
        raise ValueError("Failed to encode rotated image")
    return buf.tobytes()
