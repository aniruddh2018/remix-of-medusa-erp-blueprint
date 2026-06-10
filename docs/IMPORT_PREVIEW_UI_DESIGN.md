# Import Preview & Confirmation UI - Design Specification

## Overview
The Import Preview & Confirmation UI provides users with a comprehensive view of their data before import, allowing them to review transformations, validation results, and quality scores. This ensures data integrity and gives users confidence before committing to an import operation.

## UI Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IMPORT WIZARD - STEP 5: PREVIEW                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    IMPORT SUMMARY HEADER                              │    │
│  │  File: products_export.csv | 1,250 rows | Entity: Products            │    │
│  │  Quality Score: 87% | Errors: 12 | Warnings: 45                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    QUALITY SCORE DASHBOARD                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │    │
│  │  │ Completeness │  │ Accuracy     │  │ Consistency  │  │ Uniqueness │ │    │
│  │  │ 92%          │  │ 85%          │  │ 88%          │  │ 95%        │ │    │
│  │  │ ████████░░   │  │ ███████░░░   │  │ ████████░░   │  │ █████████░ │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    DATA PREVIEW TABLE                                │    │
│  │  ┌────────────────────────────────────────────────────────────────┐  │    │
│  │  │ Filter: [All ▼] [Valid ▼] [Errors ▼] [Warnings ▼]              │  │    │
│  │  │ Search: [________________________]                              │  │    │
│  │  │ Show: [Original ▼] [Transformed ▼] [Side-by-Side ▼]           │  │    │
│  │  └────────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │  ┌──────┬──────────────┬──────────────┬──────────────┬────────────┐  │    │
│  │  │ Row  │ Name         │ Manufacturer │ MRP           │ Status     │  │    │
│  │  ├──────┼──────────────┼──────────────┼──────────────┼────────────┤  │    │
│  │  │ 1    │ Paracetamol  │ Sun Pharma   │ 25.50         │ ✓ Valid    │  │    │
│  │  │ 2    │ Amoxicillin  │ Cipla        │ 45.00         │ ⚠ Warning  │  │    │
│  │  │ 3    │ [NULL]      │ Dr. Reddy's  │ 32.00         │ ✗ Error    │  │    │
│  │  │ ...  │ ...          │ ...          │ ...           │ ...        │  │    │
│  │  └──────┴──────────────┴──────────────┴──────────────┴────────────┘  │    │
│  │  Showing 1-100 of 1,250 rows | [← Prev] [1] [2] [3] ... [Next →]    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    VALIDATION PANEL                                 │    │
│  │  ┌────────────────────────────────────────────────────────────────┐  │    │
│  │  │ Errors (12) | Warnings (45) | Info (8)                         │  │    │
│  │  ├────────────────────────────────────────────────────────────────┤  │    │
│  │  │ ✗ Row 3: Missing required field 'name'                         │  │    │
│  │  │    → Fix: [Provide default value] [Skip row] [Edit manually]    │  │    │
│  │  │                                                                  │  │    │
│  │  │ ✗ Row 7: MRP (15.00) < Purchase Price (20.00)                  │  │    │
│  │  │    → Fix: [Swap values] [Edit manually] [Skip row]             │  │    │
│  │  │                                                                  │  │    │
│  │  │ ⚠ Row 2: Invalid GST format "27ABCDE1234F1Z5"                   │  │    │
│  │  │    → Fix: [Auto-format] [Edit manually] [Ignore]               │  │    │
│  │  │                                                                  │  │    │
│  │  │ ⚠ Row 15: Email format invalid                                 │  │    │
│  │  │    → Fix: [Remove special chars] [Edit manually] [Ignore]      │  │    │
│  │  └────────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    TRANSFORMATION SUMMARY                            │    │
│  │  ┌────────────────────────────────────────────────────────────────┐  │    │
│  │  │ Applied Transformations:                                        │  │    │
│  │  │ • Type Casting: 345 fields (string → decimal)                   │  │    │
│  │  │ • Format Normalization: 89 phone numbers                        │  │    │
│  │  │ • Lookup Resolution: 23 suppliers matched                       │  │    │
│  │  │ • Enum Mapping: 156 drug schedules mapped                       │  │    │
│  │  │ • Derived Fields: 1,250 total_price calculated                  │  │    │
│  │  └────────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    ACTION BUTTONS                                    │    │
│  │  [← Back to Mapping]  [Fix All Auto-Fixable (23)]  [Import 1,238 Rows] │    │
│  │                                                      [Cancel Import]   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Specifications

### 1. ImportWizard Component

```typescript
interface ImportWizardProps {
  companyId: string;
  businessType: string;
}

function ImportWizard({ companyId, businessType }: ImportWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [importData, setImportData] = useState<ImportWizardData>({
    file: null,
    sourceSchema: null,
    mappingConfig: null,
    transformedData: null,
    validationResult: null
  });

  const steps = [
    { id: 1, title: 'Upload File', component: FileUploadStep },
    { id: 2, title: 'Analyze Schema', component: SchemaAnalysisStep },
    { id: 3, title: 'Map Fields', component: FieldMappingStep },
    { id: 4, title: 'Validate Data', component: DataValidationStep },
    { id: 5, title: 'Preview & Confirm', component: PreviewConfirmStep },
    { id: 6, title: 'Import', component: ImportExecutionStep }
  ];

  const CurrentStepComponent = steps[currentStep - 1].component;

  return (
    <div className="import-wizard">
      <WizardHeader
        currentStep={currentStep}
        totalSteps={steps.length}
        steps={steps}
      />
      
      <div className="wizard-content">
        <CurrentStepComponent
          data={importData}
          setData={setImportData}
          onNext={() => setCurrentStep(s => s + 1)}
          onBack={() => setCurrentStep(s => s - 1)}
          companyId={companyId}
          businessType={businessType}
        />
      </div>
      
      <WizardFooter
        currentStep={currentStep}
        totalSteps={steps.length}
        onBack={() => setCurrentStep(s => s - 1)}
        onNext={() => setCurrentStep(s => s + 1)}
        canProceed={canProceedToNextStep(currentStep, importData)}
      />
    </div>
  );
}
```

### 2. QualityScoreDashboard Component

```typescript
interface QualityScoreDashboardProps {
  qualityScore: QualityMetrics;
}

function QualityScoreDashboard({ qualityScore }: QualityScoreDashboardProps) {
  const metrics = [
    { name: 'Completeness', score: qualityScore.completeness, color: 'blue' },
    { name: 'Accuracy', score: qualityScore.accuracy, color: 'green' },
    { name: 'Consistency', score: qualityScore.consistency, color: 'purple' },
    { name: 'Uniqueness', score: qualityScore.uniqueness, color: 'orange' }
  ];

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="quality-score-dashboard">
      <h3>Data Quality Score: {qualityScore.overall}%</h3>
      
      <div className="metrics-grid">
        {metrics.map(metric => (
          <div key={metric.name} className="metric-card">
            <div className="metric-name">{metric.name}</div>
            <div className={`metric-score ${getScoreColor(metric.score)}`}>
              {metric.score}%
            </div>
            <div className="metric-bar">
              <div 
                className={`metric-bar-fill ${getScoreBarColor(metric.score)}`}
                style={{ width: `${metric.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      
      <div className="quality-recommendations">
        {qualityScore.overall < 80 && (
          <Alert variant="warning">
            Data quality is below recommended threshold. Consider fixing errors before import.
          </Alert>
        )}
      </div>
    </div>
  );
}
```

### 3. DataPreviewTable Component

```typescript
interface DataPreviewTableProps {
  originalData: Record<string, any>[];
  transformedData: Record<string, any>[];
  validationResults: ValidationError[][];
  viewMode: 'original' | 'transformed' | 'side-by-side';
  onViewModeChange: (mode: 'original' | 'transformed' | 'side-by-side') => void;
}

function DataPreviewTable({
  originalData,
  transformedData,
  validationResults,
  viewMode,
  onViewModeChange
}: DataPreviewTableProps) {
  const [filter, setFilter] = useState<'all' | 'valid' | 'errors' | 'warnings'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const pageSize = 100;

  const filteredData = useMemo(() => {
    return transformedData.filter((row, index) => {
      const errors = validationResults[index];
      const hasErrors = errors.some(e => e.severity === 'error');
      const hasWarnings = errors.some(e => e.severity === 'warning');

      if (filter === 'valid' && (hasErrors || hasWarnings)) return false;
      if (filter === 'errors' && !hasErrors) return false;
      if (filter === 'warnings' && !hasWarnings) return false;

      if (searchQuery) {
        const rowString = JSON.stringify(row).toLowerCase();
        if (!rowString.includes(searchQuery.toLowerCase())) return false;
      }

      return true;
    });
  }, [transformedData, validationResults, filter, searchQuery]);

  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const columns = transformedData.length > 0 ? Object.keys(transformedData[0]) : [];

  const getRowStatus = (index: number) => {
    const errors = validationResults[index];
    const hasErrors = errors.some(e => e.severity === 'error');
    const hasWarnings = errors.some(e => e.severity === 'warning');

    if (hasErrors) return 'error';
    if (hasWarnings) return 'warning';
    return 'valid';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid': return <CheckCircle className="text-green-500" />;
      case 'warning': return <AlertTriangle className="text-yellow-500" />;
      case 'error': return <XCircle className="text-red-500" />;
    }
  };

  return (
    <div className="data-preview-table">
      <div className="table-controls">
        <div className="filters">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rows</SelectItem>
              <SelectItem value="valid">Valid Only</SelectItem>
              <SelectItem value="errors">Errors Only</SelectItem>
              <SelectItem value="warnings">Warnings Only</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="view-mode">
          <RadioGroup value={viewMode} onValueChange={onViewModeChange}>
            <RadioGroupItem value="original">Original</RadioGroupItem>
            <RadioGroupItem value="transformed">Transformed</RadioGroupItem>
            <RadioGroupItem value="side-by-side">Side-by-Side</RadioGroupItem>
          </RadioGroup>
        </div>
      </div>

      <div className="table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Status</TableHead>
              {columns.map(col => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((row, index) => {
              const actualIndex = transformedData.indexOf(row);
              const status = getRowStatus(actualIndex);

              return (
                <TableRow
                  key={actualIndex}
                  className={selectedRow === actualIndex ? 'selected' : ''}
                  onClick={() => setSelectedRow(actualIndex)}
                >
                  <TableCell>{actualIndex + 1}</TableCell>
                  <TableCell>{getStatusIcon(status)}</TableCell>
                  {columns.map(col => (
                    <TableCell key={col}>
                      {viewMode === 'side-by-side' ? (
                        <SideBySideCell
                          original={originalData[actualIndex]?.[col]}
                          transformed={row[col]}
                        />
                      ) : (
                        row[col]
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="table-pagination">
        <span>
          Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} rows
        </span>
        <div className="pagination-controls">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(p => p - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span>Page {currentPage}</span>
          <Button
            variant="outline"
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={currentPage * pageSize >= filteredData.length}
          >
            Next
          </Button>
        </div>
      </div>

      {selectedRow !== null && (
        <RowDetailPanel
          row={transformedData[selectedRow]}
          originalRow={originalData[selectedRow]}
          errors={validationResults[selectedRow]}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
```

### 4. SideBySideCell Component

```typescript
interface SideBySideCellProps {
  original: any;
  transformed: any;
}

function SideBySideCell({ original, transformed }: SideBySideCellProps) {
  const hasChanged = original !== transformed;

  return (
    <div className="side-by-side-cell">
      <div className="cell-original">
        <span className="cell-label">Original:</span>
        <span className={`cell-value ${hasChanged ? 'changed' : ''}`}>
          {original}
        </span>
      </div>
      {hasChanged && (
        <div className="cell-arrow">→</div>
      )}
      <div className="cell-transformed">
        <span className="cell-label">Transformed:</span>
        <span className="cell-value">{transformed}</span>
      </div>
    </div>
  );
}
```

### 5. ValidationPanel Component

```typescript
interface ValidationPanelProps {
  validationResults: ValidationError[][];
  onFixError: (rowIndex: number, error: ValidationError, fixType: string) => void;
  onIgnoreError: (rowIndex: number, error: ValidationError) => void;
}

function ValidationPanel({ validationResults, onFixError, onIgnoreError }: ValidationPanelProps) {
  const [activeTab, setActiveTab] = useState<'errors' | 'warnings' | 'info'>('errors');
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const errors = validationResults
    .map((errors, index) => ({ rowIndex: index, errors }))
    .filter(({ errors }) => errors.some(e => e.severity === 'error'));

  const warnings = validationResults
    .map((errors, index) => ({ rowIndex: index, errors }))
    .filter(({ errors }) => errors.some(e => e.severity === 'warning'));

  const info = validationResults
    .map((errors, index) => ({ rowIndex: index, errors }))
    .filter(({ errors }) => errors.some(e => e.severity === 'info'));

  const getFixSuggestions = (error: ValidationError) => {
    switch (error.code) {
      case 'REQUIRED_FIELD':
        return [
          { label: 'Provide default value', action: 'default' },
          { label: 'Skip row', action: 'skip' },
          { label: 'Edit manually', action: 'edit' }
        ];
      case 'TYPE_MISMATCH':
        return [
          { label: 'Auto-cast type', action: 'cast' },
          { label: 'Edit manually', action: 'edit' }
        ];
      case 'PATTERN_MISMATCH':
        return [
          { label: 'Auto-format', action: 'format' },
          { label: 'Edit manually', action: 'edit' },
          { label: 'Ignore', action: 'ignore' }
        ];
      case 'DUPLICATE_PRODUCT':
        return [
          { label: 'Skip duplicate', action: 'skip' },
          { label: 'Update existing', action: 'update' }
        ];
      default:
        return [
          { label: 'Edit manually', action: 'edit' },
          { label: 'Ignore', action: 'ignore' }
        ];
    }
  };

  const currentItems = activeTab === 'errors' ? errors : activeTab === 'warnings' ? warnings : info;

  return (
    <div className="validation-panel">
      <div className="validation-tabs">
        <button
          className={`tab ${activeTab === 'errors' ? 'active' : ''}`}
          onClick={() => setActiveTab('errors')}
        >
          Errors ({errors.length})
        </button>
        <button
          className={`tab ${activeTab === 'warnings' ? 'active' : ''}`}
          onClick={() => setActiveTab('warnings')}
        >
          Warnings ({warnings.length})
        </button>
        <button
          className={`tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Info ({info.length})
        </button>
      </div>

      <div className="validation-list">
        {currentItems.length === 0 ? (
          <div className="no-issues">
            No {activeTab} found. Great job!
          </div>
        ) : (
          currentItems.map(({ rowIndex, errors }) => (
            <div key={rowIndex} className="validation-item">
              <div
                className="validation-header"
                onClick={() => {
                  setExpandedErrors(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(rowIndex)) {
                      newSet.delete(rowIndex);
                    } else {
                      newSet.add(rowIndex);
                    }
                    return newSet;
                  });
                }}
              >
                <span className="row-number">Row {rowIndex + 1}</span>
                <span className="error-count">{errors.length} issues</span>
                <ChevronDown
                  className={`chevron ${expandedErrors.has(rowIndex) ? 'expanded' : ''}`}
                />
              </div>

              {expandedErrors.has(rowIndex) && (
                <div className="validation-details">
                  {errors.map((error, errorIndex) => (
                    <div key={errorIndex} className="error-detail">
                      <div className="error-message">
                        {error.severity === 'error' && <XCircle className="text-red-500" />}
                        {error.severity === 'warning' && <AlertTriangle className="text-yellow-500" />}
                        {error.severity === 'info' && <Info className="text-blue-500" />}
                        <span>{error.message}</span>
                      </div>

                      <div className="error-field">
                        Field: <code>{error.field}</code>
                        Value: <code>{JSON.stringify(error.value)}</code>
                      </div>

                      <div className="error-actions">
                        {getFixSuggestions(error).map(suggestion => (
                          <Button
                            key={suggestion.action}
                            variant="outline"
                            size="sm"
                            onClick={() => onFixError(rowIndex, error, suggestion.action)}
                          >
                            {suggestion.label}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onIgnoreError(rowIndex, error)}
                        >
                          Ignore
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

### 6. TransformationSummary Component

```typescript
interface TransformationSummaryProps {
  mappingConfig: MappingConfiguration;
  transformedData: Record<string, any>[];
}

function TransformationSummary({ mappingConfig, transformedData }: TransformationSummaryProps) {
  const transformationStats = useMemo(() => {
    const stats = {
      typeCasting: 0,
      formatNormalization: 0,
      lookupResolution: 0,
      enumMapping: 0,
      derivedFields: 0
    };

    for (const mapping of mappingConfig.mappings) {
      if (mapping.transformation) {
        switch (mapping.transformation.type) {
          case 'cast':
            stats.typeCasting += transformedData.length;
            break;
          case 'format':
            stats.formatNormalization += transformedData.length;
            break;
          case 'lookup':
            stats.lookupResolution += transformedData.length;
            break;
          case 'enum_map':
            stats.enumMapping += transformedData.length;
            break;
        }
      }
    }

    // Count derived fields
    stats.derivedFields = transformedData.length * DERIVED_FIELD_RULES.length;

    return stats;
  }, [mappingConfig, transformedData]);

  return (
    <div className="transformation-summary">
      <h3>Applied Transformations</h3>
      
      <div className="transformation-list">
        <div className="transformation-item">
          <span className="transformation-type">Type Casting</span>
          <span className="transformation-count">{transformationStats.typeCasting} fields</span>
          <span className="transformation-desc">string → decimal</span>
        </div>

        <div className="transformation-item">
          <span className="transformation-type">Format Normalization</span>
          <span className="transformation-count">{transformationStats.formatNormalization} values</span>
          <span className="transformation-desc">phone, date, GST formats</span>
        </div>

        <div className="transformation-item">
          <span className="transformation-type">Lookup Resolution</span>
          <span className="transformation-count">{transformationStats.lookupResolution} lookups</span>
          <span className="transformation-desc">FK matching</span>
        </div>

        <div className="transformation-item">
          <span className="transformation-type">Enum Mapping</span>
          <span className="transformation-count">{transformationStats.enumMapping} values</span>
          <span className="transformation-desc">drug_schedule, order_status</span>
        </div>

        <div className="transformation-item">
          <span className="transformation-type">Derived Fields</span>
          <span className="transformation-count">{transformationStats.derivedFields} calculations</span>
          <span className="transformation-desc">total_price, gst_amount, etc.</span>
        </div>
      </div>
    </div>
  );
}
```

### 7. RowDetailPanel Component

```typescript
interface RowDetailPanelProps {
  row: Record<string, any>;
  originalRow: Record<string, any>;
  errors: ValidationError[];
  onClose: () => void;
}

function RowDetailPanel({ row, originalRow, errors, onClose }: RowDetailPanelProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedRow, setEditedRow] = useState(row);

  const handleFieldChange = (field: string, value: any) => {
    setEditedRow(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // Emit save event
    onClose();
  };

  return (
    <div className="row-detail-panel">
      <div className="panel-header">
        <h3>Row Details</h3>
        <Button variant="ghost" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="panel-content">
        <div className="field-list">
          {Object.keys(row).map(field => (
            <div key={field} className="field-item">
              <label>{field}</label>
              {editMode ? (
                <Input
                  value={editedRow[field]}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                />
              ) : (
                <div className="field-value">
                  <span className="original">{originalRow[field]}</span>
                  {originalRow[field] !== row[field] && (
                    <span className="arrow">→</span>
                  )}
                  <span className="transformed">{row[field]}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {errors.length > 0 && (
          <div className="row-errors">
            <h4>Validation Errors</h4>
            {errors.map((error, index) => (
              <div key={index} className="error-item">
                <AlertCircle className="text-red-500" />
                <span>{error.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel-footer">
        <Button variant="outline" onClick={() => setEditMode(!editMode)}>
          {editMode ? 'Cancel' : 'Edit'}
        </Button>
        {editMode && (
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        )}
      </div>
    </div>
  );
}
```

### 8. ImportConfirmationDialog Component

```typescript
interface ImportConfirmationDialogProps {
  summary: ImportSummary;
  onConfirm: () => void;
  onCancel: () => void;
}

function ImportConfirmationDialog({ summary, onConfirm, onCancel }: ImportConfirmationDialogProps) {
  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="import-confirmation-dialog">
        <DialogHeader>
          <DialogTitle>Confirm Import</DialogTitle>
          <DialogDescription>
            Please review the import summary before proceeding
          </DialogDescription>
        </DialogHeader>

        <div className="confirmation-summary">
          <div className="summary-item">
            <span className="label">Total Rows:</span>
            <span className="value">{summary.totalRows}</span>
          </div>

          <div className="summary-item">
            <span className="label">Valid Rows:</span>
            <span className="value text-green-600">{summary.validRows}</span>
          </div>

          <div className="summary-item">
            <span className="label">Error Rows:</span>
            <span className="value text-red-600">{summary.errorRows}</span>
          </div>

          <div className="summary-item">
            <span className="label">Warning Rows:</span>
            <span className="value text-yellow-600">{summary.warningRows}</span>
          </div>

          <div className="summary-item">
            <span className="label">Quality Score:</span>
            <span className="value">{summary.qualityScore}%</span>
          </div>
        </div>

        {summary.errorRows > 0 && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>
              There are {summary.errorRows} rows with errors. These will be skipped during import.
            </AlertDescription>
          </Alert>
        )}

        <div className="import-options">
          <Checkbox id="skip-errors" defaultChecked />
          <label htmlFor="skip-errors">
            Skip rows with errors
          </label>

          <Checkbox id="stop-on-error" />
          <label htmlFor="stop-on-error">
            Stop import on first error
          </label>

          <Checkbox id="create-lookups" defaultChecked />
          <label htmlFor="create-lookups">
            Auto-create missing lookup records
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Import {summary.validRows} Rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Styling Guidelines

### Color Scheme

```css
/* Status Colors */
--status-valid: #22c55e;      /* Green */
--status-warning: #eab308;   /* Yellow */
--status-error: #ef4444;     /* Red */
--status-info: #3b82f6;      /* Blue */

/* Quality Score Colors */
--quality-excellent: #22c55e;  /* 90-100% */
--quality-good: #84cc16;      /* 80-89% */
--quality-fair: #eab308;      /* 70-79% */
--quality-poor: #ef4444;      /* < 70% */

/* UI Colors */
--bg-primary: #ffffff;
--bg-secondary: #f8fafc;
--bg-tertiary: #f1f5f9;
--border-color: #e2e8f0;
--text-primary: #0f172a;
--text-secondary: #64748b;
```

### Component Styles

```css
.import-wizard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

.quality-score-dashboard {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-top: 1rem;
}

.metric-card {
  background: var(--bg-primary);
  border-radius: 6px;
  padding: 1rem;
  text-align: center;
}

.metric-bar {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  margin-top: 0.5rem;
  overflow: hidden;
}

.metric-bar-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.data-preview-table {
  background: var(--bg-primary);
  border-radius: 8px;
  overflow: hidden;
}

.table-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.side-by-side-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.cell-original,
.cell-transformed {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.cell-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.cell-value.changed {
  color: var(--status-warning);
  font-weight: 500;
}

.validation-panel {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
  margin-top: 2rem;
}

.validation-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.validation-item {
  border-bottom: 1px solid var(--border-color);
}

.validation-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  cursor: pointer;
  transition: background 0.2s;
}

.validation-header:hover {
  background: var(--bg-tertiary);
}

.chevron {
  transition: transform 0.2s;
}

.chevron.expanded {
  transform: rotate(180deg);
}

.error-detail {
  padding: 0.75rem;
  padding-left: 2rem;
  background: var(--bg-tertiary);
}

.error-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
```

## Responsive Design

### Mobile Adaptations

```css
@media (max-width: 768px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .table-controls {
    flex-direction: column;
    gap: 1rem;
  }

  .side-by-side-cell {
    flex-direction: column;
    align-items: flex-start;
  }

  .validation-tabs {
    flex-wrap: wrap;
  }
}

@media (max-width: 480px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .import-wizard {
    padding: 1rem;
  }
}
```

## Accessibility

### Keyboard Navigation

- Tab order follows logical flow
- All interactive elements are keyboard accessible
- Escape key closes dialogs and panels
- Enter/Space activates buttons and checkboxes

### Screen Reader Support

- All icons have appropriate aria-labels
- Status indicators use aria-live regions
- Table headers have proper scope attributes
- Error messages are announced to screen readers

### Focus Management

- Focus is trapped in dialogs
- Focus moves to first interactive element when panel opens
- Focus returns to trigger when panel closes

---

**Last Updated**: 2026-05-13
**Status**: Design Complete - Ready for Implementation
