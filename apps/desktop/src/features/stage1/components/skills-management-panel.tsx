import { useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { CheckIcon, SpinnerIcon } from '../../../components/icons';
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

export function SkillsManagementPanel({
  result,
  catalog,
  loading,
  toggleLoadingIds,
  onReloadCatalog,
  onSkillToggle
}: SkillsManagementPanelProps) {
  const requestedConfigPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!catalog && !loading && requestedConfigPathRef.current !== result.configPath) {
      requestedConfigPathRef.current = result.configPath;
      void onReloadCatalog(result.configPath);
    }
  }, [catalog, loading, onReloadCatalog, result.configPath]);

  const enabledCount = catalog?.skills.filter((skill) => skill.enabled).length ?? 0;

  return (
    <div className="w-full h-full flex flex-col gap-5 animate-fade-in py-2">
      <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--hairline))] pb-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-2xl text-[hsl(var(--ink))] font-normal tracking-tight">Skill 管理</h2>
          <span className="text-xs text-[hsl(var(--muted))]">
            已启用 {enabledCount} / {catalog?.skills.length ?? 0}
          </span>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void onReloadCatalog(result.configPath)}
          className="h-9 px-3 text-xs rounded-lg border-[hsl(var(--hairline))]"
        >
          {loading ? <SpinnerIcon size={13} className="spinning mr-1" /> : null}
          刷新
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {loading && !catalog ? (
          <div className="h-full min-h-64 flex flex-col items-center justify-center gap-3 text-[hsl(var(--muted))]">
            <SpinnerIcon size={20} className="spinning" />
            <span className="text-xs">正在读取内置 skill 清单...</span>
          </div>
        ) : catalog?.skills.length ? (
          <div className="grid grid-cols-1 gap-3">
            {catalog.skills.map((skill) => {
              const busy = toggleLoadingIds.includes(skill.id);
              const unavailable = !skill.installed && !skill.sourceDir;

              return (
                <div
                  key={skill.id}
                  className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[hsl(var(--ink))]">{skill.title}</span>
                      <span className="text-[10px] font-mono text-[hsl(var(--muted-soft))]">
                        {skill.name}@{skill.version}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          skill.enabled
                            ? 'border-[hsl(var(--success)/0.26)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]'
                            : 'border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] text-[hsl(var(--muted))]'
                        }`}
                      >
                        {skill.enabled ? '已启用' : '已关闭'}
                      </span>
                      {!skill.installed ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--warning))]">
                          未安装
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs leading-relaxed text-[hsl(var(--body))]">{skill.description}</p>
                    {skill.tags.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {skill.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] text-[hsl(var(--muted-soft))] bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline-soft))] rounded px-1.5 py-0.5"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <Button
                    variant={skill.enabled ? 'secondary' : 'default'}
                    disabled={busy || unavailable}
                    onClick={() =>
                      void onSkillToggle({
                        configPath: result.configPath,
                        skillId: skill.id,
                        enabled: !skill.enabled
                      })
                    }
                    className="h-9 min-w-24 px-3 text-xs rounded-lg flex-shrink-0"
                  >
                    {busy ? (
                      <SpinnerIcon size={13} className="spinning mr-1" />
                    ) : skill.enabled ? (
                      <CheckIcon size={13} className="mr-1" />
                    ) : null}
                    {skill.enabled ? '关闭' : '启用'}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full min-h-64 flex items-center justify-center text-xs text-[hsl(var(--muted))]">
            未找到内置 skill 清单
          </div>
        )}
      </div>
    </div>
  );
}
