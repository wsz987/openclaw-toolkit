import { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Switch } from '../../../components/ui/switch';
import { SpinnerIcon } from '../../../components/icons';
import { Search, RefreshCw, AlertCircle, Blocks, Tag } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type {
  ManagedSkillCatalog,
  OpenClawSkillTogglePayload,
  OpenClawInstallResult
} from '../../installer/model/types';

type SkillsManagementPanelProps = {
  result: OpenClawInstallResult;
  catalog: ManagedSkillCatalog | null;
  loading: boolean;
  toggleLoadingIds: string[];
  onReloadCatalog: (configPath: string) => Promise<ManagedSkillCatalog | null>;
  onSkillToggle: (input: OpenClawSkillTogglePayload) => Promise<unknown>;
};

function SkillCardSkeleton() {
  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-2 w-2/3">
          <div className="flex gap-2 items-center">
            <div className="h-4 w-24 bg-[hsl(var(--surface-cream-strong))] rounded" />
            <div className="h-3 w-10 bg-[hsl(var(--surface-cream-strong))] rounded" />
          </div>
          <div className="h-3.5 w-36 bg-[hsl(var(--surface-cream-strong))] rounded" />
        </div>
        <div className="h-5 w-9 bg-[hsl(var(--surface-cream-strong))] rounded-full" />
      </div>
      <div className="h-3 w-full bg-[hsl(var(--surface-cream-strong))] rounded mt-1" />
      <div className="h-3 w-5/6 bg-[hsl(var(--surface-cream-strong))] rounded" />
      <div className="flex justify-between items-center mt-auto pt-2 border-t border-[hsl(var(--hairline-soft))]/50">
        <div className="flex gap-2">
          <div className="h-4 w-12 bg-[hsl(var(--surface-cream-strong))] rounded" />
          <div className="h-4 w-16 bg-[hsl(var(--surface-cream-strong))] rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkillsManagementPanel({
  result,
  catalog,
  loading,
  toggleLoadingIds,
  onReloadCatalog,
  onSkillToggle
}: SkillsManagementPanelProps) {
  const requestedConfigPathRef = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'enabled' | 'disabled' | 'uninstalled'>('all');

  useEffect(() => {
    if (!catalog && !loading && requestedConfigPathRef.current !== result.configPath) {
      requestedConfigPathRef.current = result.configPath;
      void onReloadCatalog(result.configPath);
    }
  }, [catalog, loading, onReloadCatalog, result.configPath]);

  const enabledCount = catalog?.skills.filter((skill) => skill.enabled).length ?? 0;
  const totalCount = catalog?.skills.length ?? 0;

  const counts = useMemo(() => {
    if (!catalog) return { all: 0, enabled: 0, disabled: 0, uninstalled: 0 };
    return {
      all: catalog.skills.length,
      enabled: catalog.skills.filter((s) => s.enabled).length,
      disabled: catalog.skills.filter((s) => !s.enabled).length,
      uninstalled: catalog.skills.filter((s) => !s.installed).length
    };
  }, [catalog]);

  const filteredSkills = useMemo(() => {
    if (!catalog) return [];
    return catalog.skills.filter((skill) => {
      // 1. Search Query filter
      const matchesSearch =
        skill.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // 2. Tab Filter
      if (activeTab === 'enabled') return skill.enabled;
      if (activeTab === 'disabled') return !skill.enabled;
      if (activeTab === 'uninstalled') return !skill.installed;

      return true;
    });
  }, [catalog, searchQuery, activeTab]);

  const filterTabs = [
    { id: 'all', label: '全部' },
    { id: 'enabled', label: '已启用' },
    { id: 'disabled', label: '已关闭' },
    { id: 'uninstalled', label: '未安装' }
  ] as const;

  return (
    <div className="w-full h-full flex flex-col gap-4 animate-fade-in py-2">
      {/* Header section */}
      <div className="flex items-center justify-between gap-4 border-b border-[hsl(var(--hairline-soft))] pb-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-serif text-2xl text-[hsl(var(--ink))] font-normal tracking-tight flex items-center gap-2">
            <Blocks size={20} className="text-[hsl(var(--primary))]" />
            Skill 管理
          </h2>
          <span className="text-xs text-[hsl(var(--muted))]">
            已启用 {enabledCount} / {totalCount} 个内置技能
          </span>
        </div>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => void onReloadCatalog(result.configPath)}
          className="h-8 px-3 text-xs rounded-lg flex items-center gap-1.5 border-[hsl(var(--hairline-soft))]"
        >
          {loading ? (
            <SpinnerIcon size={12} className="spinning" />
          ) : (
            <RefreshCw size={12} />
          )}
          刷新
        </Button>
      </div>

      {/* Search & Filter controls */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-soft))] w-3.5 h-3.5" />
          <Input
            placeholder="搜索 Skill 标题、名称或描述..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs rounded-lg placeholder:text-xs"
          />
        </div>
        <div className="flex items-center gap-1 bg-[hsl(var(--surface-soft))/0.6] p-0.5 rounded-lg border border-[hsl(var(--hairline-soft))] overflow-x-auto max-w-full">
          {filterTabs.map((tab) => {
            const active = activeTab === tab.id;
            const count = counts[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 text-[11px] rounded-md font-medium transition-all duration-200 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${active
                  ? 'bg-[hsl(var(--primary))] text-white shadow-xs'
                  : 'text-[hsl(var(--muted))] hover:text-[hsl(var(--ink))] hover:bg-[hsl(var(--surface-cream-strong))/0.4]'
                  }`}
              >
                {tab.label}
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full ${active
                    ? 'bg-white/20 text-white'
                    : 'bg-[hsl(var(--surface-cream-strong))] text-[hsl(var(--muted))]'
                    }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main List content */}
      <div className="flex-1 min-h-0">
        {loading && !catalog ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-1 pb-4">
            <SkillCardSkeleton />
            <SkillCardSkeleton />
            <SkillCardSkeleton />
            <SkillCardSkeleton />
          </div>
        ) : filteredSkills.length ? (
          <ScrollArea className="h-full pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
              {filteredSkills.map((skill) => {
                const busy = toggleLoadingIds.includes(skill.id);
                const unavailable = !skill.installed && !skill.sourceDir;

                return (
                  <div
                    key={skill.id}
                    className={cn(
                      "group rounded-xl border p-5 flex flex-col justify-between gap-4 transition-all duration-300 relative overflow-hidden",
                      skill.enabled
                        ? "bg-gradient-to-br from-[hsl(var(--surface-card))] to-[hsl(var(--primary)/0.02)] border-[hsl(var(--primary)/0.2)] shadow-2xs hover:border-[hsl(var(--primary)/0.35)] hover:shadow-md"
                        : "bg-gradient-to-br from-[hsl(var(--surface-card))] to-[hsl(var(--surface-soft))/0.3] border-[hsl(var(--hairline))] hover:border-[hsl(var(--primary)/0.2)] hover:shadow-sm"
                    )}
                  >
                    {/* Top Section: Title & Toggle */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-sm text-[hsl(var(--ink))] group-hover:text-[hsl(var(--primary))] transition-colors duration-200 truncate">
                            {skill.title}
                          </span>
                          <code className="text-[9px] font-mono text-[hsl(var(--muted-soft))] bg-[hsl(var(--surface-soft))] px-1.5 py-0.2 rounded border border-[hsl(var(--hairline-soft))]">
                            v{skill.version}
                          </code>
                          {!skill.installed && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--warning))] font-medium whitespace-nowrap">
                              未安装
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[hsl(var(--muted-soft))] tracking-tight select-all">
                          {skill.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {busy && (
                          <SpinnerIcon size={12} className="spinning text-[hsl(var(--primary))]" />
                        )}
                        <Switch
                          checked={skill.enabled}
                          disabled={busy || unavailable}
                          onCheckedChange={(checked) =>
                            void onSkillToggle({
                              configPath: result.configPath,
                              skillId: skill.id,
                              enabled: checked
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Middle Section: Description */}
                    <p className="text-xs leading-relaxed text-[hsl(var(--body))] flex-1 min-h-[36px] line-clamp-3 hover:line-clamp-none transition-all duration-200">
                      {skill.description}
                    </p>

                    {/* Bottom Section: Tags & Errors */}
                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-[hsl(var(--hairline-soft))]/50 mt-auto">
                      <div className="flex flex-wrap gap-1">
                        {skill.tags.length > 0 ? (
                          skill.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] text-[hsl(var(--muted))] bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline-soft))] rounded px-1.5 py-0.2 flex items-center gap-1 font-medium transition-colors hover:bg-[hsl(var(--surface-cream-strong))/0.6]"
                            >
                              <Tag size={9} className="opacity-70 text-[hsl(var(--muted-soft))]" />
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-[9px] text-[hsl(var(--muted-soft))] italic">
                            无标签
                          </span>
                        )}
                      </div>

                      {unavailable && (
                        <span className="text-[9px] text-[hsl(var(--error))] flex items-center gap-1 font-medium whitespace-nowrap bg-[hsl(var(--error)/0.05)] border border-[hsl(var(--error)/0.15)] px-1.5 py-0.5 rounded">
                          <AlertCircle size={10} />
                          缺本地源码
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-4 text-center border border-dashed border-[hsl(var(--hairline-soft))] rounded-2xl bg-[hsl(var(--surface-card))/0.02] p-8">
            <div className="w-12 h-12 rounded-full bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline-soft))] flex items-center justify-center text-[hsl(var(--muted))] shadow-2xs">
              <Blocks size={20} className="opacity-70 text-[hsl(var(--primary))]" />
            </div>
            <div className="flex flex-col gap-1.5 max-w-sm">
              <strong className="text-sm font-semibold text-[hsl(var(--ink))]">
                未找到匹配的 Skill
              </strong>
              <span className="text-xs text-[hsl(var(--muted))] leading-relaxed">
                {searchQuery ? '尝试换个关键词搜索一下吧，或者切换到其他状态分类' : '当前内置 skill 清单为空'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
