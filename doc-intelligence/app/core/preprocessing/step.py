from abc import ABC, abstractmethod
import numpy as np


class PreprocessingStep(ABC):
    @abstractmethod
    def process(self, img: np.ndarray) -> np.ndarray:
        ...

    @abstractmethod
    def name(self) -> str:
        ...
