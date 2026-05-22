import cv2
import numpy as np
import math
from app.core.preprocessing.step import PreprocessingStep


class DeskewStep(PreprocessingStep):
    def process(self, img: np.ndarray) -> np.ndarray:
        angle = self._detect_skew_angle(img)
        if abs(angle) < 0.3:
            return img
        return self._rotate_image(img, angle)

    def _detect_skew_angle(self, img: np.ndarray) -> float:
        gray = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, math.pi / 180, 200)
        if lines is None:
            return 0.0
        angles = []
        for line in lines:
            rho, theta = line[0]
            angle = theta * 180 / math.pi
            if 0 < angle < 45 or 135 < angle < 180:
                angles.append(angle)
        if not angles:
            return 0.0
        median_angle = np.median(angles)
        if median_angle > 90:
            median_angle -= 180
        return median_angle

    def _rotate_image(self, img: np.ndarray, angle: float) -> np.ndarray:
        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        cos = abs(rotation_matrix[0, 0])
        sin = abs(rotation_matrix[0, 1])
        new_w = int(h * sin + w * cos)
        new_h = int(h * cos + w * sin)
        rotation_matrix[0, 2] += new_w / 2 - center[0]
        rotation_matrix[1, 2] += new_h / 2 - center[1]
        return cv2.warpAffine(img, rotation_matrix, (new_w, new_h), borderMode=cv2.BORDER_REPLICATE)

    def name(self) -> str:
        return "deskew"


class PerspectiveCorrectionStep(PreprocessingStep):
    def process(self, img: np.ndarray) -> np.ndarray:
        contour = self._find_largest_contour(img)
        if contour is None:
            return img
        corners = self._get_corners(contour)
        if len(corners) != 4:
            return img
        return self._warp_perspective(img, corners)

    def _find_largest_contour(self, img: np.ndarray):
        gray = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
        return max(contours, key=cv2.contourArea)

    def _get_corners(self, contour) -> np.ndarray:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) != 4:
            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.04 * peri, True)
        if len(approx) != 4:
            rect = cv2.minAreaRect(contour)
            approx = cv2.boxPoints(rect)
        return self._order_corners(approx)

    def _order_corners(self, pts: np.ndarray) -> np.ndarray:
        pts = pts.reshape(4, 2)
        rect = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        return rect

    def _warp_perspective(self, img: np.ndarray, corners: np.ndarray) -> np.ndarray:
        tl, tr, br, bl = corners
        width_a = np.linalg.norm(br - bl)
        width_b = np.linalg.norm(tr - tl)
        max_width = max(int(width_a), int(width_b))
        height_a = np.linalg.norm(tr - br)
        height_b = np.linalg.norm(tl - bl)
        max_height = max(int(height_a), int(height_b))
        dst = np.array(
            [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(corners.astype(np.float32), dst)
        return cv2.warpPerspective(img, matrix, (max_width, max_height))

    def name(self) -> str:
        return "perspective_correction"
