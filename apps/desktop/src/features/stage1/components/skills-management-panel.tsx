import { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Switch } from '../../../components/ui/switch';
import { SpinnerIcon } from '../../../components/icons';
import { Search, RefreshCw, AlertCircle, Blocks, Tag } from 'lucide-react';
import type {
  ManagedSkillCatalog,
  OpenClawSkillTogglePayload,
  Stage1InstallResult
} from '../model/types';

type SkillsManagementPanelProps = {
  result: Stage1InstallResult;
  catalog: ManagedSkillCatalog | null;
  loading: boolean;
  toggleLoadingIds: string[];
  onReloadCatalog: (configPath: string) => Promise<ManagedSkillCatalog | null>;
  onSkillToggle: (input: OpenClawSkillTogglePayload) => Promise<unknown>;
};

function SkillCardSkeleton() {
  return (
    <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] p-4 flex flex-col gap-3 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-2 w-2/3">
          <div className="h-4 w-24 bg-[hsl(var(--surface-cream-strong))] rounded" />
          <div className="h-3 w-36 bg-[hsl(var(--surface-cream-strong))] rounded" />
        </div>
        <div className="h-5 w-9 bg-[hsl(var(--surface-cream-strong))] rounded-full" />
      </div>
      <div className="h-3.5 w-full bg-[hsl(var(--surface-cream-strong))] rounded mt-1" />
      <div className="h-3.5 w-5/6 bg-[hsl(var(--surface-cream-strong))] rounded" />
      <div className="flex gap-2 mt-2">
        <div className="h-4 w-12 bg-[hsl(var(--surface-cream-strong))] rounded" />
        <div className="h-4 w-16 bg-[hsl(var(--surface-cream-strong))] rounded" />
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
          <div className="grid grid-cols-1 gap-3 pr-1">
            <SkillCardSkeleton />
            <SkillCardSkeleton />
            <SkillCardSkeleton />
          </div>
        ) : filteredSkills.length ? (
          <ScrollArea className="h-full pr-2">
            <div className="grid grid-cols-1 gap-3 pb-4">
              {filteredSkills.map((skill) => {
                const busy = toggleLoadingIds.includes(skill.id);
                const unavailable = !skill.installed && !skill.sourceDir;

                return (
                  <div
                    key={skill.id}
                    className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] p-4 flex flex-col gap-2"
                  >
                    {/* Header info & Toggle switch */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[hsl(var(--ink))]">
                            {skill.title}
                          </span>
                          <code className="text-[10px] font-mono text-[hsl(var(--muted-soft))] bg-[hsl(var(--surface-soft))] px-1.5 py-0.2 rounded border border-[hsl(var(--hairline-soft))]">
                            v{skill.version}
                          </code>
                          {!skill.installed ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--warning))] font-medium">
                              未安装
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {busy ? (
                          <SpinnerIcon size={12} className="spinning text-[hsl(var(--primary))]" />
                        ) : null}
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

                    {/* Skill Description */}
                    <p className="text-xs leading-relaxed text-[hsl(var(--body))]">
                      {skill.description}
                    </p>

                    {/* Footer Info: Tags & Error banners */}
                    <div className="flex items-center justify-between gap-4 mt-0.5">
                      <div className="flex flex-wrap gap-1.5">
                        {skill.tags.length ? (
                          skill.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] text-[hsl(var(--muted-soft))] bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline-soft))] rounded px-1.5 py-0.2 flex items-center gap-1 font-medium"
                            >
                              <Tag size={9} className="opacity-70" />
                              {tag}
                            </span>
                          ))
                        ) : null}
                      </div>

                      {unavailable ? (
                        <span className="text-[9px] text-[hsl(var(--error))] flex items-center gap-1 font-medium">
                          <AlertCircle size={10} />
                          未安装且无本地源码
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="h-full min-h-64 flex flex-col items-center justify-center gap-3 text-center border border-dashed border-[hsl(var(--hairline-soft))] rounded-lg bg-[hsl(var(--surface-card))/0.1] p-6">
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--surface-soft))] flex items-center justify-center text-[hsl(var(--muted))]">
              <Blocks size={18} className="opacity-70" />
            </div>
            <div className="flex flex-col gap-1">
              <strong className="text-xs font-semibold text-[hsl(var(--ink))]">
                未找到匹配的 Skill
              </strong>
              <span className="text-[11px] text-[hsl(var(--muted))]">
                {searchQuery ? '尝试换个关键词搜索一下吧' : '当前内置 skill 清单为空'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
