# Standalone API Specification - ERP Data Import System

## Overview
This document provides a complete API specification for implementing the AI-powered ERP data import system as a standalone service. All endpoints, schemas, and authentication mechanisms are documented for independent implementation.

## Base URL
```
Production: https://api.erp-import-service.com/v1
Staging: https://staging-api.erp-import-service.com/v1
Local: http://localhost:3000/v1
```

## Authentication
All API requests require authentication using Bearer tokens.

### Authentication Headers
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Token Endpoints

#### POST /auth/login
Authenticate and receive access token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "company_id": "optional_company_id"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "id": "usr_1234567890",
    "email": "user@example.com",
    "company_id": "cmp_1234567890",
    "role": "admin"
  }
}
```

#### POST /auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

#### POST /auth/logout
Invalidate current session.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "message": "Successfully logged out"
}
```

---

## Import Jobs API

### POST /import/jobs
Create a new import job.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_name": "Product Import from Tally",
  "source_type": "csv",
  "target_entity": "products",
  "file_url": "https://storage.example.com/imports/products_export.csv",
  "file_metadata": {
    "filename": "products_export.csv",
    "size": 1024000,
    "row_count": 1250,
    "encoding": "UTF-8"
  },
  "mapping_template_id": "tpl_tally_products_v1",
  "company_id": "cmp_1234567890",
  "business_type": "pharmacy",
  "options": {
    "skip_validation": false,
    "stop_on_error": false,
    "create_missing_lookups": true,
    "dry_run": false
  }
}
```

**Response (201 Created):**
```json
{
  "id": "job_1234567890",
  "job_name": "Product Import from Tally",
  "status": "pending",
  "source_type": "csv",
  "target_entity": "products",
  "created_at": "2026-05-13T14:30:00Z",
  "created_by": "usr_1234567890",
  "company_id": "cmp_1234567890",
  "progress": {
    "current_step": "upload",
    "percentage": 0
  }
}
```

### GET /import/jobs
List all import jobs with filtering and pagination.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `company_id` (string, required): Filter by company
- `status` (string, optional): Filter by status (pending, processing, completed, failed)
- `target_entity` (string, optional): Filter by target entity
- `page` (integer, optional): Page number (default: 1)
- `limit` (integer, optional): Items per page (default: 20)
- `sort_by` (string, optional): Sort field (default: created_at)
- `sort_order` (string, optional): Sort direction (asc, desc, default: desc)

**Response (200 OK):**
```json
{
  "jobs": [
    {
      "id": "job_1234567890",
      "job_name": "Product Import from Tally",
      "status": "completed",
      "source_type": "csv",
      "target_entity": "products",
      "created_at": "2026-05-13T14:30:00Z",
      "completed_at": "2026-05-13T14:35:00Z",
      "progress": {
        "current_step": "completed",
        "percentage": 100
      },
      "summary": {
        "total_rows": 1250,
        "successful_rows": 1238,
        "failed_rows": 12,
        "quality_score": 87
      }
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "total_pages": 3
  }
}
```

### GET /import/jobs/{job_id}
Get details of a specific import job.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "id": "job_1234567890",
  "job_name": "Product Import from Tally",
  "status": "completed",
  "source_type": "csv",
  "target_entity": "products",
  "created_at": "2026-05-13T14:30:00Z",
  "completed_at": "2026-05-13T14:35:00Z",
  "created_by": "usr_1234567890",
  "company_id": "cmp_1234567890",
  "business_type": "pharmacy",
  "file_url": "https://storage.example.com/imports/products_export.csv",
  "mapping_template_id": "tpl_tally_products_v1",
  "progress": {
    "current_step": "completed",
    "percentage": 100,
    "steps": [
      {
        "name": "upload",
        "status": "completed",
        "started_at": "2026-05-13T14:30:00Z",
        "completed_at": "2026-05-13T14:30:05Z"
      },
      {
        "name": "schema_detection",
        "status": "completed",
        "started_at": "2026-05-13T14:30:05Z",
        "completed_at": "2026-05-13T14:30:15Z"
      },
      {
        "name": "mapping",
        "status": "completed",
        "started_at": "2026-05-13T14:30:15Z",
        "completed_at": "2026-05-13T14:31:00Z"
      },
      {
        "name": "transformation",
        "status": "completed",
        "started_at": "2026-05-13T14:31:00Z",
        "completed_at": "2026-05-13T14:32:00Z"
      },
      {
        "name": "validation",
        "status": "completed",
        "started_at": "2026-05-13T14:32:00Z",
        "completed_at": "2026-05-13T14:33:00Z"
      },
      {
        "name": "import",
        "status": "completed",
        "started_at": "2026-05-13T14:33:00Z",
        "completed_at": "2026-05-13T14:35:00Z"
      }
    ]
  },
  "summary": {
    "total_rows": 1250,
    "successful_rows": 1238,
    "failed_rows": 12,
    "skipped_rows": 0,
    "quality_score": 87,
    "quality_metrics": {
      "completeness": 92,
      "accuracy": 85,
      "consistency": 88,
      "uniqueness": 95
    }
  },
  "options": {
    "skip_validation": false,
    "stop_on_error": false,
    "create_missing_lookups": true,
    "dry_run": false
  }
}
```

### PUT /import/jobs/{job_id}
Update import job configuration (only allowed for pending jobs).

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_name": "Updated Product Import",
  "mapping_template_id": "tpl_tally_products_v2",
  "options": {
    "skip_validation": true,
    "stop_on_error": true
  }
}
```

**Response (200 OK):**
```json
{
  "id": "job_1234567890",
  "job_name": "Updated Product Import",
  "status": "pending",
  "mapping_template_id": "tpl_tally_products_v2",
  "updated_at": "2026-05-13T14:31:00Z"
}
```

### DELETE /import/jobs/{job_id}
Cancel or delete an import job.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "id": "job_1234567890",
  "status": "cancelled",
  "message": "Job cancelled successfully"
}
```

### POST /import/jobs/{job_id}/start
Start processing an import job.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "id": "job_1234567890",
  "status": "processing",
  "started_at": "2026-05-13T14:30:00Z",
  "message": "Job started successfully"
}
```

---

## File Upload API

### POST /import/upload
Upload a file for import.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: multipart/form-data
```

**Request Body (multipart/form-data):**
- `file` (file, required): The file to upload
- `company_id` (string, required): Company ID
- `job_name` (string, optional): Name for the import job

**Response (201 Created):**
```json
{
  "file_id": "file_1234567890",
  "file_url": "https://storage.example.com/imports/file_1234567890.csv",
  "filename": "products_export.csv",
  "size": 1024000,
  "content_type": "text/csv",
  "encoding": "UTF-8",
  "uploaded_at": "2026-05-13T14:30:00Z",
  "metadata": {
    "row_count": 1250,
    "column_count": 15,
    "has_header": true,
    "encoding_detected": "UTF-8",
    "delimiter": ",",
    "sample_rows": [
      {
        "row_number": 1,
        "data": {
          "name": "Paracetamol",
          "manufacturer": "Sun Pharma",
          "mrp": "25.50"
        }
      }
    ]
  }
}
```

### GET /import/upload/{file_id}
Get file metadata.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "file_id": "file_1234567890",
  "file_url": "https://storage.example.com/imports/file_1234567890.csv",
  "filename": "products_export.csv",
  "size": 1024000,
  "content_type": "text/csv",
  "encoding": "UTF-8",
  "uploaded_at": "2026-05-13T14:30:00Z",
  "metadata": {
    "row_count": 1250,
    "column_count": 15,
    "has_header": true,
    "encoding_detected": "UTF-8",
    "delimiter": ",",
    "columns": [
      {
        "name": "name",
        "index": 0,
        "type": "string",
        "sample_values": ["Paracetamol", "Amoxicillin", "Ibuprofen"]
      },
      {
        "name": "manufacturer",
        "index": 1,
        "type": "string",
        "sample_values": ["Sun Pharma", "Cipla", "Dr. Reddy's"]
      }
    ]
  }
}
```

---

## Schema Detection API

### POST /import/schema/detect
Detect schema from uploaded file.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "file_id": "file_1234567890",
  "business_type": "pharmacy",
  "options": {
    "sample_size": 100,
    "detect_types": true,
    "detect_patterns": true
  }
}
```

**Response (200 OK):**
```json
{
  "file_id": "file_1234567890",
  "detected_entity": "products",
  "confidence": 0.92,
  "source_schema": {
    "columns": [
      {
        "name": "name",
        "index": 0,
        "type": "string",
        "nullable": false,
        "sample_values": ["Paracetamol", "Amoxicillin", "Ibuprofen"],
        "patterns": ["^[A-Za-z\\s]+$"],
        "statistics": {
          "unique_count": 1200,
          "null_count": 0,
          "avg_length": 12.5
        }
      },
      {
        "name": "manufacturer",
        "index": 1,
        "type": "string",
        "nullable": true,
        "sample_values": ["Sun Pharma", "Cipla", "Dr. Reddy's"],
        "patterns": ["^[A-Za-z\\s\\.]+$"],
        "statistics": {
          "unique_count": 45,
          "null_count": 50,
          "avg_length": 15.2
        }
      },
      {
        "name": "mrp",
        "index": 2,
        "type": "decimal",
        "nullable": false,
        "sample_values": ["25.50", "45.00", "32.00"],
        "patterns": ["^\\d+\\.\\d{2}$"],
        "statistics": {
          "min": 5.00,
          "max": 500.00,
          "avg": 45.50
        }
      }
    ],
    "row_count": 1250,
    "has_header": true,
    "encoding": "UTF-8",
    "delimiter": ","
  },
  "suggested_mappings": [
    {
      "source_field": "name",
      "target_field": "name",
      "confidence": 0.98,
      "transformation": null
    },
    {
      "source_field": "manufacturer",
      "target_field": "manufacturer_id",
      "confidence": 0.85,
      "transformation": {
        "type": "lookup",
        "lookup_table": "manufacturers",
        "match_field": "name"
      }
    },
    {
      "source_field": "mrp",
      "target_field": "mrp",
      "confidence": 0.95,
      "transformation": {
        "type": "cast",
        "target_type": "decimal"
      }
    }
  ]
}
```

---

## Mapping API

### POST /import/mapping/generate
Generate field mappings using AI.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "file_id": "file_1234567890",
  "target_entity": "products",
  "business_type": "pharmacy",
  "source_schema": {
    "columns": [
      {
        "name": "name",
        "type": "string"
      },
      {
        "name": "manufacturer",
        "type": "string"
      },
      {
        "name": "mrp",
        "type": "decimal"
      }
    ]
  },
  "options": {
    "use_ai": true,
    "use_templates": true,
    "confidence_threshold": 0.7
  }
}
```

**Response (200 OK):**
```json
{
  "mapping_id": "map_1234567890",
  "target_entity": "products",
  "business_type": "pharmacy",
  "mappings": [
    {
      "id": "map_field_1",
      "source_field": "name",
      "target_field": "name",
      "confidence": 0.98,
      "match_type": "ai_suggested",
      "transformation": null,
      "required": true
    },
    {
      "id": "map_field_2",
      "source_field": "manufacturer",
      "target_field": "manufacturer_id",
      "confidence": 0.85,
      "match_type": "ai_suggested",
      "transformation": {
        "type": "lookup",
        "lookup_table": "manufacturers",
        "match_field": "name",
        "create_if_missing": true
      },
      "required": true
    },
    {
      "id": "map_field_3",
      "source_field": "mrp",
      "target_field": "mrp",
      "confidence": 0.95,
      "match_type": "ai_suggested",
      "transformation": {
        "type": "cast",
        "target_type": "decimal",
        "precision": 2
      },
      "required": true
    },
    {
      "id": "map_field_4",
      "source_field": null,
      "target_field": "drug_schedule",
      "confidence": 0.0,
      "match_type": "unmapped",
      "transformation": null,
      "required": false,
      "suggestion": "This field is required but not found in source. Consider using a default value or manual mapping."
    }
  ],
  "overall_confidence": 0.89,
  "unmapped_required_fields": 1,
  "generated_at": "2026-05-13T14:30:00Z"
}
```

### PUT /import/mapping/{mapping_id}
Update field mappings.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "mappings": [
    {
      "id": "map_field_1",
      "source_field": "name",
      "target_field": "name",
      "confidence": 1.0,
      "match_type": "manual",
      "transformation": null,
      "required": true
    },
    {
      "id": "map_field_2",
      "source_field": "manufacturer",
      "target_field": "manufacturer_id",
      "confidence": 1.0,
      "match_type": "manual",
      "transformation": {
        "type": "lookup",
        "lookup_table": "manufacturers",
        "match_field": "name",
        "create_if_missing": true
      },
      "required": true
    },
    {
      "id": "map_field_4",
      "source_field": null,
      "target_field": "drug_schedule",
      "confidence": 1.0,
      "match_type": "manual",
      "transformation": {
        "type": "default",
        "value": "H1"
      },
      "required": true
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "mapping_id": "map_1234567890",
  "updated_at": "2026-05-13T14:31:00Z",
  "overall_confidence": 1.0,
  "unmapped_required_fields": 0
}
```

### GET /import/mapping/templates
List available mapping templates.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `business_type` (string, optional): Filter by business type
- `source_type` (string, optional): Filter by source type (csv, excel, json)
- `target_entity` (string, optional): Filter by target entity

**Response (200 OK):**
```json
{
  "templates": [
    {
      "id": "tpl_tally_products_v1",
      "name": "Tally Products Import",
      "description": "Template for importing products from Tally ERP",
      "business_type": "pharmacy",
      "source_type": "csv",
      "target_entity": "products",
      "source_system": "tally",
      "version": "1.0",
      "created_at": "2026-01-15T00:00:00Z",
      "usage_count": 1250
    },
    {
      "id": "tpl_sap_customers_v1",
      "name": "SAP Customers Import",
      "description": "Template for importing customers from SAP",
      "business_type": "retail",
      "source_type": "excel",
      "target_entity": "customers",
      "source_system": "sap",
      "version": "1.0",
      "created_at": "2026-02-01T00:00:00Z",
      "usage_count": 850
    }
  ]
}
```

### GET /import/mapping/templates/{template_id}
Get mapping template details.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "id": "tpl_tally_products_v1",
  "name": "Tally Products Import",
  "description": "Template for importing products from Tally ERP",
  "business_type": "pharmacy",
  "source_type": "csv",
  "target_entity": "products",
  "source_system": "tally",
  "version": "1.0",
  "created_at": "2026-01-15T00:00:00Z",
  "usage_count": 1250,
  "expected_columns": [
    "name",
    "manufacturer",
    "mrp",
    "purchase_price",
    "gst_rate",
    "drug_schedule",
    "batch_number",
    "expiry_date"
  ],
  "mappings": [
    {
      "source_field": "name",
      "target_field": "name",
      "transformation": null
    },
    {
      "source_field": "manufacturer",
      "target_field": "manufacturer_id",
      "transformation": {
        "type": "lookup",
        "lookup_table": "manufacturers",
        "match_field": "name"
      }
    },
    {
      "source_field": "mrp",
      "target_field": "mrp",
      "transformation": {
        "type": "cast",
        "target_type": "decimal"
      }
    }
  ]
}
```

### POST /import/mapping/templates
Create a custom mapping template.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Custom Products Import",
  "description": "Custom template for products import",
  "business_type": "pharmacy",
  "source_type": "csv",
  "target_entity": "products",
  "source_system": "custom",
  "expected_columns": ["name", "manufacturer", "mrp"],
  "mappings": [
    {
      "source_field": "name",
      "target_field": "name",
      "transformation": null
    },
    {
      "source_field": "manufacturer",
      "target_field": "manufacturer_id",
      "transformation": {
        "type": "lookup",
        "lookup_table": "manufacturers",
        "match_field": "name"
      }
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "id": "tpl_custom_products_v1",
  "name": "Custom Products Import",
  "description": "Custom template for products import",
  "business_type": "pharmacy",
  "source_type": "csv",
  "target_entity": "products",
  "source_system": "custom",
  "version": "1.0",
  "created_at": "2026-05-13T14:30:00Z",
  "created_by": "usr_1234567890"
}
```

---

## Transformation API

### POST /import/transform
Apply transformations to data.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_id": "job_1234567890",
  "mapping_id": "map_1234567890",
  "sample_data": [
    {
      "name": "Paracetamol",
      "manufacturer": "Sun Pharma",
      "mrp": "25.50"
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "job_id": "job_1234567890",
  "mapping_id": "map_1234567890",
  "transformed_data": [
    {
      "name": "Paracetamol",
      "manufacturer_id": "mfg_sun_pharma_123",
      "mrp": 25.50
    }
  ],
  "transformation_summary": {
    "type_casting": 1,
    "lookup_resolution": 1,
    "format_normalization": 0,
    "enum_mapping": 0,
    "derived_fields": 0
  }
}
```

---

## Validation API

### POST /import/validate
Validate transformed data.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_id": "job_1234567890",
  "data": [
    {
      "name": "Paracetamol",
      "manufacturer_id": "mfg_sun_pharma_123",
      "mrp": 25.50
    },
    {
      "name": null,
      "manufacturer_id": "mfg_cipla_456",
      "mrp": 45.00
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "job_id": "job_1234567890",
  "validation_results": [
    {
      "row_index": 0,
      "status": "valid",
      "errors": [],
      "warnings": []
    },
    {
      "row_index": 1,
      "status": "error",
      "errors": [
        {
          "code": "REQUIRED_FIELD",
          "field": "name",
          "message": "Field 'name' is required but is null",
          "severity": "error",
          "value": null,
          "fix_suggestions": [
            {
              "type": "default_value",
              "value": "Unknown Product"
            },
            {
              "type": "skip_row"
            }
          ]
        }
      ],
      "warnings": []
    }
  ],
  "summary": {
    "total_rows": 2,
    "valid_rows": 1,
    "error_rows": 1,
    "warning_rows": 0,
    "quality_score": 50,
    "quality_metrics": {
      "completeness": 50,
      "accuracy": 100,
      "consistency": 100,
      "uniqueness": 100
    }
  }
}
```

### POST /import/validate/fix
Apply auto-fix to validation errors.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_id": "job_1234567890",
  "row_index": 1,
  "error_code": "REQUIRED_FIELD",
  "field": "name",
  "fix_type": "default_value",
  "fix_value": "Unknown Product"
}
```

**Response (200 OK):**
```json
{
  "job_id": "job_1234567890",
  "row_index": 1,
  "fixed": true,
  "new_value": "Unknown Product",
  "message": "Error fixed successfully"
}
```

---

## Preview API

### GET /import/jobs/{job_id}/preview
Get preview of transformed data.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `page` (integer, optional): Page number (default: 1)
- `limit` (integer, optional): Items per page (default: 50)
- `filter` (string, optional): Filter by status (all, valid, errors, warnings)

**Response (200 OK):**
```json
{
  "job_id": "job_1234567890",
  "preview_data": [
    {
      "row_index": 0,
      "original_data": {
        "name": "Paracetamol",
        "manufacturer": "Sun Pharma",
        "mrp": "25.50"
      },
      "transformed_data": {
        "name": "Paracetamol",
        "manufacturer_id": "mfg_sun_pharma_123",
        "mrp": 25.50
      },
      "status": "valid",
      "errors": [],
      "warnings": []
    },
    {
      "row_index": 1,
      "original_data": {
        "name": null,
        "manufacturer": "Cipla",
        "mrp": "45.00"
      },
      "transformed_data": {
        "name": null,
        "manufacturer_id": "mfg_cipla_456",
        "mrp": 45.00
      },
      "status": "error",
      "errors": [
        {
          "code": "REQUIRED_FIELD",
          "field": "name",
          "message": "Field 'name' is required but is null",
          "severity": "error"
        }
      ],
      "warnings": []
    }
  ],
  "pagination": {
    "total": 1250,
    "page": 1,
    "limit": 50,
    "total_pages": 25
  },
  "summary": {
    "total_rows": 1250,
    "valid_rows": 1238,
    "error_rows": 12,
    "warning_rows": 0
  }
}
```

---

## Import Execution API

### POST /import/jobs/{job_id}/execute
Execute the actual data import.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "options": {
    "skip_errors": true,
    "stop_on_error": false,
    "batch_size": 100
  }
}
```

**Response (200 OK):**
```json
{
  "job_id": "job_1234567890",
  "status": "processing",
  "execution_id": "exec_1234567890",
  "started_at": "2026-05-13T14:30:00Z",
  "message": "Import execution started"
}
```

### GET /import/jobs/{job_id}/execution/{execution_id}
Get execution status.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "execution_id": "exec_1234567890",
  "job_id": "job_1234567890",
  "status": "in_progress",
  "started_at": "2026-05-13T14:30:00Z",
  "progress": {
    "total_rows": 1250,
    "processed_rows": 750,
    "successful_rows": 740,
    "failed_rows": 10,
    "percentage": 60
  },
  "current_batch": {
    "batch_number": 8,
    "batch_size": 100,
    "started_at": "2026-05-13T14:32:00Z"
  }
}
```

---

## Webhook API

### POST /webhooks
Register a webhook for import events.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "https://your-app.com/webhooks/import",
  "events": [
    "import.completed",
    "import.failed",
    "import.progress"
  ],
  "secret": "your_webhook_secret",
  "company_id": "cmp_1234567890"
}
```

**Response (201 Created):**
```json
{
  "webhook_id": "wh_1234567890",
  "url": "https://your-app.com/webhooks/import",
  "events": [
    "import.completed",
    "import.failed",
    "import.progress"
  ],
  "active": true,
  "created_at": "2026-05-13T14:30:00Z"
}
```

### GET /webhooks
List registered webhooks.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "webhooks": [
    {
      "webhook_id": "wh_1234567890",
      "url": "https://your-app.com/webhooks/import",
      "events": [
        "import.completed",
        "import.failed",
        "import.progress"
      ],
      "active": true,
      "created_at": "2026-05-13T14:30:00Z"
    }
  ]
}
```

### DELETE /webhooks/{webhook_id}
Delete a webhook.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "webhook_id": "wh_1234567890",
  "message": "Webhook deleted successfully"
}
```

---

## Webhook Event Payloads

### import.completed
```json
{
  "event": "import.completed",
  "timestamp": "2026-05-13T14:35:00Z",
  "data": {
    "job_id": "job_1234567890",
    "status": "completed",
    "summary": {
      "total_rows": 1250,
      "successful_rows": 1238,
      "failed_rows": 12,
      "quality_score": 87
    }
  }
}
```

### import.failed
```json
{
  "event": "import.failed",
  "timestamp": "2026-05-13T14:35:00Z",
  "data": {
    "job_id": "job_1234567890",
    "status": "failed",
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Too many validation errors",
      "details": {
        "error_count": 500,
        "threshold": 100
      }
    }
  }
}
```

### import.progress
```json
{
  "event": "import.progress",
  "timestamp": "2026-05-13T14:32:00Z",
  "data": {
    "job_id": "job_1234567890",
    "status": "processing",
    "progress": {
      "current_step": "import",
      "percentage": 60,
      "total_rows": 1250,
      "processed_rows": 750
    }
  }
}
```

---

## Error Responses

All endpoints may return error responses with the following format:

### 400 Bad Request
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request body",
    "details": {
      "field": "file_id",
      "issue": "Required field is missing"
    }
  }
}
```

### 401 Unauthorized
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired access token"
  }
}
```

### 403 Forbidden
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource"
  }
}
```

### 404 Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {
      "resource": "import_job",
      "id": "job_1234567890"
    }
  }
}
```

### 429 Too Many Requests
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": {
      "limit": 100,
      "window": "1 minute",
      "retry_after": 30
    }
  }
}
```

### 500 Internal Server Error
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "request_id": "req_1234567890"
  }
}
```

---

## Rate Limiting

- **Standard Tier**: 100 requests per minute
- **Premium Tier**: 1000 requests per minute
- **Enterprise Tier**: Custom limits

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1715607600
```

---

## SDKs

Official SDKs are available for:
- JavaScript/TypeScript
- Python
- Java
- Go
- C#

See the SDK documentation for installation and usage examples.

---

## Support

For API support, contact:
- Email: api-support@erp-import-service.com
- Documentation: https://docs.erp-import-service.com
- Status Page: https://status.erp-import-service.com

---

**Last Updated**: 2026-05-13
**API Version**: v1.0.0
