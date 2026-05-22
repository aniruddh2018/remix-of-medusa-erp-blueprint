import cv2
import numpy as np
from io import BytesIO
from PIL import Image


def bytes_to_cv2(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image from bytes")
    return img


def cv2_to_bytes(img: np.ndarray, ext: str = ".png") -> bytes:
    success, buf = cv2.imencode(ext, img)
    if not success:
        raise ValueError("Failed to encode image to bytes")
    return buf.tobytes()


def pil_to_cv2(pil_img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


def cv2_to_pil(img: np.ndarray) -> Image.Image:
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)
