import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Activity, Terminal, Key, Radio, Component, Trash2 } from 'lucide-react';
import type { PostInstallTab } from '../model/types';

type MenuIconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;

type PostInstallMenuProps = {
  activeTab: PostInstallTab;
  onTabSelect: (tab: PostInstallTab) => void;
  providerReady: boolean;
  feishuEnabled: boolean;
};

type PostInstallMenuItem = {
  tab: PostInstallTab;
  title: string;
  description: string;
  icon: MenuIconComponent;
  className?: string;
  renderIndicator?: (state: Pick<PostInstallMenuProps, 'providerReady' | 'feishuEnabled'>) => ReactNode;
};

const menuButtonBaseClassName =
  'group w-full text-left px-4 py-3.5 rounded-lg flex items-center gap-3 transition-all duration-200 cursor-pointer border';

const menuButtonActiveClassName =
  'bg-[hsl(var(--canvas))] text-[hsl(var(--primary))] border-[hsl(var(--hairline))] shadow-[0_2px_6px_rgba(20,20,19,0.04)] ring-3 ring-[hsl(var(--primary)/0.12)] font-semibold';

const menuButtonIdleClassName =
  'bg-transparent hover:bg-[hsl(var(--surface-cream-strong))] text-[hsl(var(--muted))] border-transparent';

const postInstallMenuItems: PostInstallMenuItem[] = [
  {
    tab: 'controls',
    title: '网关服务',
    description: 'openclaw 控制面板',
    icon: Activity
  },
  {
    tab: 'advanced-console',
    title: '运行日志',
    description: '监控实时运行日志',
    icon: Terminal
  },
  {
    tab: 'provider',
    title: 'API 授权',
    description: '配置 AI 大模型服务商',
    icon: Key,
    renderIndicator: ({ providerReady }) =>
      providerReady ? null : (
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse absolute -top-1 -right-1" />
      )
  },
  {
    tab: 'channels',
    title: '聊天渠道',
    description: '接入聊天应用',
    icon: Radio,
    renderIndicator: ({ feishuEnabled }) =>
      feishuEnabled ? (
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] absolute -top-1 -right-1" />
      ) : null
  },
  {
    tab: 'skills',
    title: 'Skill 管理',
    description: '启用内置技能',
    icon: Component
  },
  {
    tab: 'uninstall',
    title: '卸载清理',
    description: '清理 openclaw 环境',
    icon: Trash2,
    className: 'mt-auto'
  }
];

export function PostInstallMenu({ activeTab, onTabSelect, providerReady, feishuEnabled }: PostInstallMenuProps) {
  return (
    <div className="flex flex-col gap-4 w-full py-4 select-none">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))] mb-1 pl-1">
        管理与配置
      </div>
      <div className="flex flex-col gap-2.5 flex-1">
        {postInstallMenuItems.map(({ tab, title, description, icon: Icon, renderIndicator, className }) => {
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabSelect(tab)}
              className={`${menuButtonBaseClassName} ${isActive ? menuButtonActiveClassName : menuButtonIdleClassName} ${className || ''}`}
            >
              <div className="relative">
                <Icon size={14} className={isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-soft))]'} />
                {renderIndicator?.({ providerReady, feishuEnabled })}
              </div>
              <div className="flex flex-col">
                <span className={`text-xs font-semibold leading-tight ${isActive ? 'text-[hsl(var(--ink))]' : 'text-[hsl(var(--body-strong))]'}`}>
                  {title}
                </span>
                <span className="text-[9px] text-[hsl(var(--muted-soft))]">
                  {description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
