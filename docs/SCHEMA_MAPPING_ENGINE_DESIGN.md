# AI-Powered Schema Mapping Engine - Technical Design

## Overview
The Schema Mapping Engine is the core AI component that automatically maps fields from source ERP schemas to the target ERP schema. It uses semantic similarity, pattern recognition, and LLM-powered analysis to generate high-confidence mapping rules.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SCHEMA MAPPING ENGINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input: Source Schema + Target Schema + Business Context                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PHASE 1: PRE-PROCESSING                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Normalize    │  │ Extract      │  │ Enrich       │                │    │
│  │  │ Column Names │  │ Sample Data  │  │ Metadata     │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PHASE 2: RULE-BASED MAPPING                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Exact Match  │  │ Fuzzy Match  │  │ Pattern Match │                │    │
│  │  │ (95-100%)    │  │ (70-94%)     │  │ (50-69%)     │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PHASE 3: AI-POWERED MAPPING                       │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Semantic     │  │ Contextual   │  │ Cross-Entity │                │    │
│  │  │ Similarity   │  │ Analysis     │  │ Resolution   │                │    │
│  │  │ (LLM)        │  │ (Business Type)│  │ (FKs)        │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PHASE 4: CONFIDENCE SCORING                       │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Multi-Factor │  │ Threshold    │  │ Ranking      │                │    │
│  │  │ Scoring      │  │ Filtering    │  │ & Selection  │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PHASE 5: TRANSFORMATION SUGGESTIONS                │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Type Casting │  │ Format Norm  │  │ Lookup       │                │    │
│  │  │ Suggestions  │  │ Suggestions  │  │ Suggestions  │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Output: MappingConfiguration with confidence scores + transformations      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Phase 1: Pre-Processing

### Column Name Normalization

```typescript
function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[_\-\s]+/g, '_')  // Replace separators with underscore
    .replace(/[^\w]/g, '')       // Remove special chars
    .replace(/^_+|_+$/g, '');   // Trim underscores
}

// Examples:
// "Product Name" → "product_name"
// "product-name" → "product_name"
// "PRODUCT_NAME" → "product_name"
// "Product_Name_123" → "product_name_123"
```

### Sample Data Enrichment

```typescript
interface EnrichedColumn {
  name: string;
  normalized: string;
  dataType: DataType;
  sampleValues: any[];
  
  // Pattern detection
  patterns: PatternMatch[];
  
  // Semantic hints
  semanticHints: SemanticHint[];
  
  // Statistics
  stats: {
    nullCount: number;
    uniqueCount: number;
    avgLength: number;
    minLength: number;
    maxLength: number;
  };
}

interface PatternMatch {
  pattern: string;
  regex: RegExp;
  matchCount: number;
  matchPercentage: number;
}

interface SemanticHint {
  type: 'email' | 'phone' | 'url' | 'gst' | 'date' | 'currency' | 'percentage';
  confidence: number;
}

// Pattern Detection Rules
const PATTERNS = [
  {
    type: 'email',
    regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    threshold: 0.8
  },
  {
    type: 'phone',
    regex: /^[\d\s\-\+\(\)]{10,20}$/,
    threshold: 0.7
  },
  {
    type: 'gst',
    regex: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    threshold: 0.9
  },
  {
    type: 'url',
    regex: /^https?:\/\/.+/,
    threshold: 0.8
  },
  {
    type: 'currency',
    regex: /^[\$₹€£]\s*\d+([.,]\d{2})?$/,
    threshold: 0.7
  }
];
```

## Phase 2: Rule-Based Mapping

### Exact Match (95-100% confidence)

```typescript
function exactMatch(source: string, target: string): number {
  const normSource = normalizeColumnName(source);
  const normTarget = normalizeColumnName(target);
  
  if (normSource === normTarget) {
    return 100;
  }
  
  return 0;
}

// Examples:
// "product_name" → "product_name" = 100%
// "Product Name" → "product_name" = 100%
```

### Fuzzy Match (70-94% confidence)

```typescript
function fuzzyMatch(source: string, target: string): number {
  const normSource = normalizeColumnName(source);
  const normTarget = normalizeColumnName(target);
  
  // Levenshtein distance
  const distance = levenshteinDistance(normSource, normTarget);
  const maxLen = Math.max(normSource.length, normTarget.length);
  const similarity = 1 - (distance / maxLen);
  
  // Common prefix/suffix bonus
  if (normSource.startsWith(normTarget) || normTarget.startsWith(normSource)) {
    return Math.min(95, similarity * 100 + 10);
  }
  
  return similarity * 100;
}

// Examples:
// "prod_name" → "product_name" = 85%
// "supplier_contact" → "contact_person" = 75%
// "mfg_date" → "manufacturing_date" = 80%
```

### Pattern Match (50-69% confidence)

```typescript
function patternMatch(sourceColumn: EnrichedColumn, targetField: FieldInfo): number {
  // Match based on semantic hints
  for (const hint of sourceColumn.semanticHints) {
    if (targetField.semanticType === hint.type) {
      return 60 + (hint.confidence * 0.4);
    }
  }
  
  // Match based on data type
  if (sourceColumn.dataType === targetField.dataType) {
    return 55;
  }
  
  return 0;
}

// Examples:
// Column with email pattern → email field = 65%
// Column with phone pattern → phone field = 65%
// Column with GST pattern → gst_number field = 70%
```

## Phase 3: AI-Powered Mapping

### LLM Prompt Engineering

```typescript
function generateMappingPrompt(
  sourceSchema: SourceSchema,
  targetSchema: TargetSchema,
  businessType: string
): string {
  const sourceColumns = sourceSchema.columns.map(col => 
    `- ${col.name} (${col.dataType}): ${col.sampleValues.slice(0, 3).join(', ')}`
  ).join('\n');
  
  const targetFields = targetSchema.fields.map(field => 
    `- ${field.name} (${field.dataType}): ${field.description || 'No description'}`
  ).join('\n');
  
  return `
You are an expert data migration specialist. Your task is to map fields from a source ERP system to a target ERP system.

BUSINESS CONTEXT:
- Business Type: ${businessType} (pharmacy/electronics/general_trading)
- This affects field priorities (e.g., drug_schedule for pharmacy)

SOURCE COLUMNS:
${sourceColumns}

TARGET FIELDS:
${targetFields}

ANALYSIS INSTRUCTIONS:
1. Analyze each source column to understand its semantic meaning
2. Match it to the most appropriate target field
3. Consider business context for field prioritization
4. Provide a confidence score (0-100) for each mapping
5. Suggest transformations if needed (type casting, format normalization, etc.)
6. Explain your reasoning for each mapping

OUTPUT FORMAT (JSON):
{
  "mappings": [
    {
      "sourceColumn": "column_name",
      "targetField": "field_name",
      "confidence": 95,
      "reasoning": "Explanation of why this mapping makes sense",
      "transformation": {
        "type": "cast|format|lookup|derive",
        "params": {}
      }
    }
  ],
  "unmappedSource": ["columns that couldn't be mapped"],
  "unmappedTarget": ["fields that couldn't be mapped"],
  "detectedERP": "Name of detected ERP system (if identifiable)",
  "recommendations": ["Suggestions for improving the import"]
}

Provide ONLY the JSON output, no additional text.
`;
}
```

### Semantic Similarity Analysis

```typescript
interface SemanticMappingResult {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  reasoning: string;
  transformation?: TransformationRule;
}

async function semanticMapping(
  sourceSchema: SourceSchema,
  targetSchema: TargetSchema,
  businessType: string
): Promise<SemanticMappingResult[]> {
  const prompt = generateMappingPrompt(sourceSchema, targetSchema, businessType);
  
  const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('FIREWORKS_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
      messages: [
        { role: 'system', content: 'You are a data migration expert. Output only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,  // Low temperature for consistent results
      max_tokens: 2000
    })
  });
  
  const data = await response.json();
  const content = data.choices[0].message.content;
  
  // Parse JSON response
  const result = JSON.parse(content);
  return result.mappings;
}
```

### Contextual Analysis

```typescript
interface ContextualMapping {
  businessType: string;
  fieldPriorities: Record<string, number>;
  requiredFields: string[];
  conditionalFields: Record<string, string>;
}

const CONTEXTUAL_RULES: Record<string, ContextualMapping> = {
  pharmacy: {
    businessType: 'pharmacy',
    fieldPriorities: {
      drug_schedule: 100,
      generic_name: 90,
      composition: 85,
      strength: 85,
      expiry_date: 95,
      batch_number: 95
    },
    requiredFields: ['drug_schedule', 'expiry_date', 'batch_number'],
    conditionalFields: {
      drug_schedule: 'if drug_schedule != "none", require prescription_number'
    }
  },
  electronics: {
    businessType: 'electronics',
    fieldPriorities: {
      serial_number: 95,
      warranty_period: 90,
      model_number: 85,
      brand: 80
    },
    requiredFields: ['serial_number', 'model_number'],
    conditionalFields: {}
  },
  general_trading: {
    businessType: 'general_trading',
    fieldPriorities: {},
    requiredFields: [],
    conditionalFields: {}
  }
};

function applyContextualRules(
  mappings: SemanticMappingResult[],
  businessType: string
): SemanticMappingResult[] {
  const context = CONTEXTUAL_RULES[businessType] || CONTEXTUAL_RULES.general_trading;
  
  return mappings.map(mapping => {
    const priority = context.fieldPriorities[mapping.targetField] || 0;
    
    // Boost confidence for high-priority fields
    if (priority > 80) {
      mapping.confidence = Math.min(100, mapping.confidence + 10);
    }
    
    return mapping;
  });
}
```

## Phase 4: Confidence Scoring

### Multi-Factor Scoring Algorithm

```typescript
interface ConfidenceFactors {
  exactMatch: number;      // 0-100
  fuzzyMatch: number;      // 0-100
  patternMatch: number;    // 0-100
  semanticMatch: number;   // 0-100 (from LLM)
  contextualBoost: number;  // 0-20
  dataConsistency: number; // 0-100
}

function calculateConfidence(factors: ConfidenceFactors): number {
  const weights = {
    exactMatch: 0.35,
    fuzzyMatch: 0.20,
    patternMatch: 0.15,
    semanticMatch: 0.20,
    contextualBoost: 0.05,
    dataConsistency: 0.05
  };
  
  let score = 0;
  score += factors.exactMatch * weights.exactMatch;
  score += factors.fuzzyMatch * weights.fuzzyMatch;
  score += factors.patternMatch * weights.patternMatch;
  score += factors.semanticMatch * weights.semanticMatch;
  score += factors.contextualBoost * weights.contextualBoost;
  score += factors.dataConsistency * weights.dataConsistency;
  
  return Math.min(100, Math.round(score));
}

// Example calculation:
// exactMatch: 0 (no exact match)
// fuzzyMatch: 80 (similar names)
// patternMatch: 60 (data type match)
// semanticMatch: 85 (LLM says it's a good match)
// contextualBoost: 10 (high priority field for business type)
// dataConsistency: 90 (consistent data format)
// 
// Score = 0*0.35 + 80*0.20 + 60*0.15 + 85*0.20 + 10*0.05 + 90*0.05
//       = 0 + 16 + 9 + 17 + 0.5 + 4.5
//       = 47%
```

### Threshold Filtering

```typescript
interface MappingThresholds {
  high: number;   // Auto-accept threshold
  medium: number; // Require review
  low: number;    // Require manual mapping
}

const DEFAULT_THRESHOLDS: MappingThresholds = {
  high: 85,    // Auto-accept
  medium: 60,  // Review suggested
  low: 30      // Manual mapping required
};

function filterMappings(
  mappings: MappingRule[],
  thresholds: MappingThresholds
): {
  autoAccept: MappingRule[];
  review: MappingRule[];
  manual: MappingRule[];
} {
  return {
    autoAccept: mappings.filter(m => m.confidence >= thresholds.high),
    review: mappings.filter(m => m.confidence >= thresholds.medium && m.confidence < thresholds.high),
    manual: mappings.filter(m => m.confidence < thresholds.medium)
  };
}
```

## Phase 5: Transformation Suggestions

### Type Casting Suggestions

```typescript
interface TypeCastingSuggestion {
  sourceType: DataType;
  targetType: DataType;
  transformation: string;
  example: {
    input: any;
    output: any;
  };
}

const TYPE_CASTING_RULES: TypeCastingSuggestion[] = [
  {
    sourceType: 'string',
    targetType: 'number',
    transformation: 'parseFloat(value)',
    example: { input: '123.45', output: 123.45 }
  },
  {
    sourceType: 'string',
    targetType: 'integer',
    transformation: 'parseInt(value)',
    example: { input: '123', output: 123 }
  },
  {
    sourceType: 'string',
    targetType: 'date',
    transformation: 'parseDate(value)',
    example: { input: '2024-01-15', output: '2024-01-15' }
  },
  {
    sourceType: 'string',
    targetType: 'boolean',
    transformation: 'value.toLowerCase() === "true" || value === "1"',
    example: { input: 'true', output: true }
  }
];

function suggestTypeCasting(
  sourceColumn: EnrichedColumn,
  targetField: FieldInfo
): TransformationRule | null {
  if (sourceColumn.dataType === targetField.dataType) {
    return null;
  }
  
  const rule = TYPE_CASTING_RULES.find(
    r => r.sourceType === sourceColumn.dataType && r.targetType === targetField.dataType
  );
  
  if (rule) {
    return {
      type: 'cast',
      params: {
        from: sourceColumn.dataType,
        to: targetField.dataType,
        transformation: rule.transformation
      }
    };
  }
  
  return null;
}
```

### Format Normalization Suggestions

```typescript
interface FormatNormalizationRule {
  pattern: RegExp;
  transformation: string;
  description: string;
}

const FORMAT_NORMALIZATION_RULES: FormatNormalizationRule[] = [
  {
    pattern: /^(\d{2})\/(\d{2})\/(\d{4})$/,
    transformation: 'formatDate("$3-$1-$2")',
    description: 'Convert MM/DD/YYYY to YYYY-MM-DD'
  },
  {
    pattern: /^(\d{4})-(\d{2})-(\d{2})$/,
    transformation: 'value',
    description: 'Already in correct format'
  },
  {
    pattern: /^\+?[\d\s\-\(\)]+$/,
    transformation: 'value.replace(/[\s\-\(\)]/g, "")',
    description: 'Remove spaces, dashes, parentheses from phone'
  },
  {
    pattern: /^[A-Z]{2}[0-9]{2}[A-Z]{4}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    transformation: 'value',
    description: 'Valid GST format'
  }
];

function suggestFormatNormalization(
  sourceColumn: EnrichedColumn,
  targetField: FieldInfo
): TransformationRule | null {
  if (sourceColumn.semanticHints.length === 0) {
    return null;
  }
  
  const semanticType = sourceColumn.semanticHints[0].type;
  
  if (semanticType === 'date' && targetField.dataType === 'date') {
    return {
      type: 'format',
      params: {
        targetFormat: 'YYYY-MM-DD',
        transformation: 'normalizeDate(value)'
      }
    };
  }
  
  if (semanticType === 'phone' && targetField.name === 'phone') {
    return {
      type: 'format',
      params: {
        transformation: 'value.replace(/[^0-9]/g, "")'
      }
    };
  }
  
  return null;
}
```

### Lookup Resolution Suggestions

```typescript
interface LookupSuggestion {
  lookupTable: string;
  lookupField: string;
  matchField: string;
  createIfMissing: boolean;
}

function suggestLookupResolution(
  sourceColumn: EnrichedColumn,
  targetField: FieldInfo
): TransformationRule | null {
  // Check if target field is a foreign key
  if (!targetField.isForeignKey) {
    return null;
  }
  
  const lookupTable = targetField.references.table;
  const lookupField = targetField.references.field;
  
  // Suggest lookup based on semantic hints
  if (sourceColumn.semanticHints.some(h => h.type === 'email')) {
    return {
      type: 'lookup',
      params: {
        table: lookupTable,
        matchField: 'email',
        returnField: 'id',
        createIfMissing: false
      }
    };
  }
  
  if (sourceColumn.name.toLowerCase().includes('name')) {
    return {
      type: 'lookup',
      params: {
        table: lookupTable,
        matchField: 'name',
        returnField: 'id',
        createIfMissing: false
      }
    };
  }
  
  return null;
}
```

## Edge Function Implementation

```typescript
// supabase/functions/schema-mapper/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sourceSchema, targetEntityType, businessType } = await req.json();

    // Get target schema from database
    const targetSchema = await getTargetSchema(targetEntityType, businessType);
    
    // Phase 1: Pre-processing
    const enrichedSource = enrichSourceSchema(sourceSchema);
    
    // Phase 2: Rule-based mapping
    const ruleBasedMappings = generateRuleBasedMappings(enrichedSource, targetSchema);
    
    // Phase 3: AI-powered mapping
    const aiMappings = await generateAIMappings(enrichedSource, targetSchema, businessType);
    
    // Phase 4: Merge and score
    const mergedMappings = mergeAndScoreMappings(ruleBasedMappings, aiMappings);
    
    // Phase 5: Transformation suggestions
    const mappingsWithTransforms = addTransformationSuggestions(
      mergedMappings,
      enrichedSource,
      targetSchema
    );
    
    // Filter by thresholds
    const { autoAccept, review, manual } = filterMappings(
      mappingsWithTransforms,
      DEFAULT_THRESHOLDS
    );
    
    const result = {
      mappings: mappingsWithTransforms,
      autoAccept,
      review,
      manual,
      unmappedSource: findUnmappedSource(enrichedSource, mappingsWithTransforms),
      unmappedTarget: findUnmappedTarget(targetSchema, mappingsWithTransforms),
      overallConfidence: calculateOverallConfidence(mappingsWithTransforms),
      detectedERP: detectERPSystem(enrichedSource),
      recommendations: generateRecommendations(mappingsWithTransforms)
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Schema mapping error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getTargetSchema(entityType: string, businessType: string): Promise<TargetSchema> {
  // Fetch from database or return hardcoded schema
  const schemas = {
    products: {
      entity: 'products',
      fields: [
        { name: 'name', dataType: 'string', required: true, description: 'Product name' },
        { name: 'manufacturer', dataType: 'string', required: true, description: 'Manufacturer name' },
        { name: 'mrp', dataType: 'decimal', required: true, description: 'Maximum retail price' },
        { name: 'purchase_price', dataType: 'decimal', required: true, description: 'Purchase price' },
        { name: 'drug_schedule', dataType: 'enum', required: false, description: 'Drug schedule (pharmacy only)' },
        // ... more fields
      ]
    },
    suppliers: {
      entity: 'suppliers',
      fields: [
        { name: 'name', dataType: 'string', required: true, description: 'Supplier name' },
        { name: 'contact_person', dataType: 'string', required: false, description: 'Contact person' },
        { name: 'phone', dataType: 'string', required: false, description: 'Phone number' },
        { name: 'email', dataType: 'string', required: false, description: 'Email address' },
        { name: 'gst_number', dataType: 'string', required: false, description: 'GST number' },
        // ... more fields
      ]
    }
    // ... more entity types
  };
  
  return schemas[entityType as keyof typeof schemas] || { entity: entityType, fields: [] };
}

// ... helper functions for each phase
```

## UI Component Design

### MappingEditor Component

```typescript
interface MappingEditorProps {
  sourceSchema: SourceSchema;
  targetSchema: TargetSchema;
  initialMappings?: MappingRule[];
  onMappingsChange: (mappings: MappingRule[]) => void;
}

function MappingEditor({ sourceSchema, targetSchema, initialMappings, onMappingsChange }: MappingEditorProps) {
  const [mappings, setMappings] = useState<MappingRule[]>(initialMappings || []);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  
  const handleMappingChange = (sourceColumn: string, targetField: string) => {
    const updated = mappings.map(m => 
      m.sourceColumn === sourceColumn 
        ? { ...m, targetField, confidence: calculateConfidence(sourceColumn, targetField) }
        : m
    );
    setMappings(updated);
    onMappingsChange(updated);
  };
  
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };
  
  return (
    <div className="mapping-editor">
      <div className="grid grid-cols-2 gap-4">
        {/* Source Columns */}
        <div className="source-columns">
          <h3>Source Columns</h3>
          {sourceSchema.columns.map(col => (
            <div 
              key={col.name}
              className={`column-item ${selectedSource === col.name ? 'selected' : ''}`}
              onClick={() => setSelectedSource(col.name)}
            >
              <span className="column-name">{col.name}</span>
              <span className="column-type">{col.dataType}</span>
            </div>
          ))}
        </div>
        
        {/* Target Fields */}
        <div className="target-fields">
          <h3>Target Fields</h3>
          {targetSchema.fields.map(field => (
            <div key={field.name} className="field-item">
              <span className="field-name">{field.name}</span>
              <span className="field-type">{field.dataType}</span>
              {field.required && <span className="required-badge">Required</span>}
            </div>
          ))}
        </div>
      </div>
      
      {/* Mapping Lines */}
      <svg className="mapping-lines">
        {mappings.map(mapping => (
          <line
            key={`${mapping.sourceColumn}-${mapping.targetField}`}
            x1={getSourcePosition(mapping.sourceColumn)}
            y1={getSourceY(mapping.sourceColumn)}
            x2={getTargetPosition(mapping.targetField)}
            y2={getTargetY(mapping.targetField)}
            stroke={getConfidenceColor(mapping.confidence)}
            strokeWidth={2}
          />
        ))}
      </svg>
      
      {/* Mapping Details Panel */}
      {selectedSource && (
        <div className="mapping-details">
          <h4>Mapping for: {selectedSource}</h4>
          {mappings.filter(m => m.sourceColumn === selectedSource).map(mapping => (
            <div key={mapping.targetField} className="mapping-detail">
              <div className="confidence-score">
                Confidence: {mapping.confidence}%
              </div>
              <div className="transformation">
                {mapping.transformation && (
                  <div>
                    <strong>Transformation:</strong> {mapping.transformation.type}
                  </div>
                )}
              </div>
              <div className="ai-reasoning">
                {mapping.notes && (
                  <div>
                    <strong>AI Reasoning:</strong> {mapping.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Performance Optimization

### Caching Strategy

```typescript
interface MappingCache {
  key: string; // hash of sourceSchema + targetSchema + businessType
  mappings: MappingRule[];
  timestamp: number;
  ttl: number; // time to live in milliseconds
}

const mappingCache = new Map<string, MappingCache>();

function getCachedMappings(
  sourceSchema: SourceSchema,
  targetSchema: TargetSchema,
  businessType: string
): MappingRule[] | null {
  const key = generateCacheKey(sourceSchema, targetSchema, businessType);
  const cached = mappingCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.mappings;
  }
  
  return null;
}

function setCachedMappings(
  sourceSchema: SourceSchema,
  targetSchema: TargetSchema,
  businessType: string,
  mappings: MappingRule[],
  ttl: number = 3600000 // 1 hour
): void {
  const key = generateCacheKey(sourceSchema, targetSchema, businessType);
  mappingCache.set(key, {
    key,
    mappings,
    timestamp: Date.now(),
    ttl
  });
}
```

### Batch Processing

```typescript
async function batchGenerateMappings(
  sourceSchemas: SourceSchema[],
  targetSchema: TargetSchema,
  businessType: string,
  batchSize: number = 5
): Promise<MappingConfiguration[]> {
  const results: MappingConfiguration[] = [];
  
  for (let i = 0; i < sourceSchemas.length; i += batchSize) {
    const batch = sourceSchemas.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(schema => generateMappings(schema, targetSchema, businessType))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('Schema Mapping Engine', () => {
  describe('normalizeColumnName', () => {
    it('should normalize column names correctly', () => {
      expect(normalizeColumnName('Product Name')).toBe('product_name');
      expect(normalizeColumnName('product-name')).toBe('product_name');
      expect(normalizeColumnName('PRODUCT_NAME')).toBe('product_name');
    });
  });
  
  describe('exactMatch', () => {
    it('should return 100 for exact matches', () => {
      expect(exactMatch('product_name', 'product_name')).toBe(100);
      expect(exactMatch('Product Name', 'product_name')).toBe(100);
    });
    
    it('should return 0 for non-matches', () => {
      expect(exactMatch('product_name', 'supplier_name')).toBe(0);
    });
  });
  
  describe('fuzzyMatch', () => {
    it('should return high confidence for similar names', () => {
      expect(fuzzyMatch('prod_name', 'product_name')).toBeGreaterThan(80);
    });
  });
  
  describe('calculateConfidence', () => {
    it('should calculate weighted confidence correctly', () => {
      const factors: ConfidenceFactors = {
        exactMatch: 0,
        fuzzyMatch: 80,
        patternMatch: 60,
        semanticMatch: 85,
        contextualBoost: 10,
        dataConsistency: 90
      };
      
      const score = calculateConfidence(factors);
      expect(score).toBeGreaterThan(40);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
```

### Integration Tests

```typescript
describe('Schema Mapping Integration', () => {
  it('should generate mappings for product import', async () => {
    const sourceSchema: SourceSchema = {
      format: 'csv',
      columns: [
        { name: 'Product Name', dataType: 'string', sampleValues: ['Paracetamol'] },
        { name: 'Manufacturer', dataType: 'string', sampleValues: ['Sun Pharma'] },
        { name: 'MRP', dataType: 'number', sampleValues: [25.50] }
      ],
      sampleRows: [],
      rowCount: 100
    };
    
    const targetSchema = await getTargetSchema('products', 'pharmacy');
    const mappings = await generateMappings(sourceSchema, targetSchema, 'pharmacy');
    
    expect(mappings.mappings).toHaveLength(3);
    expect(mappings.mappings[0].confidence).toBeGreaterThan(80);
  });
});
```

---

**Last Updated**: 2026-05-13
**Status**: Design Complete - Ready for Implementation
