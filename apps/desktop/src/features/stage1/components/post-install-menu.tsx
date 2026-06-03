import { KeyIcon, MonitorIcon } from '../../../components/icons';

type PostInstallMenuProps = {
  activeTab: 'operations' | 'provider';
  onTabSelect: (tab: 'operations' | 'provider') => void;
  providerReady: boolean;
};

export function PostInstallMenu({ activeTab, onTabSelect, providerReady }: PostInstallMenuProps) {
  return (
    <div className="flex flex-col gap-4 w-full py-4 select-none">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))] mb-1 pl-1">
        管理与配置
      </div>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => onTabSelect('operations')}
          className={`w-full text-left px-4 py-3.5 rounded-lg flex items-center gap-3 transition-all duration-200 cursor-pointer border ${
            activeTab === 'operations'
              ? 'bg-[hsl(var(--canvas))] text-[hsl(var(--primary))] border-[hsl(var(--hairline))] shadow-[0_2px_6px_rgba(20,20,19,0.04)] ring-3 ring-[hsl(var(--primary)/0.12)] font-semibold'
              : 'bg-transparent hover:bg-[hsl(var(--surface-cream-strong))] text-[hsl(var(--muted))] border-transparent'
          }`}
        >
          <MonitorIcon
            size={14}
            className={activeTab === 'operations' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-soft))]'}
          />
          <div className="flex flex-col">
            <span
              className={`text-xs font-semibold leading-tight ${
                activeTab === 'operations' ? 'text-[hsl(var(--ink))]' : 'text-[hsl(var(--body-strong))]'
              }`}
            >
              运行控制中心
            </span>
            <span className="text-[9px] text-[hsl(var(--muted-soft))]">
              实例服务生命周期管理
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onTabSelect('provider')}
          className={`w-full text-left px-4 py-3.5 rounded-lg flex items-center gap-3 transition-all duration-200 cursor-pointer border ${
            activeTab === 'provider'
              ? 'bg-[hsl(var(--canvas))] text-[hsl(var(--primary))] border-[hsl(var(--hairline))] shadow-[0_2px_6px_rgba(20,20,19,0.04)] ring-3 ring-[hsl(var(--primary)/0.12)] font-semibold'
              : 'bg-transparent hover:bg-[hsl(var(--surface-cream-strong))] text-[hsl(var(--muted))] border-transparent'
          }`}
        >
          <div className="relative">
            <KeyIcon
              size={14}
              className={activeTab === 'provider' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-soft))]'}
            />
            {!providerReady && (
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse absolute -top-1 -right-1" />
            )}
          </div>
          <div className="flex flex-col">
            <span
              className={`text-xs font-semibold leading-tight ${
                activeTab === 'provider' ? 'text-[hsl(var(--ink))]' : 'text-[hsl(var(--body-strong))]'
              }`}
            >
              API 授权与接入
            </span>
            <span className="text-[9px] text-[hsl(var(--muted-soft))]">
              服务商与工具策略配置
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
