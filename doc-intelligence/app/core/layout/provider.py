from abc import ABC, abstractmethod
from app.models.contracts import DocumentPage


class LayoutReconstructionProvider(ABC):
    @abstractmethod
    async def reconstruct(self, pages: list[DocumentPage]) -> list[DocumentPage]:
        ...

    @abstractmethod
    def name(self) -> str:
        ...
