import { CheckIcon } from '../../../components/icons';
import { masterPhases } from '../model/graph';
import type { InstallPhase } from '../model/types';
import type { InstallerWizardStep } from '../model/app-flow';

type Props = {
  phase: InstallPhase;
  wizardStep: InstallerWizardStep;
  onStepSelect: (index: InstallerWizardStep) => void;
  layout?: 'horizontal' | 'vertical';
};

export function InstallerStepper({ phase, wizardStep, onStepSelect, layout = 'horizontal' }: Props) {
  if (layout === 'vertical') {
    return (
      <div className="flex flex-col gap-6 w-full py-4 select-none">
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
              className={`flex items-start gap-4 group cursor-pointer relative ${
                state === 'active' 
                  ? 'text-[hsl(var(--ink))]' 
                  : state === 'done' 
                    ? 'text-[hsl(var(--body-strong))]' 
                    : 'text-[hsl(var(--muted))]'
              }`}
              onClick={() => {
                if (phase !== 'running' && phase !== 'succeeded' && index <= 1) {
                  onStepSelect(index as InstallerWizardStep);
                }
              }}
            >
              {/* Connector line for vertical layout */}
              {index < masterPhases.length - 1 ? (
                <div 
                  className="absolute left-[15px] top-[32px] bottom-[-24px] w-[2px] transition-colors duration-300"
                  style={{
                    backgroundColor: state === 'done' ? 'hsl(var(--success))' : 'hsl(var(--hairline))'
                  }}
                />
              ) : null}

              {/* Step circle indicator */}
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-semibold text-xs transition-all flex-shrink-0 duration-300 ${
                  state === 'done'
                    ? 'bg-[hsl(var(--success))] border-[hsl(var(--success))] text-[hsl(var(--on-primary))]'
                    : state === 'active'
                      ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))] bg-[hsl(var(--canvas))] shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]'
                      : 'border-[hsl(var(--hairline))] text-[hsl(var(--muted))] bg-[hsl(var(--canvas))]'
                }`}
              >
                {state === 'done' ? <CheckIcon size={12} /> : index + 1}
              </div>

              {/* Step labels */}
              <div className="flex flex-col gap-0.5 pt-1">
                <span className={`text-sm font-semibold leading-tight transition-colors duration-200 ${state === 'active' ? 'text-[hsl(var(--primary))] font-bold' : ''}`}>
                  {phaseItem.label}
                </span>
                <span className="text-[10px] text-[hsl(var(--muted-soft))]">
                  {index === 0 && "路径与项目检测"}
                  {index === 1 && "许可密钥与使用源"}
                  {index === 2 && "运行环境依赖部署"}
                  {index === 3 && "配置写入与运行验证"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

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
                onStepSelect(index as InstallerWizardStep);
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
