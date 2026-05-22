import asyncio
import numpy as np
import cv2
from concurrent.futures import ThreadPoolExecutor
from app.core.ocr.provider import OCRProvider
from app.models.contracts import DocumentPage, OCRWord, OCRLine, BoundingBox
from app.config.settings import settings
from app.utils.logging import logger


class PaddleOCRProvider(OCRProvider):
    def __init__(self):
        self._ocr = None
        self._executor = ThreadPoolExecutor(max_workers=1)

    def _get_ocr(self):
        if self._ocr is None:
            from paddleocr import PaddleOCR
            self._ocr = PaddleOCR(lang=settings.paddle_lang)
        return self._ocr

    async def extract(self, image_bytes: bytes) -> list[DocumentPage]:
        img = self._decode_image(image_bytes)
        h, w = img.shape[:2]
        loop = asyncio.get_event_loop()
        raw_results = await loop.run_in_executor(self._executor, self._run_ocr, img)
        page = self._build_page(raw_results, w, h)
        logger.info(
            "paddle_ocr_complete",
            words=len(page.words),
            lines=len(page.lines),
            avg_confidence=round(self._avg_confidence(page), 3),
        )
        return [page]

    def _run_ocr(self, img: np.ndarray) -> list:
        ocr = self._get_ocr()
        return ocr.predict(img)

    def _build_page(self, raw_results: list, width: float, height: float) -> DocumentPage:
        all_words: list[OCRWord] = []
        all_lines: list[OCRLine] = []

        if not raw_results or not raw_results[0]:
            return DocumentPage(page_number=1, width=width, height=height)

        page_result = raw_results[0]
        rec_texts = page_result.get("rec_texts", []) if isinstance(page_result, dict) else []
        rec_scores = page_result.get("rec_scores", []) if isinstance(page_result, dict) else []
        dt_polys = page_result.get("dt_polys", []) if isinstance(page_result, dict) else []

        if not rec_texts:
            return DocumentPage(page_number=1, width=width, height=height)

        reading_order = 0
        for i, (text, score, poly) in enumerate(zip(rec_texts, rec_scores, dt_polys)):
            x_coords = [p[0] for p in poly]
            y_coords = [p[1] for p in poly]
            word = OCRWord(
                text=text,
                confidence=float(score),
                bbox=BoundingBox(
                    x1=float(min(x_coords)),
                    y1=float(min(y_coords)),
                    x2=float(max(x_coords)),
                    y2=float(max(y_coords)),
                ),
                reading_order_index=reading_order,
            )
            reading_order += 1
            all_words.append(word)

        # Sort words by y then x for reading order
        all_words.sort(key=lambda w: (w.bbox.y1, w.bbox.x1))
        for i, w in enumerate(all_words):
            w.reading_order_index = i

        # Simple line grouping by y-overlap
        line_groups: list[list[OCRWord]] = []
        for word in all_words:
            placed = False
            for group in line_groups:
                if self._y_overlap(word.bbox, group[0].bbox):
                    group.append(word)
                    placed = True
                    break
            if not placed:
                line_groups.append([word])

        for group in line_groups:
            group.sort(key=lambda w: w.bbox.x1)
            line_bbox = self._union_bbox([w.bbox for w in group])
            line_conf = float(np.mean([w.confidence for w in group]))
            line = OCRLine(
                words=group,
                bbox=line_bbox,
                confidence=line_conf,
                reading_order_index=len(all_lines),
            )
            all_lines.append(line)

        return DocumentPage(
            page_number=1,
            width=width,
            height=height,
            words=all_words,
            lines=all_lines,
        )

    def _y_overlap(self, a: BoundingBox, b: BoundingBox, tolerance: float = 8) -> bool:
        return not (a.y2 + tolerance < b.y1 or b.y2 + tolerance < a.y1)

    def _union_bbox(self, bboxes: list[BoundingBox]) -> BoundingBox:
        return BoundingBox(
            x1=min(b.x1 for b in bboxes),
            y1=min(b.y1 for b in bboxes),
            x2=max(b.x2 for b in bboxes),
            y2=max(b.y2 for b in bboxes),
        )

    def _avg_confidence(self, page: DocumentPage) -> float:
        if not page.words:
            return 0.0
        return sum(w.confidence for w in page.words) / len(page.words)

    def _decode_image(self, data: bytes) -> np.ndarray:
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image for OCR")
        return img

    def name(self) -> str:
        return "paddle_ocr"
