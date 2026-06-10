from abc import ABC, abstractmethod
from app.models.contracts import DocumentPage


class OCRProvider(ABC):
    @abstractmethod
    async def extract(self, image_bytes: bytes) -> list[DocumentPage]:
        ...

    @abstractmethod
    def name(self) -> str:
        ...
