from typing import Optional
import numpy as np
from collections import defaultdict
from app.models.contracts import DocumentPage, OCRTable, OCRWord, BoundingBox
from app.config.settings import settings
from app.utils.logging import logger


class TableDetector:
    def __init__(
        self,
        min_column_gap: int = None,
        min_row_count: int = None,
    ):
        self.min_column_gap = min_column_gap or settings.table_min_column_gap
        self.min_row_count = min_row_count or settings.table_min_row_count

    def detect(self, pages: list[DocumentPage]) -> list[DocumentPage]:
        for page in pages:
            page.tables = self._extract_tables(page)
            logger.debug("tables_detected", page=page.page_number, count=len(page.tables))
        return pages

    def _extract_tables(self, page: DocumentPage) -> list[OCRTable]:
        if not page.words:
            return []
        grid_rows = self._cluster_into_rows(page.words)
        candidate_regions = self._find_dense_regions(grid_rows, page.words)
        tables: list[OCRTable] = []
        for region_words, region_rows in candidate_regions:
            if len(region_rows) < self.min_row_count:
                continue
            table = self._build_table(region_words, region_rows)
            if table:
                tables.append(table)
        return tables

    def _cluster_into_rows(self, words: list[OCRWord]) -> dict[int, list[OCRWord]]:
        rows: dict[int, list[OCRWord]] = defaultdict(list)
        sorted_words = sorted(words, key=lambda w: (w.bbox.y1, w.bbox.x1))
        if not sorted_words:
            return rows
        current_row = 0
        row_y_bottom = sorted_words[0].bbox.y2
        for word in sorted_words:
            if word.bbox.y1 > row_y_bottom + self.min_column_gap:
                current_row += 1
                row_y_bottom = word.bbox.y2
            else:
                row_y_bottom = max(row_y_bottom, word.bbox.y2)
            rows[current_row].append(word)
        return rows

    def _find_dense_regions(
        self, grid_rows: dict[int, list[OCRWord]], all_words: list[OCRWord]
    ) -> list[tuple[list[OCRWord], list[list[OCRWord]]]]:
        sorted_row_ids = sorted(grid_rows.keys())
        regions = []
        i = 0
        while i < len(sorted_row_ids):
            row_id = sorted_row_ids[i]
            row = grid_rows[row_id]
            if len(row) >= 3:
                region_start = i
                while i < len(sorted_row_ids) and len(grid_rows[sorted_row_ids[i]]) >= 2:
                    i += 1
                region_end = i
                if region_end - region_start >= self.min_row_count:
                    region_row_ids = sorted_row_ids[region_start:region_end]
                    region_rows = [grid_rows[rid] for rid in region_row_ids]
                    region_words = [w for r in region_rows for w in r]
                    regions.append((region_words, region_rows))
            else:
                i += 1
        return regions

    def _build_table(self, words: list[OCRWord], rows: list[list[OCRWord]]) -> Optional[OCRTable]:
        col_boundaries = self._find_columns(words)
        if len(col_boundaries) < 2:
            return None
        table_rows: list[list[str]] = []
        for row_words in rows:
            cells = self._assign_to_columns(row_words, col_boundaries)
            table_rows.append(cells)
        if not table_rows:
            return None
        bbox = self._union_bbox(words)
        confidence = self._table_confidence(table_rows)
        row_bboxes = [self._union_bbox(r) for r in rows]
        header_row = table_rows[0] if table_rows else None
        return OCRTable(
            rows=table_rows,
            header_row=header_row,
            bbox=bbox,
            confidence=confidence,
            row_bboxes=row_bboxes,
            column_boundaries=col_boundaries,
        )

    def _find_columns(self, words: list[OCRWord]) -> list[float]:
        x_centers = sorted(w.bbox.center_x for w in words)
        if not x_centers:
            return []
        clusters = [[x_centers[0]]]
        for x in x_centers[1:]:
            if x - clusters[-1][-1] < self.min_column_gap * 3:
                clusters[-1].append(x)
            else:
                clusters.append([x])
        boundaries = []
        for i in range(len(clusters) - 1):
            mid = (clusters[i][-1] + clusters[i + 1][0]) / 2
            boundaries.append(mid)
        return boundaries

    def _assign_to_columns(self, words: list[OCRWord], col_boundaries: list[float]) -> list[str]:
        cols: dict[int, list[str]] = defaultdict(list)
        for word in sorted(words, key=lambda w: w.bbox.center_x):
            col_idx = 0
            for boundary in col_boundaries:
                if word.bbox.center_x > boundary:
                    col_idx += 1
                else:
                    break
            cols[col_idx].append(word.text)
        return [" ".join(cols.get(i, [])) for i in range(len(col_boundaries) + 1)]

    def _union_bbox(self, words: list[OCRWord]) -> BoundingBox:
        return BoundingBox(
            x1=min(w.bbox.x1 for w in words),
            y1=min(w.bbox.y1 for w in words),
            x2=max(w.bbox.x2 for w in words),
            y2=max(w.bbox.y2 for w in words),
        )

    def _table_confidence(self, table_rows: list[list[str]]) -> float:
        if not table_rows:
            return 0.0
        filled_cells = sum(1 for row in table_rows for cell in row if cell.strip())
        total_cells = sum(len(row) for row in table_rows)
        if total_cells == 0:
            return 0.0
        return filled_cells / total_cells
