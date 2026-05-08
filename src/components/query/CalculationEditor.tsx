import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Play, Braces, Calculator } from "lucide-react";
import type { 
  CustomCalculation, 
  CalculationVariable, 
  CreateCalculationInput,
  UpdateCalculationInput 
} from "@/types/queryEngine";
interface CalculationEditorProps {
  calculation?: CustomCalculation | null;
  onSave: (calculation: CreateCalculationInput | UpdateCalculationInput) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  availableTables?: Array<{ name: string; columns: Array<{ name: string; type: string }> }>;
}

const CalculationEditor: React.FC<CalculationEditorProps> = ({
  calculation,
  onSave,
  onCancel,
  isLoading = false,
  availableTables = [],
}) => {
  const [name, setName] = useState(calculation?.name || "");
  const [description, setDescription] = useState(calculation?.description || "");
  const [formula, setFormula] = useState(calculation?.formula || "");
  const [aggregation, setAggregation] = useState(calculation?.aggregation || "none");
  const [resultFormat, setResultFormat] = useState(calculation?.result_format || "number");
  const [isPublic, setIsPublic] = useState(calculation?.is_public || false);
  const [variables, setVariables] = useState<Array<CalculationVariable & { _id: string }>>(
    calculation?.variables?.map((v) => ({ ...v, _id: crypto.randomUUID() })) || []
  );
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Add a new variable
  const addVariable = () => {
    const newVariable: CalculationVariable & { _id: string } = {
      _id: crypto.randomUUID(),
      name: "",
      source: "column",
      table: "",
      column: "",
      type: "number",
    };
    setVariables([...variables, newVariable]);
  };

  // Update a variable
  const updateVariable = (index: number, field: keyof CalculationVariable, value: any) => {
    const updatedVariables = [...variables];
    updatedVariables[index] = { ...updatedVariables[index], [field]: value };
    setVariables(updatedVariables);
  };

  // Check for duplicate variable names
  const hasDuplicateNames = (() => {
    const names = variables.map((v) => v.name.trim()).filter(Boolean);
    return new Set(names).size !== names.length;
  })();

  // Remove a variable
  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  // Test the calculation
  const testCalculation = async () => {
    if (!formula) {
      setTestError("Formula is required");
      return;
    }

    setIsTesting(true);
    setTestError(null);
    setTestResult(null);

    try {
      // Create a mock data set for testing
      const mockData = generateMockData(variables);
      
      // Evaluate the formula safely
      const result = evaluateFormula(formula, mockData);
      setTestResult(result);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Test failed");
    } finally {
      setIsTesting(false);
    }
  };

  // Generate mock data for testing
  const generateMockData = (vars: CalculationVariable[]) => {
    const data: Record<string, any> = {};
    
    vars.forEach((variable) => {
      if (variable.source === "column" && variable.type === "number") {
        data[variable.name] = Math.random() * 100;
      } else if (variable.source === "parameter") {
        data[variable.name] = 10; // Default parameter value
      }
    });
    
    return data;
  };

  // Evaluate formula safely (simplified version)
  const evaluateFormula = (formula: string, data: Record<string, any>): number => {
    // This is a simplified formula evaluator
    // In production, use a proper math expression parser like mathjs
    
    // Replace variables with values
    let expression = formula;
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`\\b${key}\\b`, "g");
      expression = expression.replace(regex, value.toString());
    });
    
    // Basic safety check - only allow numbers and operators
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      throw new Error("Invalid formula: Only numbers and basic operators allowed");
    }
    
    // Evaluate the expression
    try {
      // Using Function constructor is safer than eval
      const result = new Function(`"use strict"; return (${expression})`)();
      return typeof result === "number" ? result : 0;
    } catch (error) {
      throw new Error(`Formula evaluation error: ${error}`);
    }
  };

  // Save the calculation
  const handleSave = async () => {
    if (!name.trim()) {
      setTestError("Name is required");
      return;
    }
    
    if (!formula.trim()) {
      setTestError("Formula is required");
      return;
    }

    if (hasDuplicateNames) {
      setTestError("Variable names must be unique");
      return;
    }

    // Strip _id before saving (it's a UI-only field)
    const cleanVariables = variables.map(({ _id, ...rest }) => rest);

    const calculationData = calculation
      ? ({
          name: name.trim(),
          description: description.trim(),
          formula: formula.trim(),
          variables: cleanVariables,
          aggregation: aggregation === "none" ? null : aggregation,
          result_format: resultFormat,
          is_public: isPublic,
        } as UpdateCalculationInput)
      : ({
          name: name.trim(),
          description: description.trim(),
          formula: formula.trim(),
          variables: cleanVariables,
          aggregation: aggregation === "none" ? null : aggregation,
          result_format: resultFormat,
          is_public: isPublic,
        } as CreateCalculationInput);

    await onSave(calculationData);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            {calculation ? "Edit Calculation" : "Create Calculation"}
          </CardTitle>
          <CardDescription>
            Define custom calculations with formulas and variables
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Profit Margin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="format">Result Format</Label>
              <Select value={resultFormat} onValueChange={(value: "number" | "currency" | "percent" | "decimal") => setResultFormat(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="currency">Currency</SelectItem>
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="decimal">Decimal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this calculation does..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="aggregation">Aggregation</Label>
              <Select value={aggregation || "none"} onValueChange={(value: "sum" | "avg" | "count" | "none") => setAggregation(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select aggregation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="sum">Sum</SelectItem>
                  <SelectItem value="avg">Average</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <input
                type="checkbox"
                id="public"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="public">Make public (visible to all users)</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Braces className="h-5 w-5" />
            Formula & Variables
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="formula">Formula *</Label>
            <Textarea
              id="formula"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="e.g., (revenue - cost) / revenue * 100"
              rows={3}
              className="font-mono"
            />
            <p className="text-sm text-muted-foreground">
              Use variable names from the list below. Supported operations: +, -, *, /, ()
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Variables</Label>
              <Button onClick={addVariable} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add Variable
              </Button>
            </div>

            {variables.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No variables defined. Add variables to use in your formula.
              </p>
            ) : (
              <div className="space-y-3">
                {variables.map((variable, index) => (
                  <div key={variable._id} className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">
                        Variable {index + 1}
                      </Badge>
                      <Button
                        onClick={() => removeVariable(index)}
                        size="sm"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={variable.name}
                          onChange={(e) => updateVariable(index, "name", e.target.value)}
                          placeholder="e.g., revenue"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={variable.source}
                          onValueChange={(value) => updateVariable(index, "source", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="column">Column</SelectItem>
                            <SelectItem value="parameter">Parameter</SelectItem>
                            <SelectItem value="calculation">Calculation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {variable.source === "column" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Table</Label>
                          <Select
                            value={variable.table}
                            onValueChange={(value) => updateVariable(index, "table", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select table" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableTables.map((table) => (
                                <SelectItem key={table.name} value={table.name}>
                                  {table.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Column</Label>
                          <Input
                            value={variable.column}
                            onChange={(e) => updateVariable(index, "column", e.target.value)}
                            placeholder="e.g., amount"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">Data Type</Label>
                      <Select
                        value={variable.type}
                        onValueChange={(value) => updateVariable(index, "type", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={testCalculation}
              disabled={!formula || isTesting}
              variant="outline"
            >
              {isTesting ? (
                <>Testing...</>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Test Formula
                </>
              )}
            </Button>
          </div>

          {testResult !== null && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">Test Result</p>
              <p className="text-lg font-mono text-green-700">{testResult}</p>
            </div>
          )}

          {testError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">{testError}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isLoading}>
          <Save className="h-4 w-4 mr-1" />
          {isLoading ? "Saving..." : calculation ? "Update" : "Create"}
        </Button>
        <Button onClick={onCancel} variant="outline">
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default CalculationEditor;
