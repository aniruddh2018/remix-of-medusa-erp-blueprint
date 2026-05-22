from abc import ABC, abstractmethod
from app.models.contracts import DocumentType, PipelineContext


class DocumentClassifier(ABC):
    @abstractmethod
    async def classify(self, ctx: PipelineContext) -> tuple[DocumentType, float]:
        ...

    @abstractmethod
    def name(self) -> str:
        ...
