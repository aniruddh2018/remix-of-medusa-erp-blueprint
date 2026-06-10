from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    model_config = {"env_prefix": "DOCINTEL_", "env_file": ".env"}

    log_level: str = "INFO"
    ocr_provider: str = "paddle"
    paddle_lang: str = "en"
    paddle_use_gpu: bool = False
    paddle_det_db_thresh: float = 0.3
    paddle_det_db_box_thresh: float = 0.5
    paddle_rec_batch_size: int = 6
    max_upload_size_mb: int = 20
    orientation_confidence_threshold: float = 0.85
    layout_cluster_y_tolerance: int = 8
    table_min_column_gap: int = 10
    table_min_row_count: int = 3
    debug_output_dir: Optional[str] = None


settings = Settings()
