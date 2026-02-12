import { MapPin, Plane, Radio, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { GlassButton } from '../ui/GlassUI';

interface WizardStep {
  id: string;
  title: string;
  icon: React.ReactNode;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'site', title: 'Site', icon: <MapPin size={16} /> },
  { id: 'drones', title: 'Drones', icon: <Plane size={16} /> },
  { id: 'cuas', title: 'CUAS', icon: <Radio size={16} /> },
  { id: 'review', title: 'Review', icon: <CheckCircle size={16} /> },
];

interface WizardNavigationProps {
  currentStep: number;
  canProceed: boolean;
  isSubmitting: boolean;
  validationMessage?: string | null;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function WizardNavigation({
  currentStep,
  canProceed,
  isSubmitting,
  validationMessage,
  onBack,
  onNext,
  onSubmit,
  onCancel,
}: WizardNavigationProps) {
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        paddingTop: '20px',
      }}
    >
      {/* Step Indicators */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {WIZARD_STEPS.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;

          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {/* Step circle */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: isActive
                      ? 'rgba(255, 140, 0, 0.2)'
                      : isCompleted
                      ? 'rgba(34, 197, 94, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: `2px solid ${
                      isActive
                        ? '#ff8c00'
                        : isCompleted
                        ? '#22c55e'
                        : 'rgba(255, 255, 255, 0.2)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive
                      ? '#ff8c00'
                      : isCompleted
                      ? '#22c55e'
                      : 'rgba(255, 255, 255, 0.4)',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {step.icon}
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    color: isActive
                      ? '#ff8c00'
                      : isCompleted
                      ? '#22c55e'
                      : 'rgba(255, 255, 255, 0.4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {step.title}
                </span>
              </div>

              {/* Connector line */}
              {index < WIZARD_STEPS.length - 1 && (
                <div
                  style={{
                    width: '40px',
                    height: '2px',
                    background: isCompleted
                      ? '#22c55e'
                      : 'rgba(255, 255, 255, 0.1)',
                    marginBottom: '20px',
                    transition: 'background 0.3s ease',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Validation Message */}
      {!canProceed && validationMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '8px',
          }}
        >
          <AlertCircle size={14} style={{ color: '#fbbf24' }} />
          <span
            style={{
              fontSize: '12px',
              color: '#fbbf24',
            }}
          >
            {validationMessage}
          </span>
        </div>
      )}

      {/* Navigation Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <GlassButton
          variant="ghost"
          size="md"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </GlassButton>

        <div style={{ display: 'flex', gap: '12px' }}>
          {currentStep > 0 && (
            <GlassButton
              variant="ghost"
              size="md"
              onClick={onBack}
              disabled={isSubmitting}
            >
              Back
            </GlassButton>
          )}

          {isLastStep ? (
            <GlassButton
              variant="primary"
              size="md"
              onClick={onSubmit}
              disabled={!canProceed || isSubmitting}
              style={{
                background: canProceed
                  ? 'rgba(34, 197, 94, 0.2)'
                  : undefined,
                borderColor: canProceed ? '#22c55e' : undefined,
                color: canProceed ? '#22c55e' : undefined,
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Starting...
                </>
              ) : (
                'Start Session'
              )}
            </GlassButton>
          ) : (
            <GlassButton
              variant="primary"
              size="md"
              onClick={onNext}
              disabled={!canProceed}
            >
              Next
            </GlassButton>
          )}
        </div>
      </div>
    </div>
  );
}
