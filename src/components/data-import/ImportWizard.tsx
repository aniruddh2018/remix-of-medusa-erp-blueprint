import type { WizardStep } from '@/types/dataImport';

interface ImportWizardProps {
  currentStep: WizardStep;
  setStep: (step: WizardStep) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onNext: () => void;
  onBack: () => void;
  children: React.ReactNode;
  isTallyMultiEntity?: boolean;
  isLastEntity?: boolean;
  hasNextEntity?: boolean;
}

const STEPS: { step: WizardStep; label: string }[] = [
  { step: 'upload', label: 'Upload' },
  { step: 'schema', label: 'Schema' },
  { step: 'mapping', label: 'Mapping' },
  { step: 'preview', label: 'Preview' },
  { step: 'execute', label: 'Execute' },
];

export function ImportWizard({
  currentStep,
  setStep,
  canGoBack,
  canGoForward,
  onNext,
  onBack,
  children,
  isTallyMultiEntity,
  hasNextEntity,
}: ImportWizardProps) {
  const currentIndex = STEPS.findIndex(s => s.step === currentStep);

  let nextLabel = 'Next →';
  if (currentIndex === STEPS.length - 1) nextLabel = 'Finish';
  else if (isTallyMultiEntity && currentStep === 'preview' && hasNextEntity) nextLabel = 'Next Entity →';
  else if (isTallyMultiEntity && currentStep === 'mapping') nextLabel = 'Preview →';

  return (
    <div className="space-y-6" data-enter-nav>
      <nav aria-label="Import wizard steps">
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const isActive = s.step === currentStep;
            const isComplete = i < currentIndex;
            const isClickable = i < currentIndex;
            return (
              <li key={s.step} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && setStep(s.step)}
                  data-enter-nav-focus={isActive ? 'true' : undefined}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${isActive ? 'bg-primary text-primary-foreground' : ''}
                    ${isComplete ? 'bg-primary/10 text-primary cursor-pointer' : ''}
                    ${!isActive && !isComplete ? 'bg-muted text-muted-foreground' : ''}
                  `}
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold border border-current">
                    {isComplete ? '✓' : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-0.5 ${i < currentIndex ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-h-[400px]">{children}</div>

      <div className="flex items-center justify-between pt-4 border-t">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          data-enter-nav-skip={canGoBack ? 'false' : 'true'}
        >
          ← Back
        </button>

        <span className="text-sm text-muted-foreground">
          Step {currentIndex + 1} of {STEPS.length}
        </span>

        <button
          type="button"
          onClick={onNext}
          disabled={!canGoForward}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {currentIndex === STEPS.length - 1 ? 'Finish' : nextLabel}
        </button>
      </div>
    </div>
  );
}

export { STEPS };
