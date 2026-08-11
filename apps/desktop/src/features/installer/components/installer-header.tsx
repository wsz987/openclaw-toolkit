import { BrandSpike } from './brand-spike';

type Props = {
  openclawVersion: string | null | undefined;
  nodeVersion: string | null | undefined;
  layout?: 'horizontal' | 'vertical';
};

export function InstallerHeader({ openclawVersion, nodeVersion, layout = 'horizontal' }: Props) {
  if (layout === 'vertical') {
    return (
      <header className="flex flex-col gap-6 select-none">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <BrandSpike size={14} className="text-[hsl(var(--ink))]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
              OpenClaw Toolkit · Stage 1
            </span>
          </div>
          <h1 className="font-serif text-2xl text-[hsl(var(--ink))] font-normal tracking-tight leading-tight">
            部署环境
          </h1>
        </div>

        {openclawVersion ? (
          <div className="flex flex-col gap-1 bg-[hsl(var(--surface-cream-strong))] border border-[hsl(var(--hairline))] rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="badge-coral bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">
                NEW
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted))] font-medium">
                解析目标版本
              </span>
            </div>
            <strong className="font-serif text-xl text-[hsl(var(--primary))] font-normal leading-none mt-1">
              v{openclawVersion}
            </strong>
            <span className="text-xs text-[hsl(var(--muted-soft))] font-medium mt-0.5">
              Node {nodeVersion || '待加载'}
            </span>
          </div>
        ) : null}
      </header>
    );
  }

  return (
    <header className="hero-panel flex justify-between items-center pb-6 border-b border-[hsl(var(--hairline))]">
      <div>
        <div className="eyebrow-container flex items-center gap-2 mb-1">
          <BrandSpike size={14} className="text-[hsl(var(--ink))]" />
          <span className="eyebrow text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
            OpenClaw Toolkit · Stage 1
          </span>
        </div>
        <h1 className="font-serif text-4xl text-[hsl(var(--ink))] font-normal tracking-tight leading-tight">
          部署环境
        </h1>
      </div>

      {openclawVersion ? (
        <div className="flex flex-col items-end gap-1">
          <span className="badge-coral bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">
            NEW
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted))] mt-1 font-medium">
            解析目标版本
          </span>
          <strong className="font-serif text-2xl text-[hsl(var(--primary))] font-normal leading-none mt-0.5">
            v{openclawVersion}
          </strong>
          <span className="text-xs text-[hsl(var(--muted-soft))] font-medium">
            Node {nodeVersion || '待加载'}
          </span>
        </div>
      ) : null}
    </header>
  );
}
