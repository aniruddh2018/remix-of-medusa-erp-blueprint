from app.core.layout.provider import LayoutReconstructionProvider
from app.core.layout.reconstructor import LayoutReconstructor
from app.core.tables.detector import TableDetector
from app.models.contracts import DocumentPage


class SpatialLayoutProvider(LayoutReconstructionProvider):
    def __init__(self):
        self.layout_reconstructor = LayoutReconstructor()
        self.table_detector = TableDetector()

    async def reconstruct(self, pages: list[DocumentPage]) -> list[DocumentPage]:
        pages = self.layout_reconstructor.reconstruct(pages)
        pages = self.table_detector.detect(pages)
        return pages

    def name(self) -> str:
        return "spatial_layout_provider"
