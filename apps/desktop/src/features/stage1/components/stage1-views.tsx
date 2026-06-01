import type { RefObject } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Progress } from '../../../components/ui/progress';
import { Select } from '../../../components/ui/select';
import { SecretField } from '../../../components/secret-field';
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  InfoIcon,
  PlayIcon,
  SettingsIcon,
  SpinnerIcon,
  XIcon
} from '../../../components/icons';
import { stage1Steps } from '../model/graph';
import type {
  InstallMode,
  Stage1Dashboard,
  Stage1DiagnosticsInfo,
  Stage1EnvironmentCheck,
  Stage1InstallLogTail,
  Stage1StepSnapshot,
  VersionCatalogOption,
  VersionCatalogResult
} from '../model/types';

type ChecksCardProps = {
  title: string;
  description: string;
  items: Stage1EnvironmentCheck[];
  ready: boolean;
};

function ChecksCard({ title, description, items, ready }: ChecksCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <span className={`text-sm font-semibold ${ready ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]'}`}>
          {items.filter((item) => item.state === 'ok').length}/{items.length} 项通过
        </span>
      </CardHeader>
      <CardContent className="check-list-container flex flex-col gap-3 pr-1">
        {items.map((item) => (
          <div
            className="check-card flex gap-3.5 p-4 rounded-lg bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))] transition-all duration-200 hover:border-[hsl(var(--muted-soft)/0.6)]"
            key={item.id}
            data-state={item.state}
          >
            <div
              className={`check-status-indicator w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                item.state === 'ok'
                  ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
                  : item.state === 'error'
                    ? 'bg-[hsl(var(--error)/0.15)] text-[hsl(var(--error))]'
                    : 'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]'
              }`}
            >
              {item.state === 'ok' ? (
                <CheckIcon size={12} />
              ) : item.state === 'error' ? (
                <XIcon size={12} />
              ) : (
                <AlertIcon size={12} />
              )}
            </div>
            <div className="check-content flex flex-col gap-0.5">
              <strong className="text-sm font-semibold text-[hsl(var(--body-strong))]">{item.label}</strong>
              <p className="text-xs text-[hsl(var(--muted))] break-all leading-normal">{item.detail}</p>
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <div className="flex items-center justify-center text-[hsl(var(--muted-soft))] text-xs py-8">
            等待环境初始化...
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type ErrorStateViewProps = {
  errorMessage: string;
  failedStepLabel: string;
  onBack: () => void;
};

export function ErrorStateView({ errorMessage, failedStepLabel, onBack }: ErrorStateViewProps) {
  return (
    <Card className="max-w-2xl mx-auto border-[hsl(var(--error)/0.3)] bg-[hsl(var(--canvas))] text-center py-10 px-6 flex flex-col items-center animate-fade-in shadow-lg">
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[hsl(var(--error)/0.1)] border border-[hsl(var(--error))] text-[hsl(var(--error))] mb-6">
        <XIcon size={34} />
      </div>
      <CardHeader className="p-0 mb-6">
        <CardTitle className="text-3xl text-[hsl(var(--ink))]">部署过程发生错误</CardTitle>
        <CardDescription className="text-sm text-[hsl(var(--body))] mt-2">
          核心引擎在执行 <strong className="text-[hsl(var(--error))]">[{failedStepLabel}]</strong> 步骤时中断退出，请查看控制台输出以定位问题。
        </CardDescription>
      </CardHeader>
      <CardContent className="w-full p-0 mb-8">
        <div className="w-full text-left bg-[hsl(var(--surface-dark))] border border-white/5 p-4 rounded-lg">
          <span className="block text-[10px] font-semibold text-[hsl(var(--error))] uppercase tracking-wider border-b border-white/5 pb-2 mb-2">
            ERROR CONSOLE LOG
          </span>
          <pre className="text-xs font-mono text-[hsl(var(--on-dark))] overflow-y-auto max-h-44 whitespace-pre-wrap break-all">
            {errorMessage}
          </pre>
        </div>
      </CardContent>
      <Button variant="default" onClick={onBack}>
        <ArrowLeftIcon size={14} className="mr-2" /> 返回修改配置
      </Button>
    </Card>
  );
}

type PrecheckStepViewProps = {
  baseDir: string;
  step1Checks: Stage1EnvironmentCheck[];
  step1Ready: boolean;
  dashboardLoading: boolean;
  onBaseDirChange: (value: string) => void;
  onPickDirectory: () => void;
  onNext: () => void;
};

export function PrecheckStepView({
  baseDir,
  step1Checks,
  step1Ready,
  dashboardLoading,
  onBaseDirChange,
  onPickDirectory,
  onNext
}: PrecheckStepViewProps) {
  return (
    <div className="split-layout grid grid-cols-1 lg:grid-cols-2 gap-6 precheck-mode animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle>步骤 1: 部署路径配置</CardTitle>
          <CardDescription>指定 OpenClaw 安装目录，安装资源将由程序自动定位</CardDescription>
        </CardHeader>
        <CardContent className="form-stack">
          <div className="form-group flex flex-col gap-2">
            <label className="flex justify-between text-xs font-semibold text-[hsl(var(--body-strong))]">
              <span>OpenClaw 安装目录</span>
              <span className="text-[10px] text-[hsl(var(--muted-soft))] font-normal">用于存放运行环境与配置文件</span>
            </label>
            <div className="directory-input-wrapper flex gap-2">
              <Input value={baseDir} onChange={(event) => onBaseDirChange(event.target.value)} placeholder="如 D:\OpenClaw" />
              <Button variant="secondary" onClick={onPickDirectory}>
                <FolderIcon size={13} className="mr-1.5" /> 选择
              </Button>
            </div>
          </div>

          <Button variant="default" className="mt-4 h-10 w-full" onClick={onNext} disabled={!step1Ready}>
            下一步：配置授权与提取模式 <ChevronRightIcon size={14} className="ml-1.5" />
          </Button>
          {dashboardLoading ? (
            <div className="text-[11px] text-[hsl(var(--muted-soft))] text-center mt-2">
              正在同步校验本地配置状态...
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ChecksCard
        title="项目就绪性检测"
        description="自动识别基础运行与目录结构"
        items={step1Checks}
        ready={step1Ready}
      />
    </div>
  );
}

type ConfigStepViewProps = {
  licenseKey: string;
  installMode: InstallMode;
  selectedVersion: string;
  versionCatalogLoading: boolean;
  versionCatalog: VersionCatalogResult | null;
  selectedVersionOption: VersionCatalogOption | null;
  systemOpenclaw: Stage1Dashboard['systemOpenclaw'];
  installActionLabel: string;
  confirmationTargetVersion: string;
  loading: boolean;
  canStartInstall: boolean;
  step2Checks: Stage1EnvironmentCheck[];
  onLicenseKeyChange: (value: string) => void;
  onInstallModeChange: (value: InstallMode) => void;
  onSelectedVersionChange: (value: string) => void;
  onBack: () => void;
  onInstall: () => void;
};

export function ConfigStepView({
  licenseKey,
  installMode,
  selectedVersion,
  versionCatalogLoading,
  versionCatalog,
  selectedVersionOption,
  systemOpenclaw,
  installActionLabel,
  confirmationTargetVersion,
  loading,
  canStartInstall,
  step2Checks,
  onLicenseKeyChange,
  onInstallModeChange,
  onSelectedVersionChange,
  onBack,
  onInstall
}: ConfigStepViewProps) {
  return (
    <div className="split-layout grid grid-cols-1 lg:grid-cols-2 gap-6 precheck-mode animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle>步骤 2: 授权激活与模式</CardTitle>
          <CardDescription>验证激活密钥，设定组件获取源与安装版本</CardDescription>
        </CardHeader>
        <CardContent className="form-stack">
          <SecretField
            label="离线激活授权密钥"
            value={licenseKey}
            onChange={onLicenseKeyChange}
            placeholder="输入激活许可证密钥"
          />

          <div className="form-group flex flex-col gap-2">
            <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">
              <span>使用源</span>
            </label>
            <Select value={installMode} onChange={(event) => onInstallModeChange(event.target.value as InstallMode)}>
              <option value="local">本地离线包</option>
              <option value="remote">远程包</option>
              <option value="npm">NPM 官方包分发</option>
            </Select>
          </div>

          <div className="form-group flex flex-col gap-2">
            <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">
              <span>版本列表</span>
            </label>
            <Select
              value={selectedVersion}
              onChange={(event) => onSelectedVersionChange(event.target.value)}
              disabled={versionCatalogLoading || !versionCatalog || versionCatalog.options.length === 0}
            >
              {!versionCatalog || versionCatalog.options.length === 0 ? (
                <option value={selectedVersion}>
                  {versionCatalogLoading ? '版本目录加载中...' : '暂无可选版本'}
                </option>
              ) : null}
              {versionCatalog?.options.map((option) => (
                <option key={option.value} value={option.value} disabled={!option.selectable}>
                  {option.label}
                  {option.selectable ? '' : ' · 当前不可安装'}
                </option>
              ))}
            </Select>
            <p className="text-[11px] leading-relaxed text-[hsl(var(--muted-soft))]">
              {versionCatalogLoading
                ? '正在按当前使用源加载版本目录...'
                : selectedVersionOption?.detail ?? versionCatalog?.message ?? '按当前使用源自动加载可用版本。'}
            </p>
            {versionCatalog?.latestVersion ? (
              <p className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
                `latest` 当前将解析为 `{versionCatalog.latestVersion}`。
              </p>
            ) : null}
          </div>

          {systemOpenclaw.detected ? (
            <div className="system-openclaw-banner">
              <div className="system-openclaw-banner__icon">
                <AlertIcon size={14} />
              </div>
              <div className="system-openclaw-banner__body">
                <strong>检测到系统 OpenClaw，需在部署前确认</strong>
                <p>
                  {systemOpenclaw.version
                    ? `本机版本 ${systemOpenclaw.version}，即将${installActionLabel}到 ${confirmationTargetVersion}。`
                    : `已检测到本机 OpenClaw，版本读取失败；即将按官方安装规范执行${installActionLabel}。`}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex gap-4 mt-2">
            <Button variant="secondary" className="flex-1" onClick={onBack}>
              <ArrowLeftIcon size={14} className="mr-1.5" /> 上一步
            </Button>
            <Button variant="default" className="flex-1" onClick={onInstall} disabled={loading || !canStartInstall}>
              {loading ? (
                <>
                  <SpinnerIcon size={14} className="spinning mr-2" />
                  部署中...
                </>
              ) : (
                <>
                  <PlayIcon size={12} className="mr-2" />
                  {systemOpenclaw.detected ? '确认后部署' : '开始部署安装'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ChecksCard
        title="授权与配置预检"
        description="校验激活包密钥及包源可用状态"
        items={step2Checks}
        ready={canStartInstall}
      />
    </div>
  );
}

type ProgressStageViewProps = {
  title: string;
  subtitle: string;
  statusMessage?: string | null;
  timelineDescription: string;
  progressValue: number;
  currentStepLabel: string;
  completedCount: number;
  timelineItems: Stage1StepSnapshot[];
  installLogTail: Stage1InstallLogTail | null;
  diagnosticsInfo: Stage1DiagnosticsInfo | null;
  timelineContainerRef: RefObject<HTMLDivElement | null>;
  animated?: boolean;
};

function TimelinePanel({
  timelineDescription,
  timelineItems,
  timelineContainerRef
}: Pick<ProgressStageViewProps, 'timelineDescription' | 'timelineItems' | 'timelineContainerRef'>) {
  return (
    <Card className="bg-[hsl(var(--surface-dark-soft))] border-white/5 p-8 flex flex-col h-full">
      <CardHeader className="p-0 mb-6">
        <CardTitle className="text-[hsl(var(--on-dark))] text-lg font-sans font-medium">流程微步骤流水</CardTitle>
        <CardDescription className="text-xs text-[hsl(var(--on-dark-soft))]">{timelineDescription}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="sub-steps-timeline" ref={timelineContainerRef}>
          {timelineItems.map((step) => {
            const isActive = step.state === 'current';
            const isDone = step.state === 'done';
            const isFailed = step.state === 'failed';

            return (
              <div
                key={step.id}
                className={`timeline-row transition-all duration-200 ${
                  isActive ? 'active' : isDone ? 'done' : isFailed ? 'failed' : ''
                }`}
              >
                <div className="timeline-icon-slot w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {isDone ? (
                    <CheckIcon size={14} className="text-[hsl(var(--success))]" />
                  ) : isFailed ? (
                    <XIcon size={14} className="text-[hsl(var(--error))]" />
                  ) : isActive ? (
                    <SpinnerIcon size={14} className="spinning text-[hsl(var(--primary))]" />
                  ) : (
                    <InfoIcon size={14} className="text-white/15" />
                  )}
                </div>
                <div className="timeline-text flex-1 flex flex-col gap-0.5">
                  <strong className="text-sm font-medium text-[hsl(var(--on-dark))]">{step.title}</strong>
                  <p className="text-[11px] text-[hsl(var(--on-dark-soft))]">{step.description}</p>
                </div>
                <div
                  className={`timeline-status-badge text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                    isDone
                      ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
                      : isActive
                        ? 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--on-dark))]'
                        : isFailed
                          ? 'bg-[hsl(var(--error)/0.15)] text-[hsl(var(--error))]'
                          : 'bg-white/5 text-[hsl(var(--on-dark-soft))]'
                  }`}
                >
                  {step.state === 'done' ? '已就绪' : step.state === 'current' ? '运行中' : step.state === 'failed' ? '受阻' : '等待中'}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function LogLine({ line }: { line: string }) {
  const lowered = line.toLowerCase();
  const tone = lowered.includes('error') || lowered.includes('failed')
    ? 'text-[hsl(var(--error))]'
    : lowered.includes('warn')
      ? 'text-[hsl(var(--warning))]'
      : lowered.includes('完成') || lowered.includes('success') || lowered.includes('added ')
        ? 'text-[hsl(var(--success))]'
        : 'text-[hsl(var(--on-dark-soft))]';

  return <div className={`font-mono text-[11px] leading-5 whitespace-pre-wrap break-all ${tone}`}>{line}</div>;
}

function InstallLogPanel({
  installLogTail,
  diagnosticsInfo
}: {
  installLogTail: Stage1InstallLogTail | null;
  diagnosticsInfo: Stage1DiagnosticsInfo | null;
}) {
  return (
    <Card className="bg-[hsl(var(--surface-dark-soft))] border-white/5 p-8 flex flex-col h-full">
      <CardHeader className="p-0 mb-6">
        <CardTitle className="text-[hsl(var(--on-dark))] text-lg font-sans font-medium">安装日志面板</CardTitle>
        <CardDescription className="text-xs text-[hsl(var(--on-dark-soft))]">
          最近 200 行安装日志，自动刷新并高亮错误/警告
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col gap-4 min-h-0">
        <div className="bg-[hsl(var(--surface-dark))] border border-white/5 rounded-lg px-4 py-3">
          <div className="text-[11px] text-[hsl(var(--on-dark-soft))] leading-relaxed">
            {installLogTail?.path ?? '日志文件尚未生成'}
          </div>
          {installLogTail?.truncated ? (
            <div className="mt-1 text-[10px] text-[hsl(var(--warning))]">已截取最近 200 行，较早日志已省略</div>
          ) : null}
        </div>

        <div className="bg-[hsl(var(--surface-dark))] border border-white/5 rounded-lg p-4 flex-1 min-h-[18rem] overflow-auto">
          {installLogTail?.lines.length ? (
            <div className="flex flex-col gap-1">
              {installLogTail.lines.map((line, index) => (
                <LogLine key={`${index}-${line.slice(0, 16)}`} line={line} />
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[hsl(var(--on-dark-soft))]">
              等待安装任务写入日志...
            </div>
          )}
        </div>

        {diagnosticsInfo ? (
          <div className="diagnostic-step-info bg-[hsl(var(--surface-dark))] border border-white/5 rounded-lg p-6 flex flex-col gap-4">
            <div className="diagnostic-title flex items-center gap-2.5 text-base font-semibold text-[hsl(var(--primary))] border-b border-white/5 pb-3">
              <SettingsIcon size={14} className="spinning text-[hsl(var(--primary))]" style={{ animationDuration: '12s' }} />
              {diagnosticsInfo.title}
            </div>
            <p className="diagnostic-desc text-xs text-[hsl(var(--on-dark-soft))] leading-relaxed">{diagnosticsInfo.description}</p>
            <div className="diagnostic-tasks-list flex flex-col gap-3.5 mt-2">
              {diagnosticsInfo.tasks.map((task, index) => (
                <div
                  key={`${task.key}-${index}`}
                  className={`diagnostic-task-item flex gap-3 text-sm items-start text-[hsl(var(--on-dark-soft))] ${
                    task.status === 'checked' ? 'text-[hsl(var(--on-dark))]' : ''
                  }`}
                >
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {task.status === 'checked' ? (
                      <CheckIcon size={12} className="text-[hsl(var(--success))]" />
                    ) : task.status === 'pending' ? (
                      <SpinnerIcon size={12} className="spinning text-[hsl(var(--primary))]" />
                    ) : (
                      <div className="w-3 h-3 rounded-full border border-white/20" />
                    )}
                  </div>
                  <span className="leading-tight">{task.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[hsl(var(--on-dark-soft))] text-sm">
            等待执行引擎激活...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProgressStageView({
  title,
  subtitle,
  statusMessage,
  timelineDescription,
  progressValue,
  currentStepLabel,
  completedCount,
  timelineItems,
  installLogTail,
  diagnosticsInfo,
  timelineContainerRef,
  animated = false
}: ProgressStageViewProps) {
  return (
    <div className={`product-mockup-card-dark view-container ${animated ? 'animate-fade-in' : ''}`.trim()}>
      <div className="panel-heading mb-4">
        <h2 className="text-[hsl(var(--on-dark))] text-2xl font-serif font-normal tracking-tight">{title}</h2>
        <span>{subtitle}</span>
      </div>

      <div className="progress-wrapper">
        <div className="progress-info flex flex-col min-w-[5rem]">
          <span className="text-[10px] text-[hsl(var(--on-dark-soft))] uppercase tracking-wide">整体进度</span>
          <strong className="font-serif text-3.5xl text-[hsl(var(--primary))] font-normal">{progressValue}%</strong>
        </div>
        <div className="progress-bar-container flex-1 flex flex-col gap-2">
          <div className="progress-bar-text flex justify-between text-xs font-medium text-[hsl(var(--on-dark))]">
            <span>{currentStepLabel}</span>
            <span className="text-[hsl(var(--on-dark-soft))]">
              {completedCount} / {stage1Steps.length} 步骤已完成
            </span>
          </div>
          <Progress value={progressValue} className="h-2.5" />
          {statusMessage ? (
            <div className="text-[11px] leading-relaxed text-[hsl(var(--on-dark-soft))] min-h-[1.25rem]">
              {statusMessage}
            </div>
          ) : null}
        </div>
      </div>

      <div className="split-layout grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TimelinePanel
          timelineDescription={timelineDescription}
          timelineItems={timelineItems}
          timelineContainerRef={timelineContainerRef}
        />
        <InstallLogPanel installLogTail={installLogTail} diagnosticsInfo={diagnosticsInfo} />
      </div>
    </div>
  );
}
