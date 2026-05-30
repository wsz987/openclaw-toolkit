import { CheckIcon } from '../../../components/icons';
import { masterPhases } from '../model/graph';
import type { Stage1Phase } from '../model/types';

type Props = {
  phase: Stage1Phase;
  wizardStep: number;
  onStepSelect: (index: number) => void;
};

export function Stage1Stepper({ phase, wizardStep, onStepSelect }: Props) {
  return (
    <div className="stepper-container shadow-sm">
      {masterPhases.map((phaseItem, index) => {
        let state: 'done' | 'active' | 'pending' = 'pending';

        if (wizardStep === index) {
          state = 'active';
        } else if (wizardStep > index) {
          state = 'done';
        }

        return (
          <div
            key={phaseItem.id}
            className={`step-node group ${state}`}
            onClick={() => {
              if (phase !== 'running' && phase !== 'succeeded' && index <= 1) {
                onStepSelect(index);
              }
            }}
          >
            {index < masterPhases.length - 1 ? (
              <div className="step-node-line">
                <div className="step-node-line-fill" />
              </div>
            ) : null}

            <div className="step-node-circle">
              {state === 'done' ? <CheckIcon size={12} /> : index + 1}
            </div>
            <div className="step-node-label">{phaseItem.label}</div>
          </div>
        );
      })}
    </div>
  );
}
