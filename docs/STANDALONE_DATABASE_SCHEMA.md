# Standalone Database Schema - ERP Data Import System

## Overview
This document provides a complete database schema for implementing the AI-powered ERP data import system as a standalone service. All tables, indexes, constraints, and relationships are documented for independent implementation.

## Database Technology
- **Primary**: PostgreSQL 15+
- **Alternative**: MySQL 8+ (with minor syntax adjustments)
- **ORM Compatibility**: Prisma, TypeORM, Sequelize, Drizzle

---

## Core Tables

### 1. companies
Stores company/organization information.

```sql
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    business_type VARCHAR(50) NOT NULL, -- 'pharmacy', 'retail', 'manufacturing', etc.
    industry VARCHAR(100),
    website VARCHAR(255),
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    billing_plan VARCHAR(50) DEFAULT 'standard', -- 'standard', 'premium', 'enterprise'
    max_import_jobs_per_month INTEGER DEFAULT 100,
    max_file_size_mb INTEGER DEFAULT 100,
    api_rate_limit_per_minute INTEGER DEFAULT 100,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'suspended', 'deleted'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_business_type CHECK (business_type IN ('pharmacy', 'retail', 'manufacturing', 'wholesale', 'services')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE INDEX idx_companies_business_type ON companies(business_type);
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_created_at ON companies(created_at DESC);
```

### 2. users
Stores user accounts and authentication.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user', 'viewer'
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'invited', 'suspended', 'deleted'
    last_login_at TIMESTAMP WITH TIME ZONE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_role CHECK (role IN ('admin', 'user', 'viewer')),
    CONSTRAINT valid_user_status CHECK (status IN ('active', 'invited', 'suspended', 'deleted'))
);

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
```

### 3. api_keys
Stores API keys for programmatic access.

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    key_name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    scopes TEXT[] DEFAULT '{}', -- ['read', 'write', 'admin']
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'revoked', 'expired'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_key_status CHECK (status IN ('active', 'revoked', 'expired'))
);

CREATE INDEX idx_api_keys_company_id ON api_keys(company_id);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_status ON api_keys(status);
```

---

## Import Job Tables

### 4. import_jobs
Stores import job metadata and status.

```sql
CREATE TABLE import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    job_name VARCHAR(255) NOT NULL,
    job_description TEXT,
    
    -- Source information
    source_type VARCHAR(20) NOT NULL, -- 'csv', 'excel', 'json', 'sql_dump', 'api'
    source_system VARCHAR(50), -- 'tally', 'sap', 'oracle', 'zoho', 'quickbooks', 'custom'
    file_id UUID,
    file_url TEXT,
    file_metadata JSONB DEFAULT '{}',
    
    -- Target information
    target_entity VARCHAR(50) NOT NULL, -- 'products', 'customers', 'suppliers', 'invoices', 'inventory'
    target_system VARCHAR(50) DEFAULT 'internal',
    
    -- Mapping
    mapping_template_id UUID REFERENCES mapping_templates(id) ON DELETE SET NULL,
    mapping_id UUID REFERENCES field_mappings(id) ON DELETE SET NULL,
    
    -- Status and progress
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'validating', 'importing', 'completed', 'failed', 'cancelled'
    current_step VARCHAR(50),
    progress_percentage INTEGER DEFAULT 0,
    
    -- Options
    options JSONB DEFAULT '{}',
    
    -- Summary
    total_rows INTEGER,
    successful_rows INTEGER,
    failed_rows INTEGER,
    skipped_rows INTEGER,
    quality_score INTEGER, -- 0-100
    
    -- Quality metrics
    quality_metrics JSONB DEFAULT '{}',
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_source_type CHECK (source_type IN ('csv', 'excel', 'json', 'sql_dump', 'api')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'validating', 'importing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT valid_progress CHECK (progress_percentage BETWEEN 0 AND 100),
    CONSTRAINT valid_quality_score CHECK (quality_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_import_jobs_company_id ON import_jobs(company_id);
CREATE INDEX idx_import_jobs_created_by ON import_jobs(created_by);
CREATE INDEX idx_import_jobs_status ON import_jobs(status);
CREATE INDEX idx_import_jobs_target_entity ON import_jobs(target_entity);
CREATE INDEX idx_import_jobs_created_at ON import_jobs(created_at DESC);
CREATE INDEX idx_import_jobs_mapping_template_id ON import_jobs(mapping_template_id);
```

### 5. import_job_steps
Tracks individual steps in import job execution.

```sql
CREATE TABLE import_job_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    
    step_name VARCHAR(50) NOT NULL, -- 'upload', 'schema_detection', 'mapping', 'transformation', 'validation', 'import'
    step_order INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'skipped'
    
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_step_status CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
    CONSTRAINT unique_job_step UNIQUE (job_id, step_name)
);

CREATE INDEX idx_import_job_steps_job_id ON import_job_steps(job_id);
CREATE INDEX idx_import_job_steps_status ON import_job_steps(status);
CREATE INDEX idx_import_job_steps_step_order ON import_job_steps(step_order);
```

### 6. import_executions
Tracks actual import execution batches.

```sql
CREATE TABLE import_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    
    execution_type VARCHAR(20) DEFAULT 'full', -- 'full', 'dry_run', 'preview'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled'
    
    batch_size INTEGER DEFAULT 100,
    current_batch INTEGER DEFAULT 0,
    
    -- Progress tracking
    total_rows INTEGER,
    processed_rows INTEGER DEFAULT 0,
    successful_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_execution_type CHECK (execution_type IN ('full', 'dry_run', 'preview')),
    CONSTRAINT valid_execution_status CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_import_executions_job_id ON import_executions(job_id);
CREATE INDEX idx_import_executions_status ON import_executions(status);
CREATE INDEX idx_import_executions_started_at ON import_executions(started_at DESC);
```

---

## File Management Tables

### 7. uploaded_files
Stores uploaded file metadata.

```sql
CREATE TABLE uploaded_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    
    file_size BIGINT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    encoding VARCHAR(50),
    
    -- File analysis
    row_count INTEGER,
    column_count INTEGER,
    has_header BOOLEAN DEFAULT true,
    delimiter VARCHAR(5) DEFAULT ',',
    
    -- Storage info
    storage_provider VARCHAR(50) DEFAULT 'local', -- 'local', 's3', 'gcs', 'azure'
    storage_path TEXT,
    storage_bucket VARCHAR(255),
    
    status VARCHAR(20) DEFAULT 'uploaded', -- 'uploaded', 'processing', 'analyzed', 'deleted'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT valid_file_status CHECK (status IN ('uploaded', 'processing', 'analyzed', 'deleted'))
);

CREATE INDEX idx_uploaded_files_company_id ON uploaded_files(company_id);
CREATE INDEX idx_uploaded_files_uploaded_by ON uploaded_files(uploaded_by);
CREATE INDEX idx_uploaded_files_status ON uploaded_files(status);
CREATE INDEX idx_uploaded_files_created_at ON uploaded_files(created_at DESC);
```

### 8. file_analysis
Stores file analysis results.

```sql
CREATE TABLE file_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES uploaded_files(id) ON DELETE CASCADE,
    
    -- Schema detection
    detected_entity VARCHAR(50),
    detection_confidence DECIMAL(3,2),
    
    -- Column analysis
    column_analysis JSONB DEFAULT '{}', -- Array of column objects with type, patterns, stats
    
    -- Data quality
    data_quality JSONB DEFAULT '{}',
    
    -- Sample data
    sample_rows JSONB DEFAULT '[]',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_file_analysis_file_id ON file_analysis(file_id);
CREATE UNIQUE INDEX idx_file_analysis_file_id_unique ON file_analysis(file_id);
```

---

## Mapping Tables

### 9. mapping_templates
Stores reusable mapping templates.

```sql
CREATE TABLE mapping_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL for global templates
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    template_name VARCHAR(255) NOT NULL,
    template_description TEXT,
    
    business_type VARCHAR(50),
    source_type VARCHAR(20) NOT NULL,
    source_system VARCHAR(50),
    target_entity VARCHAR(50) NOT NULL,
    
    -- Expected source structure
    expected_columns TEXT[] DEFAULT '{}',
    expected_delimiter VARCHAR(5) DEFAULT ',',
    
    -- Mappings (stored as JSON for flexibility)
    mappings JSONB NOT NULL DEFAULT '[]',
    
    -- Metadata
    version VARCHAR(20) DEFAULT '1.0',
    is_global BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'deprecated', 'deleted'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_template_status CHECK (status IN ('active', 'deprecated', 'deleted'))
);

CREATE INDEX idx_mapping_templates_company_id ON mapping_templates(company_id);
CREATE INDEX idx_mapping_templates_business_type ON mapping_templates(business_type);
CREATE INDEX idx_mapping_templates_source_system ON mapping_templates(source_system);
CREATE INDEX idx_mapping_templates_target_entity ON mapping_templates(target_entity);
CREATE INDEX idx_mapping_templates_is_global ON mapping_templates(is_global);
CREATE INDEX idx_mapping_templates_status ON mapping_templates(status);
```

### 10. field_mappings
Stores field mapping configurations for specific jobs.

```sql
CREATE TABLE field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES import_jobs(id) ON DELETE CASCADE,
    template_id UUID REFERENCES mapping_templates(id) ON DELETE SET NULL,
    
    target_entity VARCHAR(50) NOT NULL,
    business_type VARCHAR(50),
    
    -- Mappings
    mappings JSONB NOT NULL DEFAULT '[]',
    
    -- AI mapping info
    ai_generated BOOLEAN DEFAULT false,
    ai_model VARCHAR(100),
    ai_confidence DECIMAL(3,2),
    
    -- Status
    overall_confidence DECIMAL(3,2),
    unmapped_required_fields INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_field_mappings_job_id ON field_mappings(job_id);
CREATE INDEX idx_field_mappings_template_id ON field_mappings(template_id);
CREATE INDEX idx_field_mappings_target_entity ON field_mappings(target_entity);
```

### 11. mapping_field_details
Stores individual field mapping details (normalized from JSON).

```sql
CREATE TABLE mapping_field_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mapping_id UUID NOT NULL REFERENCES field_mappings(id) ON DELETE CASCADE,
    
    source_field VARCHAR(255),
    source_field_index INTEGER,
    target_field VARCHAR(255) NOT NULL,
    
    confidence DECIMAL(3,2),
    match_type VARCHAR(50), -- 'exact', 'ai_suggested', 'manual', 'template'
    
    -- Transformation
    transformation_type VARCHAR(50), -- 'cast', 'lookup', 'format', 'default', 'derived', 'enum'
    transformation_config JSONB DEFAULT '{}',
    
    is_required BOOLEAN DEFAULT false,
    is_nullable BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mapping_field_details_mapping_id ON mapping_field_details(mapping_id);
CREATE INDEX idx_mapping_field_details_target_field ON mapping_field_details(target_field);
```

---

## Transformation Tables

### 12. transformation_rules
Stores transformation rule definitions.

```sql
CREATE TABLE transformation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL, -- 'cast', 'format', 'lookup', 'default', 'derived', 'enum', 'regex'
    rule_category VARCHAR(50), -- 'type', 'date', 'phone', 'email', 'gst', 'currency'
    
    -- Rule configuration
    source_type VARCHAR(50),
    target_type VARCHAR(50),
    pattern VARCHAR(255),
    format_string VARCHAR(255),
    
    -- Lookup configuration
    lookup_table VARCHAR(100),
    lookup_match_field VARCHAR(100),
    lookup_return_field VARCHAR(100),
    create_if_missing BOOLEAN DEFAULT false,
    
    -- Default value
    default_value TEXT,
    
    -- Derived field formula
    formula TEXT,
    
    -- Enum mapping
    enum_mapping JSONB DEFAULT '{}',
    
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transformation_rules_rule_type ON transformation_rules(rule_type);
CREATE INDEX idx_transformation_rules_rule_category ON transformation_rules(rule_category);
CREATE INDEX idx_transformation_rules_source_type ON transformation_rules(source_type);
CREATE INDEX idx_transformation_rules_target_type ON transformation_rules(target_type);
```

### 13. lookup_tables
Stores lookup reference data.

```sql
CREATE TABLE lookup_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    table_name VARCHAR(100) NOT NULL,
    table_description TEXT,
    
    -- Table structure
    columns JSONB NOT NULL DEFAULT '[]', -- Array of column definitions
    
    -- Data
    data JSONB NOT NULL DEFAULT '{}', -- Key-value pairs or array of objects
    
    -- Metadata
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_company_table UNIQUE (company_id, table_name)
);

CREATE INDEX idx_lookup_tables_company_id ON lookup_tables(company_id);
CREATE INDEX idx_lookup_tables_table_name ON lookup_tables(table_name);
CREATE INDEX idx_lookup_tables_is_active ON lookup_tables(is_active);
```

---

## Validation Tables

### 14. validation_rules
Stores validation rule definitions.

```sql
CREATE TABLE validation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    rule_name VARCHAR(255) NOT NULL,
    rule_category VARCHAR(50), -- 'schema', 'business', 'referential', 'format', 'custom'
    
    -- Rule configuration
    entity_type VARCHAR(50), -- 'products', 'customers', etc.
    field_name VARCHAR(100),
    
    -- Validation type
    validation_type VARCHAR(50) NOT NULL, -- 'required', 'unique', 'format', 'range', 'regex', 'custom', 'reference'
    
    -- Validation parameters
    parameters JSONB DEFAULT '{}',
    
    -- Error configuration
    error_code VARCHAR(50) NOT NULL,
    error_message_template TEXT,
    severity VARCHAR(20) DEFAULT 'error', -- 'error', 'warning', 'info'
    
    -- Auto-fix suggestions
    auto_fix_enabled BOOLEAN DEFAULT false,
    auto_fix_suggestions JSONB DEFAULT '[]',
    
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_validation_rules_rule_category ON validation_rules(rule_category);
CREATE INDEX idx_validation_rules_entity_type ON validation_rules(entity_type);
CREATE INDEX idx_validation_rules_field_name ON validation_rules(field_name);
CREATE INDEX idx_validation_rules_validation_type ON validation_rules(validation_type);
CREATE INDEX idx_validation_rules_is_active ON validation_rules(is_active);
```

### 15. validation_results
Stores validation results for import jobs.

```sql
CREATE TABLE validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES import_executions(id) ON DELETE CASCADE,
    
    row_index INTEGER NOT NULL,
    row_status VARCHAR(20) NOT NULL, -- 'valid', 'error', 'warning', 'skipped'
    
    -- Original and transformed data
    original_data JSONB,
    transformed_data JSONB,
    
    -- Validation errors
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    
    -- Quality score for this row
    quality_score INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_validation_results_job_id ON validation_results(job_id);
CREATE INDEX idx_validation_results_execution_id ON validation_results(execution_id);
CREATE INDEX idx_validation_results_row_status ON validation_results(row_status);
CREATE INDEX idx_validation_results_quality_score ON validation_results(quality_score);
```

### 16. validation_errors
Stores individual validation errors (normalized).

```sql
CREATE TABLE validation_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_result_id UUID NOT NULL REFERENCES validation_results(id) ON DELETE CASCADE,
    
    error_code VARCHAR(50) NOT NULL,
    field_name VARCHAR(100),
    error_message TEXT,
    severity VARCHAR(20) NOT NULL, -- 'error', 'warning', 'info'
    
    -- Error details
    actual_value TEXT,
    expected_value TEXT,
    
    -- Fix suggestions
    fix_suggestions JSONB DEFAULT '[]',
    
    -- Fix status
    fix_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'auto_fixed', 'manually_fixed', 'skipped'
    fix_applied_at TIMESTAMP WITH TIME ZONE,
    fix_details JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_validation_errors_validation_result_id ON validation_errors(validation_result_id);
CREATE INDEX idx_validation_errors_error_code ON validation_errors(error_code);
CREATE INDEX idx_validation_errors_severity ON validation_errors(severity);
CREATE INDEX idx_validation_errors_fix_status ON validation_errors(fix_status);
```

---

## Preview Tables

### 17. import_previews
Stores preview data for import jobs.

```sql
CREATE TABLE import_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    
    row_index INTEGER NOT NULL,
    
    -- Data
    original_data JSONB,
    transformed_data JSONB,
    
    -- Validation status
    validation_status VARCHAR(20), -- 'valid', 'error', 'warning', 'pending'
    validation_result_id UUID REFERENCES validation_results(id) ON DELETE SET NULL,
    
    -- Import status
    import_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'imported', 'skipped', 'failed'
    
    -- Target record info (after import)
    target_record_id UUID,
    target_record_type VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_import_previews_job_id ON import_previews(job_id);
CREATE INDEX idx_import_previews_row_index ON import_previews(row_index);
CREATE INDEX idx_import_previews_validation_status ON import_previews(validation_status);
CREATE INDEX idx_import_previews_import_status ON import_previews(import_status);
CREATE INDEX idx_import_previews_validation_result_id ON import_previews(validation_result_id);
```

---

## Webhook Tables

### 18. webhooks
Stores webhook configurations.

```sql
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    webhook_url TEXT NOT NULL,
    webhook_name VARCHAR(255),
    
    -- Events to subscribe to
    events TEXT[] NOT NULL DEFAULT '{}', -- ['import.completed', 'import.failed', 'import.progress']
    
    -- Security
    secret VARCHAR(255),
    
    -- Configuration
    headers JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Delivery tracking
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    failure_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhooks_company_id ON webhooks(company_id);
CREATE INDEX idx_webhooks_is_active ON webhooks(is_active);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);
```

### 19. webhook_deliveries
Stores webhook delivery logs.

```sql
CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    
    -- Delivery attempt
    attempt_number INTEGER DEFAULT 1,
    status VARCHAR(20) NOT NULL, -- 'pending', 'delivered', 'failed', 'retrying'
    
    -- HTTP details
    request_url TEXT,
    request_method VARCHAR(10) DEFAULT 'POST',
    request_headers JSONB DEFAULT '{}',
    request_body TEXT,
    
    response_status_code INTEGER,
    response_headers JSONB DEFAULT '{}',
    response_body TEXT,
    
    -- Timing
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    
    -- Error handling
    error_message TEXT,
    retry_after TIMESTAMP WITH TIME ZONE,
    max_retries INTEGER DEFAULT 3,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);
```

---

## Audit & Logging Tables

### 20. audit_logs
Stores audit trail for all operations.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    action VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'export', 'import'
    resource_type VARCHAR(100) NOT NULL, -- 'import_job', 'mapping_template', etc.
    resource_id UUID,
    
    -- Change details
    old_values JSONB,
    new_values JSONB,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

### 21. system_logs
Stores system-level logs and errors.

```sql
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    log_level VARCHAR(20) NOT NULL, -- 'debug', 'info', 'warn', 'error', 'fatal'
    log_category VARCHAR(100), -- 'api', 'worker', 'database', 'external_service'
    
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    
    -- Context
    service_name VARCHAR(100),
    request_id VARCHAR(100),
    job_id UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
    
    -- Stack trace for errors
    stack_trace TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_system_logs_log_level ON system_logs(log_level);
CREATE INDEX idx_system_logs_log_category ON system_logs(log_category);
CREATE INDEX idx_system_logs_service_name ON system_logs(service_name);
CREATE INDEX idx_system_logs_job_id ON system_logs(job_id);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);
```

---

## Configuration & Settings Tables

### 22. business_entity_schemas
Stores target entity schema definitions.

```sql
CREATE TABLE business_entity_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    entity_name VARCHAR(50) NOT NULL,
    entity_display_name VARCHAR(255) NOT NULL,
    business_type VARCHAR(50),
    
    -- Schema definition
    fields JSONB NOT NULL DEFAULT '[]', -- Array of field definitions
    
    -- Validation rules
    validation_rules JSONB DEFAULT '[]',
    
    -- Relationships
    relationships JSONB DEFAULT '[]',
    
    -- Metadata
    version VARCHAR(20) DEFAULT '1.0',
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_entity_business UNIQUE (entity_name, business_type)
);

CREATE INDEX idx_business_entity_schemas_entity_name ON business_entity_schemas(entity_name);
CREATE INDEX idx_business_entity_schemas_business_type ON business_entity_schemas(business_type);
CREATE INDEX idx_business_entity_schemas_is_active ON business_entity_schemas(is_active);
```

### 23. erp_system_configs
Stores configuration for external ERP systems.

```sql
CREATE TABLE erp_system_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    system_name VARCHAR(50) NOT NULL, -- 'tally', 'sap', 'oracle', etc.
    system_display_name VARCHAR(255),
    
    -- Connection details (encrypted)
    connection_config JSONB NOT NULL DEFAULT '{}',
    
    -- System-specific settings
    system_settings JSONB DEFAULT '{}',
    
    -- Metadata
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_company_system UNIQUE (company_id, system_name)
);

CREATE INDEX idx_erp_system_configs_company_id ON erp_system_configs(company_id);
CREATE INDEX idx_erp_system_configs_system_name ON erp_system_configs(system_name);
CREATE INDEX idx_erp_system_configs_is_active ON erp_system_configs(is_active);
```

---

## Sample Data Seeding

### Business Entity Schemas (Pharmacy - Products)

```sql
INSERT INTO business_entity_schemas (entity_name, entity_display_name, business_type, fields, validation_rules) VALUES
('products', 'Products', 'pharmacy', 
'[
    {
        "name": "id",
        "type": "uuid",
        "required": true,
        "auto_generate": true
    },
    {
        "name": "name",
        "type": "string",
        "required": true,
        "max_length": 255,
        "unique": true
    },
    {
        "name": "manufacturer_id",
        "type": "uuid",
        "required": true,
        "reference": {
            "entity": "manufacturers",
            "field": "id"
        }
    },
    {
        "name": "mrp",
        "type": "decimal",
        "required": true,
        "precision": 10,
        "scale": 2,
        "min": 0
    },
    {
        "name": "purchase_price",
        "type": "decimal",
        "required": true,
        "precision": 10,
        "scale": 2,
        "min": 0
    },
    {
        "name": "gst_rate",
        "type": "decimal",
        "required": true,
        "precision": 5,
        "scale": 2,
        "enum": [0, 5, 12, 18, 28]
    },
    {
        "name": "drug_schedule",
        "type": "string",
        "required": true,
        "enum": ["H1", "H", "X", "C1", "C", "B1", "B", "A", "G", "None"]
    },
    {
        "name": "hsn_code",
        "type": "string",
        "required": false,
        "pattern": "^\\d{8}$"
    }
]',
'[
    {
        "field": "name",
        "type": "required",
        "error_code": "PRODUCT_NAME_REQUIRED"
    },
    {
        "field": "name",
        "type": "unique",
        "error_code": "PRODUCT_NAME_DUPLICATE"
    },
    {
        "field": "mrp",
        "type": "range",
        "parameters": {"min": 0},
        "error_code": "INVALID_MRP"
    },
    {
        "field": "gst_rate",
        "type": "enum",
        "parameters": {"values": [0, 5, 12, 18, 28]},
        "error_code": "INVALID_GST_RATE"
    }
]');
```

### Transformation Rules (Type Casting)

```sql
INSERT INTO transformation_rules (rule_name, rule_type, source_type, target_type, description, is_system) VALUES
('String to Integer', 'cast', 'string', 'integer', 'Convert string to integer', true),
('String to Decimal', 'cast', 'string', 'decimal', 'Convert string to decimal', true),
('String to Boolean', 'cast', 'string', 'boolean', 'Convert string to boolean', true),
('String to Date', 'cast', 'string', 'date', 'Convert string to date', true),
('String to UUID', 'cast', 'string', 'uuid', 'Convert string to UUID', true);
```

### Transformation Rules (Format Normalization)

```sql
INSERT INTO transformation_rules (rule_name, rule_type, rule_category, pattern, format_string, description, is_system) VALUES
('Phone Format', 'format', 'phone', '^\\d{10}$', '+91{0}', 'Format 10-digit phone number', true),
('GST Format', 'format', 'gst', '^\\d{15}$', '{0}', 'Validate GST number format', true),
('Email Format', 'format', 'email', '^[^@]+@[^@]+\\.[^@]+$', '{0}', 'Validate email format', true),
('Date ISO Format', 'format', 'date', null, 'YYYY-MM-DD', 'Convert to ISO date format', true);
```

### Validation Rules (Schema)

```sql
INSERT INTO validation_rules (rule_name, rule_category, entity_type, field_name, validation_type, error_code, error_message_template, severity, is_system) VALUES
('Required Field', 'schema', null, null, 'required', 'REQUIRED_FIELD', 'Field ''{field}'' is required', 'error', true),
('Unique Field', 'schema', null, null, 'unique', 'DUPLICATE_VALUE', 'Field ''{field}'' must be unique', 'error', true),
('Type Validation', 'schema', null, null, 'type', 'INVALID_TYPE', 'Field ''{field}'' has invalid type', 'error', true);
```

---

## Database Views

### View: Import Job Summary

```sql
CREATE VIEW import_job_summary AS
SELECT 
    ij.id,
    ij.company_id,
    ij.job_name,
    ij.status,
    ij.source_type,
    ij.target_entity,
    ij.total_rows,
    ij.successful_rows,
    ij.failed_rows,
    ij.quality_score,
    ij.started_at,
    ij.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(ij.completed_at, NOW()) - ij.started_at)) as duration_seconds,
    c.name as company_name
FROM import_jobs ij
LEFT JOIN companies c ON ij.company_id = c.id;
```

### View: Validation Summary

```sql
CREATE VIEW validation_summary AS
SELECT 
    vr.job_id,
    COUNT(*) as total_rows,
    SUM(CASE WHEN vr.row_status = 'valid' THEN 1 ELSE 0 END) as valid_rows,
    SUM(CASE WHEN vr.row_status = 'error' THEN 1 ELSE 0 END) as error_rows,
    SUM(CASE WHEN vr.row_status = 'warning' THEN 1 ELSE 0 END) as warning_rows,
    AVG(vr.quality_score) as avg_quality_score
FROM validation_results vr
GROUP BY vr.job_id;
```

### View: Webhook Delivery Stats

```sql
CREATE VIEW webhook_delivery_stats AS
SELECT 
    wd.webhook_id,
    w.webhook_url,
    COUNT(*) as total_deliveries,
    SUM(CASE WHEN wd.status = 'delivered' THEN 1 ELSE 0 END) as successful_deliveries,
    SUM(CASE WHEN wd.status = 'failed' THEN 1 ELSE 0 END) as failed_deliveries,
    AVG(wd.duration_ms) as avg_duration_ms,
    MAX(wd.delivered_at) as last_delivery_at
FROM webhook_deliveries wd
LEFT JOIN webhooks w ON wd.webhook_id = w.id
GROUP BY wd.webhook_id, w.webhook_url;
```

---

## Database Functions

### Function: Update Updated At Timestamp

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Trigger: Auto-update updated_at

```sql
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_import_jobs_updated_at BEFORE UPDATE ON import_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mapping_templates_updated_at BEFORE UPDATE ON mapping_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_field_mappings_updated_at BEFORE UPDATE ON field_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transformation_rules_updated_at BEFORE UPDATE ON transformation_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_validation_rules_updated_at BEFORE UPDATE ON validation_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lookup_tables_updated_at BEFORE UPDATE ON lookup_tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_entity_schemas_updated_at BEFORE UPDATE ON business_entity_schemas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_erp_system_configs_updated_at BEFORE UPDATE ON erp_system_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Index Optimization

### Composite Indexes for Common Queries

```sql
-- Import job queries with company and status
CREATE INDEX idx_import_jobs_company_status ON import_jobs(company_id, status, created_at DESC);

-- Validation results with job and status
CREATE INDEX idx_validation_results_job_status ON validation_results(job_id, row_status);

-- Webhook deliveries with webhook and status
CREATE INDEX idx_webhook_deliveries_webhook_status ON webhook_deliveries(webhook_id, status, created_at DESC);

-- Audit logs with company and action
CREATE INDEX idx_audit_logs_company_action ON audit_logs(company_id, action, created_at DESC);
```

### GIN Indexes for JSONB Columns

```sql
-- Full-text search in JSONB columns
CREATE INDEX idx_import_jobs_options ON import_jobs USING GIN(options);
CREATE INDEX idx_import_jobs_quality_metrics ON import_jobs USING GIN(quality_metrics);
CREATE INDEX idx_mapping_templates_mappings ON mapping_templates USING GIN(mappings);
CREATE INDEX idx_field_mappings_mappings ON field_mappings USING GIN(mappings);
CREATE INDEX idx_transformation_rules_parameters ON transformation_rules USING GIN(parameters);
CREATE INDEX idx_validation_rules_parameters ON validation_rules USING GIN(parameters);
```

---

## Backup and Maintenance

### Partitioning Strategy (for large tables)

```sql
-- Partition import_jobs by created_at (monthly)
CREATE TABLE import_jobs_partitioned (
    LIKE import_jobs INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create partitions for current and future months
CREATE TABLE import_jobs_2026_05 PARTITION OF import_jobs_partitioned
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE import_jobs_2026_06 PARTITION OF import_jobs_partitioned
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

### Cleanup Job for Old Data

```sql
-- Function to delete old audit logs (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM audit_logs 
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Function to delete old system logs (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_system_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM system_logs 
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
```

---

## Security Considerations

### Row-Level Security (RLS)

```sql
-- Enable RLS on sensitive tables
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapping_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their company's data
CREATE POLICY company_isolation ON import_jobs
    FOR ALL
    USING (company_id IN (
        SELECT company_id FROM users WHERE id = current_setting('app.current_user_id')::uuid
    ));

CREATE POLICY company_isolation_files ON uploaded_files
    FOR ALL
    USING (company_id IN (
        SELECT company_id FROM users WHERE id = current_setting('app.current_user_id')::uuid
    ));
```

---

**Last Updated**: 2026-05-13
**Schema Version**: 1.0.0
