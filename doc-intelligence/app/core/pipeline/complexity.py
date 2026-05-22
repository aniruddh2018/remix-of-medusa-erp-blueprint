import cv2
import numpy as np
from app.models.contracts import ComplexityScores, DocumentPage


class ComplexityScorer:
    def __init__(self):
        self.blur_threshold = 100.0
        self.rotation_threshold = 5.0
        self.ocr_confidence_threshold = 0.85
        self.table_density_threshold = 2

    def score(
        self,
        image_bytes: bytes,
        orientation: float,
        pages: list[DocumentPage],
    ) -> ComplexityScores:
        blur = self._blur_score(image_bytes)
        rotation = self._rotation_score(orientation)
        ocr_penalty = self._ocr_confidence_score(pages)
        table_density = self._table_density_score(pages)
        overall = self._compute_overall(blur, rotation, ocr_penalty, table_density)
        return ComplexityScores(
            blur_score=blur,
            rotation_score=rotation,
            ocr_confidence_penalty=ocr_penalty,
            table_density_score=table_density,
            overall=overall,
        )

    def _blur_score(self, image_bytes: bytes) -> float:
        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return 0.5
        laplacian_var = float(cv2.Laplacian(img, cv2.CV_64F).var())
        return max(0.0, min(1.0, 1.0 - laplacian_var / self.blur_threshold))

    def _rotation_score(self, orientation: float) -> float:
        return max(0.0, min(1.0, abs(orientation) / self.rotation_threshold))

    def _ocr_confidence_score(self, pages: list[DocumentPage]) -> float:
        if not pages or not pages[0].words:
            return 1.0
        avg_conf = sum(w.confidence for w in pages[0].words) / len(pages[0].words)
        return max(0.0, min(1.0, 1.0 - avg_conf / self.ocr_confidence_threshold))

    def _table_density_score(self, pages: list[DocumentPage]) -> float:
        table_count = sum(len(p.tables) for p in pages)
        return min(1.0, table_count / self.table_density_threshold)

    def _compute_overall(self, blur: float, rotation: float, ocr: float, tables: float) -> float:
        weights = {"blur": 0.25, "rotation": 0.15, "ocr": 0.35, "tables": 0.25}
        return blur * weights["blur"] + rotation * weights["rotation"] + ocr * weights["ocr"] + tables * weights["tables"]
