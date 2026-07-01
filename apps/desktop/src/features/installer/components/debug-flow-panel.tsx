import { Button } from '../../../components/ui/button';
import { Select } from '../../../components/ui/select';
import type { InstallerWizardStep } from '../model/app-flow';
import type { DebugBootstrapMode } from '../model/debug-flow';

type DebugFlowPanelProps = {
  mode: DebugBootstrapMode;
  canForceInstalledHome: boolean;
  installerStep: InstallerWizardStep;
  onModeChange: (value: DebugBootstrapMode) => void;
  onInstallerStepChange: (value: InstallerWizardStep) => void;
};

const stepOptions: Array<{ value: InstallerWizardStep; label: string }> = [
  { value: 0, label: '步骤 1: 预检查' },
  { value: 1, label: '步骤 2: 配置' },
  { value: 2, label: '步骤 3: 依赖部署' },
  { value: 3, label: '步骤 4: 配置验证' }
];

export function DebugFlowPanel({
  mode,
  canForceInstalledHome,
  installerStep,
  onModeChange,
  onInstallerStepChange
}: DebugFlowPanelProps) {
  return (
    <section className="fixed top-3 right-3 z-50 w-[min(720px,calc(100vw-24px))]">
      <div className="rounded-xl border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--canvas)/0.96)] px-4 py-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between shadow-lg backdrop-blur">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[hsl(var(--warning))]">
            Frontend Debug
          </div>
          <p className="text-xs leading-5 text-[hsl(var(--body-strong))]">
            调试时可临时覆盖启动页，避免每次都被环境恢复和检测结果自动切走。
          </p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex flex-col gap-1 text-xs text-[hsl(var(--body-strong))] min-w-[180px]">
            启动页覆盖
            <Select value={mode} onChange={(event) => onModeChange(event.target.value as DebugBootstrapMode)}>
              <option value="auto">自动</option>
              <option value="installer">强制安装流</option>
              <option value="installed-home" disabled={!canForceInstalledHome}>
                强制已安装页{canForceInstalledHome ? '' : '（当前无安装记录）'}
              </option>
            </Select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-[hsl(var(--body-strong))] min-w-[180px]">
            安装流默认步骤
            <Select
              value={String(installerStep)}
              onChange={(event) => onInstallerStepChange(Number(event.target.value) as InstallerWizardStep)}
            >
              {stepOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <Button variant="secondary" onClick={() => {
            onModeChange('auto');
            onInstallerStepChange(0);
          }}>
            恢复自动
          </Button>
        </div>
      </div>
    </section>
  );
}
