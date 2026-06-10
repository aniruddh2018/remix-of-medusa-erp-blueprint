from app.models.contracts import DocumentPage, OCRLine, OCRParagraph, BoundingBox
from app.config.settings import settings
from app.utils.logging import logger


class LayoutReconstructor:
    def __init__(self, y_tolerance: int = None):
        self.y_tolerance = y_tolerance or settings.layout_cluster_y_tolerance

    def reconstruct(self, pages: list[DocumentPage]) -> list[DocumentPage]:
        for page in pages:
            self._build_paragraphs(page)
            self._assign_reading_order(page)
            logger.debug(
                "layout_reconstructed",
                page=page.page_number,
                lines=len(page.lines),
                paragraphs=len(page.paragraphs),
            )
        return pages

    def _build_paragraphs(self, page: DocumentPage):
        if not page.lines:
            return
        sorted_lines = sorted(page.lines, key=lambda l: (l.bbox.y1, l.bbox.x1))
        paragraphs: list[list[OCRLine]] = []
        current_para = [sorted_lines[0]]
        for line in sorted_lines[1:]:
            prev = current_para[-1]
            y_gap = line.bbox.y1 - prev.bbox.y2
            if y_gap < self.y_tolerance * 3:
                current_para.append(line)
            else:
                paragraphs.append(current_para)
                current_para = [line]
        paragraphs.append(current_para)
        page.paragraphs = []
        for idx, para_lines in enumerate(paragraphs):
            bbox = self._union_bbox([l.bbox for l in para_lines])
            page.paragraphs.append(
                OCRParagraph(lines=para_lines, bbox=bbox, reading_order_index=idx)
            )

    def _assign_reading_order(self, page: DocumentPage):
        all_items: list[tuple[BoundingBox, int, str]] = []
        for p in page.paragraphs:
            all_items.append((p.bbox, 0, "paragraph"))
        for t in page.tables:
            all_items.append((t.bbox, 0, "table"))
        all_items.sort(key=lambda x: (x[0].y1, x[0].x1))
        for idx, (_, _, _) in enumerate(all_items):
            pass
        for idx, p in enumerate(page.paragraphs):
            p.reading_order_index = idx

    def _union_bbox(self, bboxes: list[BoundingBox]) -> BoundingBox:
        return BoundingBox(
            x1=min(b.x1 for b in bboxes),
            y1=min(b.y1 for b in bboxes),
            x2=max(b.x2 for b in bboxes),
            y2=max(b.y2 for b in bboxes),
        )
