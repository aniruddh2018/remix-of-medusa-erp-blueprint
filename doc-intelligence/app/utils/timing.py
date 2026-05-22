import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator


def now_ms() -> float:
    return time.perf_counter() * 1000


class StageTimer:
    def __init__(self):
        self.timings: dict[str, float] = {}

    def record(self, stage: str, elapsed_ms: float):
        self.timings[stage] = elapsed_ms

    def total_ms(self) -> float:
        return sum(self.timings.values())


@asynccontextmanager
async def stage_timing(timer: StageTimer, stage: str) -> AsyncGenerator[None, None]:
    start = now_ms()
    try:
        yield
    finally:
        elapsed = now_ms() - start
        timer.record(stage, elapsed)
