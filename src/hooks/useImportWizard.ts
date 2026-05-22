import { useReducer, useCallback } from 'react';
import type {
  WizardStep,
  ImportEntityType,
  FieldMapping,
  DetectedColumn,
  ParsedData,
  ValidationResult,
} from '@/types/dataImport';

interface ImportWizardState {
  currentStep: WizardStep;
  parsedData: ParsedData | null;
  detectedColumns: DetectedColumn[];
  selectedEntities: ImportEntityType[];
  currentEntityIndex: number;
  fieldMappings: Record<ImportEntityType, FieldMapping[]>;
  validationResults: Record<ImportEntityType, ValidationResult | null>;
  jobId: string | null;
  error: string | null;
  isLoading: boolean;
}

type WizardAction =
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_PARSED_DATA'; data: ParsedData }
  | { type: 'SET_DETECTED_COLUMNS'; columns: DetectedColumn[] }
  | { type: 'SET_ENTITIES'; entities: ImportEntityType[] }
  | { type: 'NEXT_ENTITY' }
  | { type: 'SET_MAPPINGS'; entityType: ImportEntityType; mappings: FieldMapping[] }
  | { type: 'SET_VALIDATION_RESULT'; entityType: ImportEntityType; result: ValidationResult }
  | { type: 'SET_JOB_ID'; jobId: string }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'RESET' };

const initialState: ImportWizardState = {
  currentStep: 'upload',
  parsedData: null,
  detectedColumns: [],
  selectedEntities: [],
  currentEntityIndex: 0,
  fieldMappings: {} as Record<ImportEntityType, FieldMapping[]>,
  validationResults: {} as Record<ImportEntityType, ValidationResult | null>,
  jobId: null,
  error: null,
  isLoading: false,
};

function wizardReducer(state: ImportWizardState, action: WizardAction): ImportWizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step, error: null };

    case 'SET_PARSED_DATA':
      return { ...state, parsedData: action.data };

    case 'SET_DETECTED_COLUMNS':
      return { ...state, detectedColumns: action.columns };

    case 'SET_ENTITIES':
      return {
        ...state,
        selectedEntities: action.entities,
        currentEntityIndex: 0,
      };

    case 'NEXT_ENTITY':
      return {
        ...state,
        currentEntityIndex: state.currentEntityIndex + 1,
      };

    case 'SET_MAPPINGS':
      return {
        ...state,
        fieldMappings: {
          ...state.fieldMappings,
          [action.entityType]: action.mappings,
        },
      };

    case 'SET_VALIDATION_RESULT':
      return {
        ...state,
        validationResults: {
          ...state.validationResults,
          [action.entityType]: action.result,
        },
      };

    case 'SET_JOB_ID':
      return { ...state, jobId: action.jobId };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function useImportWizard() {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const currentEntity = state.selectedEntities[state.currentEntityIndex] ?? null;
  const currentMappings = currentEntity ? (state.fieldMappings[currentEntity] ?? []) : [];
  const currentValidation = currentEntity
    ? (state.validationResults[currentEntity] ?? null)
    : null;

  const isLastEntity = state.currentEntityIndex >= state.selectedEntities.length - 1;
  const hasNextEntity = state.currentEntityIndex < state.selectedEntities.length - 1;
  const hasPreviousEntity = state.currentEntityIndex > 0;

  const setStep = useCallback((step: WizardStep) => dispatch({ type: 'SET_STEP', step }), []);
  const setParsedData = useCallback(
    (data: ParsedData) => dispatch({ type: 'SET_PARSED_DATA', data }),
    []
  );
  const setDetectedColumns = useCallback(
    (columns: DetectedColumn[]) => dispatch({ type: 'SET_DETECTED_COLUMNS', columns }),
    []
  );
  const setEntities = useCallback(
    (entities: ImportEntityType[]) => dispatch({ type: 'SET_ENTITIES', entities }),
    []
  );
  const nextEntity = useCallback(() => dispatch({ type: 'NEXT_ENTITY' }), []);
  const setMappings = useCallback(
    (entityType: ImportEntityType, mappings: FieldMapping[]) =>
      dispatch({ type: 'SET_MAPPINGS', entityType, mappings }),
    []
  );
  const setValidationResult = useCallback(
    (entityType: ImportEntityType, result: ValidationResult) =>
      dispatch({ type: 'SET_VALIDATION_RESULT', entityType, result }),
    []
  );
  const setJobId = useCallback((jobId: string) => dispatch({ type: 'SET_JOB_ID', jobId }), []);
  const setError = useCallback((error: string | null) => dispatch({ type: 'SET_ERROR', error }), []);
  const setLoading = useCallback((isLoading: boolean) => dispatch({ type: 'SET_LOADING', isLoading }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return {
    ...state,
    currentEntity,
    currentMappings,
    currentValidation,
    isLastEntity,
    hasNextEntity,
    hasPreviousEntity,
    setStep,
    setParsedData,
    setDetectedColumns,
    setEntities,
    nextEntity,
    setMappings,
    setValidationResult,
    setJobId,
    setError,
    setLoading,
    reset,
  };
}

export type { ImportWizardState };
