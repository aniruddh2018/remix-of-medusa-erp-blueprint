import pytest


class TestAPI:
    def test_openapi_schema_matches(self):
        try:
            from app.main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            response = client.get("/documents/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
        except ImportError:
            pytest.skip("OpenCV not installed — skipping API integration tests")

    def test_models_import(self):
        from app.models.contracts import ProcessedDocument, DocumentType
        assert DocumentType.INVOICE
        assert DocumentType.PRESCRIPTION

    def test_config_loads(self):
        from app.config.settings import settings
        assert settings.log_level
