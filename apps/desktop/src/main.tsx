import { useEffect, useMemo, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card';
import { Progress } from './components/ui/progress';
import { Input } from './components/ui/input';
import { Select } from './components/ui/select';
import {
  CheckIcon,
  AlertIcon,
  XIcon,
  KeyIcon,
  FolderIcon,
  ArrowLeftIcon,
  PlayIcon,
  SpinnerIcon,
  SettingsIcon,
  InfoIcon,
  ChevronRightIcon
} from './components/icons';
import './styles.css';

type InstallMode = 'local' | 'remote' | 'npm';
type Stage1Phase = 'precheck' | 'running' | 'succeeded' | 'failed';
type Stage1StepState = 'done' | 'current' | 'pending' | 'failed';
type Stage1CheckState = 'ok' | 'warn' | 'error';

type InstallStep =
  | 'loadManifest'
  | 'validateLicense'
  | 'checkEnvironment'
  | 'selectInstallMode'
  | 'resolveOpenClawVersion'
  | 'resolveNodeRuntime'
  | 'installNodeRuntime'
  | 'resolveOpenClawArtifact'
  | 'installOpenClaw'
  | 'writeInstalledManifest'
  | 'generateOpenClawConfig'
  | 'installSkills'
  | 'configurePermissions'
  | 'configureBrowser'
  | 'verifyRuntime';

type Stage1EnvironmentCheck = {
  id: string;
  label: string;
  state: Stage1CheckState;
  detail: string;
};

type Stage1StepSnapshot = {
  id: InstallStep;
  title: string;
  description: string;
  state: Stage1StepState;
};

type Stage1Dashboard = {
  workflowId: string | null;
  phase: Stage1Phase;
  currentStep: InstallStep | null;
  currentStepLabel: string;
  progress: number;
  completedSteps: InstallStep[];
  failedStep: InstallStep | null;
  message: string | null;
  steps: Stage1StepSnapshot[];
  environment: Stage1EnvironmentCheck[];
  installMode: InstallMode;
  selectedVersion: string;
  openclawVersion: string | null;
  nodeVersion: string | null;
  baseDir: string;
};

type Stage1InstallResult = {
  workflowId: string;
  status: string;
  openclawVersion: string;
  nodeVersion: string;
  openclawDir: string;
  nodeDir: string;
  configPath: string;
};

type DirectoryPickerResponse = string | null;

const stage1Steps: Array<{ id: InstallStep; title: string; description: string }> = [
  { id: 'loadManifest', title: '加载 Manifest', description: '读取工具包和制品清单' },
  { id: 'validateLicense', title: '验证授权', description: '校验离线激活密钥和功能范围' },
  { id: 'checkEnvironment', title: '检查环境', description: '确认当前系统满足安装前提' },
  { id: 'selectInstallMode', title: '选择安装模式', description: '确认本地、远程或 npm 安装模式' },
  { id: 'resolveOpenClawVersion', title: '解析 OpenClaw 版本', description: '选出当前要安装的 OpenClaw 版本' },
  { id: 'resolveNodeRuntime', title: '解析 Node Runtime', description: '计算受管 Node Runtime 目标目录' },
  { id: 'installNodeRuntime', title: '安装 Node Runtime', description: '下载或解压 Node Runtime' },
  { id: 'resolveOpenClawArtifact', title: '解析 OpenClaw 制品', description: '确定 OpenClaw 制品来源' },
  { id: 'installOpenClaw', title: '安装 OpenClaw', description: '下载安装到目标目录' },
  { id: 'writeInstalledManifest', title: '写入安装记录', description: '记录本机安装结果' },
  { id: 'generateOpenClawConfig', title: '生成 OpenClaw 配置', description: '生成 openclaw.json 配置文件' },
  { id: 'installSkills', title: '安装 Skills', description: '写入并同步技能资源' },
  { id: 'configurePermissions', title: '配置权限', description: '应用文件与命令白名单' },
  { id: 'configureBrowser', title: '配置浏览器环境', description: '确认浏览器运行环境可用' },
  { id: 'verifyRuntime', title: '验证运行环境', description: '执行最终运行校验' }
];

const stage1StepSet = new Set(stage1Steps.map((step) => step.id));

function isInstallStep(value: string): value is InstallStep {
  return stage1StepSet.has(value as InstallStep);
}

// 4-stage Master Stepper configuration
type MasterPhaseId = 'verify-pre' | 'dependencies' | 'config-write' | 'final-check';

interface MasterPhase {
  id: MasterPhaseId;
  label: string;
  steps: InstallStep[];
}

const masterPhases: MasterPhase[] = [
  {
    id: 'verify-pre',
    label: '基础初始化',
    steps: ['loadManifest', 'validateLicense', 'checkEnvironment', 'selectInstallMode', 'resolveOpenClawVersion']
  },
  {
    id: 'dependencies',
    label: '激活与配置',
    steps: ['resolveNodeRuntime', 'installNodeRuntime', 'resolveOpenClawArtifact', 'installOpenClaw']
  },
  {
    id: 'config-write',
    label: '核心包部署',
    steps: ['writeInstalledManifest', 'generateOpenClawConfig', 'installSkills', 'configurePermissions']
  },
  {
    id: 'final-check',
    label: '配置与运行验证',
    steps: ['configureBrowser', 'verifyRuntime']
  }
];

// Step diagnostics checklist items mapping
interface StepDiagnostic {
  title: string;
  description: string;
  tasks: { label: string; key: string }[];
}

const stepDiagnosticsMap: Record<InstallStep, StepDiagnostic> = {
  loadManifest: {
    title: '加载 Manifest 资源清单',
    description: '正在读取安装包及包含的工具链元数据配置...',
    tasks: [
      { label: '读取 toolkit-manifest.json 配置文件', key: 'project-root' },
      { label: '解析版本定义和资源分发配额', key: 'project-root' }
    ]
  },
  validateLicense: {
    title: '校验离线授权密钥',
    description: '通过安全签名校验，核对当前使用的产品密钥效期与核心能力范围...',
    tasks: [
      { label: '验证激活密钥签名合法性', key: 'license' },
      { label: '核查是否支持受管 Node Runtime 能力', key: 'license' }
    ]
  },
  checkEnvironment: {
    title: '系统运行环境检测',
    description: '进行基础环境与架构兼容性检验，确保工具可在当前系统正常运作...',
    tasks: [
      { label: '校验操作系统类型 (当前要求 Windows 架构)', key: 'windows' },
      { label: '测试项目目标路径与访问权限', key: 'project-root' }
    ]
  },
  selectInstallMode: {
    title: '安装模式与分发源分析',
    description: '识别当前的部署来源 and 网络策略，匹配最优核心包提取逻辑...',
    tasks: [
      { label: '比对安装模式 (本地离线 / 远程下载 / npm 抓取)', key: 'install-mode' },
      { label: '校验安装模式所对应的参数就绪状态', key: 'release-manifest' }
    ]
  },
  resolveOpenClawVersion: {
    title: '解析目标 OpenClaw 版本',
    description: '匹配目标版本或最新推荐标签，校验版本兼容性规则...',
    tasks: [
      { label: '下载/解析制品清单 manifest.json', key: 'release-manifest' },
      { label: '确定部署的目标版本号', key: 'selected-version' }
    ]
  },
  resolveNodeRuntime: {
    title: '计算受管 Node.js 运行时路径',
    description: '匹配系统兼容的受管 Node.js 核心版本，并解析本地目录结构...',
    tasks: [
      { label: '获取此 OpenClaw 版本兼容的 Node.js 版本要求', key: 'node-runtime' },
      { label: '计算受管运行时隔离安装路径', key: 'node-runtime' }
    ]
  },
  installNodeRuntime: {
    title: '部署 Node.js 运行时环境',
    description: '安装并同步所需的沙箱内嵌 Node 运行时，不修改系统全局变量...',
    tasks: [
      { label: '定位离线 Node.js 压缩包或下载远程源制品', key: 'node-runtime' },
      { label: '解压运行时程序，校验核心 Node 二进制执行文件', key: 'node-runtime' }
    ]
  },
  resolveOpenClawArtifact: {
    title: '解析 OpenClaw 主程序制品',
    description: '定位待部署的安装包源路径，校验校验和与完整性...',
    tasks: [
      { label: '寻找匹配版本号的 OpenClaw 安装介质', key: 'release-manifest' },
      { label: '确认制品包分发来源已确定', key: 'release-manifest' }
    ]
  },
  installOpenClaw: {
    title: '安装部署 OpenClaw 核心程序',
    description: '备份已有旧版本文件，解压最新核心程序资源并写入隔离执行环境...',
    tasks: [
      { label: '备份并隔离冲突的旧版本文件夹', key: 'openclaw-install' },
      { label: '写入核心程序文件及依赖模块到 openclaw 目录', key: 'openclaw-install' }
    ]
  },
  writeInstalledManifest: {
    title: '生成并写入安装元数据记录',
    description: '登记本次成功写入本机的组件清单及版本信息，供日后升级校验...',
    tasks: [
      { label: '生成本地安装清单数据 installed-manifest.json', key: 'openclaw-install' },
      { label: '写入信息至 OpenClaw 安装根目录', key: 'openclaw-install' }
    ]
  },
  generateOpenClawConfig: {
    title: '配置系统运行参数 openclaw.json',
    description: '解析配置输入并保存为主程序的配置文件，包括端口、进程守护及授权级别...',
    tasks: [
      { label: '计算端口占用和本地 Node 环境变量映射关系', key: 'config' },
      { label: '生成并持久化 openclaw.json 文件', key: 'config' }
    ]
  },
  installSkills: {
    title: '拷贝并装载技能库资源 (Skills)',
    description: '同步预置技能模块，支持离线或远程扩展的微应用技能加载...',
    tasks: [
      { label: '读取并解析打包带有的技能清单 (Skills)', key: 'openclaw-install' },
      { label: '拷贝并部署技能脚本文件到指定 skills 目录下', key: 'openclaw-install' }
    ]
  },
  configurePermissions: {
    title: '应用命令与路径安全访问限制',
    description: '根据授权等级激活安全策略限制，限定读写和调用底层工具权限...',
    tasks: [
      { label: '配置命令执行和文件读写白名单', key: 'config' },
      { label: '设置沙箱安全隔离过滤规则', key: 'config' }
    ]
  },
  configureBrowser: {
    title: '配置无头浏览器驱动与运行沙箱',
    description: '扫描系统内置 Chrome/Edge 路径，适配运行时所需的浏览器调用环境...',
    tasks: [
      { label: '寻检系统中符合版本要求的浏览器及驱动位置', key: 'windows' },
      { label: '构建浏览器驱动桥接通道及参数配置', key: 'windows' }
    ]
  },
  verifyRuntime: {
    title: '运行环境就绪性联调验证',
    description: '进行首次冷启动测试，抓取心跳包验证最终运行时生命周期是否正常...',
    tasks: [
      { label: '拉起隔离 Node 服务，加载 OpenClaw 主控制进程', key: 'openclaw-install' },
      { label: '发送健康度检测并接收心跳确认，确认配置就绪', key: 'config' }
    ]
  }
};

const BrandSpike = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', transform: 'rotate(15deg)' }}
  >
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 2c-.4 0-.7.3-.7.7v5c0 .4.3.7.7.7s.7-.3.7-.7V2.7c0-.4-.3-.7-.7-.7zM12 15.6c-.4 0-.7.3-.7.7v5c0 .4.3.7.7.7s.7-.3.7-.7v-5c0-.4-.3-.7-.7-.7zM2 12c0-.4.3-.7.7-.7h5c.4 0 .7.3.7.7s-.3.7-.7.7H2.7c-.4 0-.7-.3-.7-.7zM15.6 12c0-.4.3-.7.7-.7h5c.4 0 .7.3.7.7s-.3.7-.7.7h-5c-.4 0-.7-.3-.7-.7zM4.9 4.9c-.3-.3-.7-.3-1 0s-.3.7 0 1l3.5 3.5c.3.3.7.3 1 0s.3-.7 0-1L4.9 4.9zm10.6 10.6c-.3-.3-.7-.3-1 0s-.3.7 0 1l3.5 3.5c.3.3.7.3 1 0s.3-.7 0-1l-3.5-3.5zM19.1 4.9c.3-.3.3-.7 0-1s-.7-.3-1 0l-3.5 3.5c-.3.3-.3.7 0 1s.7.3 1 0l3.5-3.5zM8.5 15.5c.3-.3.3-.7 0-1s-.7-.3-1 0l-3.5 3.5c-.3.3-.3.7 0 1s.7.3 1 0l3.5-3.5z" />
  </svg>
);

function App() {
  const [projectRoot, setProjectRoot] = useState('D:\\coding\\auto-intsall-openclaw');
  const [baseDir, setBaseDir] = useState('D:\\OpenClaw');
  const [licenseKey, setLicenseKey] = useState('stage1-dev');
  const [installMode, setInstallMode] = useState<InstallMode>('local');
  const [selectedVersion, setSelectedVersion] = useState('latest');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<Stage1Dashboard | null>(null);
  const [result, setResult] = useState<Stage1InstallResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // wizardStep manages which wizard panel is active (0: Init/Paths, 1: License/Config, 2: Deploy dependencies, 3: Verify)
  const [wizardStep, setWizardStep] = useState(0);

  const timelineContainerRef = useRef<HTMLDivElement>(null);

  const payload = useMemo(
    () => ({
      projectRoot,
      baseDir,
      licenseKey,
      installMode,
      selectedVersion
    }),
    [projectRoot, baseDir, licenseKey, installMode, selectedVersion]
  );

  async function loadDashboard() {
    setError(null);
    setDashboardLoading(true);
    try {
      const response = await invoke<Stage1Dashboard>('inspect_stage1_dashboard_command', { input: payload });
      setDashboard({
        ...response,
        currentStep: response.currentStep && isInstallStep(response.currentStep) ? response.currentStep : null,
        failedStep: response.failedStep && isInstallStep(response.failedStep) ? response.failedStep : null,
        completedSteps: response.completedSteps.filter(isInstallStep),
        steps: response.steps.map((step) => ({
          ...step,
          id: isInstallStep(step.id) ? step.id : 'loadManifest',
          state: step.state as Stage1StepState
        })),
        environment: response.environment.map((check) => ({
          ...check,
          state: check.state as Stage1CheckState
        })),
        installMode: response.installMode as InstallMode
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDashboardLoading(false);
    }
  }

  async function pickDirectory(field: 'projectRoot' | 'baseDir') {
    const picked = await invoke<DirectoryPickerResponse>('pick_directory_dialog', {
      request: {
        title: field === 'projectRoot' ? '选择项目根目录' : '选择 OpenClaw 基础目录',
        defaultPath: field === 'projectRoot' ? projectRoot : baseDir
      }
    });

    if (!picked) {
      return;
    }

    if (field === 'projectRoot') {
      setProjectRoot(picked);
    } else {
      setBaseDir(picked);
    }
  }

  async function startInstall() {
    setLoading(true);
    setError(null);
    setResult(null);
    setWizardStep(2);

    try {
      const response = await invoke<Stage1InstallResult>('start_stage1_install', { input: payload });
      setResult(response);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Auto scroll timeline container to keep current step centered
  useEffect(() => {
    if (timelineContainerRef.current) {
      const activeEl = timelineContainerRef.current.querySelector('.timeline-row.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [dashboard?.currentStep]);

  useEffect(() => {
    void loadDashboard();
  }, [payload]);

  // Sync dashboard phase back to wizard steps
  useEffect(() => {
    if (!dashboard) return;

    if (dashboard.phase === 'running') {
      const current = dashboard.currentStep;
      if (current) {
        const stepIndex = stage1Steps.findIndex((s) => s.id === current);
        if (stepIndex >= 9) {
          setWizardStep(3);
        } else {
          setWizardStep(2);
        }
      }
    } else if (dashboard.phase === 'succeeded') {
      setWizardStep(3);
    } else if (dashboard.phase === 'failed') {
      const failed = dashboard.failedStep;
      if (failed) {
        const stepIndex = stage1Steps.findIndex((s) => s.id === failed);
        if (stepIndex >= 9) {
          setWizardStep(3);
        } else {
          setWizardStep(2);
        }
      }
    }
  }, [dashboard?.phase, dashboard?.currentStep, dashboard?.failedStep]);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 800);

    return () => window.clearInterval(timer);
  }, [loading, payload]);

  const stepProgress: Stage1StepSnapshot[] = dashboard?.steps ?? stage1Steps.map((step) => ({
    ...step,
    state: 'pending'
  }));

  const completedCount = stepProgress.filter((step) => step.state === 'done').length;
  const activeStep = stepProgress.find((step) => step.state === 'current');
  const progressValue = dashboard?.progress ?? 0;
  const environmentItems = dashboard?.environment ?? [];
  
  // Extract specific checks for Step 1
  const step1CheckIds = ['windows', 'project-root', 'toolkit-manifest'];
  const step1Checks = environmentItems.filter((check) => step1CheckIds.includes(check.id));
  const step1Ready = step1Checks.length > 0 && step1Checks.every((c) => c.state === 'ok');

  // Extract specific checks for Step 2
  const step2CheckIds = ['license', 'install-mode', 'release-manifest', 'selected-version'];
  const step2Checks = environmentItems.filter((check) => step2CheckIds.includes(check.id));
  const step2Ready = step2Checks.length > 0 && step2Checks.every((c) => c.state === 'ok');

  const readyChecks = environmentItems.filter((item) => item.state === 'ok').length;
  const phase = dashboard?.phase ?? 'precheck';

  // Build diagnostics states lookup from environment checks
  const envCheckStates = useMemo(() => {
    const map = new Map<string, Stage1CheckState>();
    environmentItems.forEach((item) => {
      map.set(item.id, item.state);
    });
    return map;
  }, [environmentItems]);

  // Handle active diagnostics info
  const diagnosticsInfo = useMemo(() => {
    const stepId = activeStep?.id || dashboard?.currentStep || dashboard?.failedStep || 'loadManifest';
    const diag = stepDiagnosticsMap[stepId];
    if (!diag) return null;

    return {
      ...diag,
      tasks: diag.tasks.map((task) => {
        let status: 'checked' | 'pending' | 'waiting' = 'waiting';
        
        const isStepDone = dashboard?.completedSteps.includes(stepId);
        const isStepCurrent = dashboard?.currentStep === stepId;

        if (isStepDone || phase === 'succeeded') {
          status = 'checked';
        } else if (isStepCurrent) {
          const checkState = envCheckStates.get(task.key);
          if (checkState === 'ok') {
            status = 'checked';
          } else {
            status = 'pending';
          }
        }
        return { ...task, status };
      })
    };
  }, [activeStep, dashboard?.currentStep, dashboard?.completedSteps, envCheckStates, phase, dashboard?.failedStep]);

  const handleBackToConfig = () => {
    setError(null);
    setResult(null);
    setLoading(false);
    setWizardStep(0);
    if (dashboard) {
      setDashboard({
        ...dashboard,
        phase: 'precheck',
        currentStep: 'loadManifest'
      });
    }
  };

  const step3TimelineItems = stepProgress.slice(0, 9);
  const step4TimelineItems = stepProgress.slice(9);

  const renderContent = () => {
    const isFailedState = phase === 'failed' || error;
    if (isFailedState) {
      const displayErrorMessage = error || dashboard?.message || '安装过程中发生未预期的异常错误。';
      const failedStepLabel = dashboard?.failedStep
        ? stage1Steps.find((s) => s.id === dashboard.failedStep)?.title
        : '执行单元';

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
              <pre className="text-xs font-mono text-[hsl(var(--on-dark))] overflow-y-auto max-h-44 white-space-pre-wrap break-all">
                {displayErrorMessage}
              </pre>
            </div>
          </CardContent>
          <Button variant="default" onClick={handleBackToConfig}>
            <ArrowLeftIcon size={14} className="mr-2" /> 返回修改配置
          </Button>
        </Card>
      );
    }

    if (phase === 'succeeded' && result) {
      return (
        <Card className="max-w-3xl mx-auto border-[hsl(var(--success)/0.3)] bg-[hsl(var(--canvas))] text-center py-12 px-8 flex flex-col items-center animate-fade-in shadow-lg">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[hsl(var(--success)/0.1)] border border-[hsl(var(--success))] text-[hsl(var(--success))] mb-6">
            <CheckIcon size={34} />
          </div>
          <CardHeader className="p-0 mb-6">
            <CardTitle className="text-3xl text-[hsl(var(--ink))]">运行环境部署成功</CardTitle>
            <CardDescription className="text-sm text-[hsl(var(--body))] mt-2 max-w-lg mx-auto">
              OpenClaw 核心程序及依赖资源已成功安装就绪，并通过系统环境最终冷启动验证。
            </CardDescription>
          </CardHeader>
          <CardContent className="w-full p-0 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">工作流 Workflow ID</span>
                <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">{result.workflowId}</code>
              </div>
              <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">OpenClaw 版本</span>
                <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">v{result.openclawVersion}</code>
              </div>
              <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">Node.js 版本</span>
                <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">Node {result.nodeVersion}</code>
              </div>
              <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">配置文件路径</span>
                <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">{result.configPath}</code>
              </div>
              <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1 md:col-span-2">
                <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">主程序目录</span>
                <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">{result.openclawDir}</code>
              </div>
              <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1 md:col-span-2">
                <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">运行沙箱目录</span>
                <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">{result.nodeDir}</code>
              </div>
            </div>
          </CardContent>
          <Button variant="default" onClick={handleBackToConfig}>
            返回配置首页
          </Button>
        </Card>
      );
    }

    if (wizardStep === 0) {
      return (
        <div className="split-layout grid grid-cols-1 lg:grid-cols-2 gap-6 precheck-mode animate-fade-in">
          {/* Inputs Card */}
          <Card>
            <CardHeader>
              <CardTitle>步骤 1: 部署路径配置</CardTitle>
              <CardDescription>指定项目运行目录与受管环境基础目录</CardDescription>
            </CardHeader>
            <CardContent className="form-stack">
              <div className="form-group flex flex-col gap-2">
                <label className="flex justify-between text-xs font-semibold text-[hsl(var(--body-strong))]">
                  <span>项目根目录</span>
                  <span className="text-[10px] text-[hsl(var(--muted-soft))] font-normal">必填，工具链根文件夹</span>
                </label>
                <div className="directory-input-wrapper flex gap-2">
                  <Input
                    value={projectRoot}
                    onChange={(e) => setProjectRoot(e.target.value)}
                    placeholder="如 D:\coding\auto-intsall-openclaw"
                  />
                  <Button variant="secondary" onClick={() => pickDirectory('projectRoot')}>
                    <FolderIcon size={13} className="mr-1.5" /> 选择
                  </Button>
                </div>
              </div>

              <div className="form-group flex flex-col gap-2">
                <label className="flex justify-between text-xs font-semibold text-[hsl(var(--body-strong))]">
                  <span>OpenClaw 部署基础目录</span>
                  <span className="text-[10px] text-[hsl(var(--muted-soft))] font-normal">目标安装根路径</span>
                </label>
                <div className="directory-input-wrapper flex gap-2">
                  <Input
                    value={baseDir}
                    onChange={(e) => setBaseDir(e.target.value)}
                    placeholder="如 D:\OpenClaw"
                  />
                  <Button variant="secondary" onClick={() => pickDirectory('baseDir')}>
                    <FolderIcon size={13} className="mr-1.5" /> 选择
                  </Button>
                </div>
              </div>

              <Button
                variant="default"
                className="mt-4 h-10 w-full"
                onClick={() => setWizardStep(1)}
                disabled={!step1Ready}
              >
                下一步：配置授权与提取模式 <ChevronRightIcon size={14} className="ml-1.5" />
              </Button>
              {dashboardLoading && (
                <div className="text-[11px] text-[hsl(var(--muted-soft))] text-center mt-2">
                  正在同步校验本地配置状态...
                </div>
              )}
            </CardContent>
          </Card>

          {/* Checks Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
              <div>
                <CardTitle>项目就绪性检测</CardTitle>
                <CardDescription className="mt-1">自动识别基础运行与目录结构</CardDescription>
              </div>
              <span className={`text-sm font-semibold ${step1Ready ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]'}`}>
                {step1Checks.filter((c) => c.state === 'ok').length}/{step1Checks.length} 项通过
              </span>
            </CardHeader>
            <CardContent className="check-list-container flex flex-col gap-3 pr-1">
              {step1Checks.map((item) => (
                <div
                  className="check-card flex gap-3.5 p-4 rounded-lg bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))] transition-all duration-200 hover:border-[hsl(var(--muted-soft)/0.6)]"
                  key={item.id}
                  data-state={item.state}
                >
                  <div className={`check-status-indicator w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    item.state === 'ok' ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]' :
                    item.state === 'error' ? 'bg-[hsl(var(--error)/0.15)] text-[hsl(var(--error))]' :
                    'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]'
                  }`}>
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
              {step1Checks.length === 0 && (
                <div className="flex items-center justify-center text-[hsl(var(--muted-soft))] text-xs py-8">
                  等待环境初始化...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    if (wizardStep === 1) {
      return (
        <div className="split-layout grid grid-cols-1 lg:grid-cols-2 gap-6 precheck-mode animate-fade-in">
          {/* Inputs Card */}
          <Card>
            <CardHeader>
              <CardTitle>步骤 2: 授权激活与模式</CardTitle>
              <CardDescription>验证激活密钥，设定组件获取源与安装版本</CardDescription>
            </CardHeader>
            <CardContent className="form-stack">
              <div className="form-group flex flex-col gap-2">
                <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">
                  <span>离线激活授权密钥</span>
                </label>
                <div className="relative">
                  <KeyIcon
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted))]"
                  />
                  <Input
                    type="password"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    className="pl-9"
                    placeholder="激活许可证密钥"
                  />
                </div>
              </div>

              <div className="form-group flex flex-col gap-2">
                <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">
                  <span>版本设定</span>
                </label>
                <Input
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                  placeholder="latest 或特定版本号，如 1.2.0"
                />
              </div>

              <div className="form-group flex flex-col gap-2">
                <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">
                  <span>组件提取模式</span>
                </label>
                <Select value={installMode} onChange={(e) => setInstallMode(e.target.value as InstallMode)}>
                  <option value="local">本地离线包 (从 artifacts/ 目录读取)</option>
                  <option value="remote">公司内部远程包 (从服务器端获取拉取)</option>
                  <option value="npm">NPM 官方包分发 (通过网络动态部署)</option>
                </Select>
              </div>

              <div className="flex gap-4 mt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setWizardStep(0)}>
                  <ArrowLeftIcon size={14} className="mr-1.5" /> 上一步
                </Button>
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={startInstall}
                  disabled={loading || !step2Ready}
                >
                  {loading ? (
                    <>
                      <SpinnerIcon size={14} className="spinning mr-2" />
                      部署中...
                    </>
                  ) : (
                    <>
                      <PlayIcon size={12} className="mr-2" />
                      开始部署安装
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Checks Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
              <div>
                <CardTitle>授权与配置预检</CardTitle>
                <CardDescription className="mt-1">校验激活包密钥及包源可用状态</CardDescription>
              </div>
              <span className={`text-sm font-semibold ${step2Ready ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]'}`}>
                {step2Checks.filter((c) => c.state === 'ok').length}/{step2Checks.length} 项通过
              </span>
            </CardHeader>
            <CardContent className="check-list-container flex flex-col gap-3 pr-1">
              {step2Checks.map((item) => (
                <div
                  className="check-card flex gap-3.5 p-4 rounded-lg bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))] transition-all duration-200 hover:border-[hsl(var(--muted-soft)/0.6)]"
                  key={item.id}
                  data-state={item.state}
                >
                  <div className={`check-status-indicator w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    item.state === 'ok' ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]' :
                    item.state === 'error' ? 'bg-[hsl(var(--error)/0.15)] text-[hsl(var(--error))]' :
                    'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]'
                  }`}>
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
            </CardContent>
          </Card>
        </div>
      );
    }

    if (wizardStep === 2) {
      return (
        <div className="product-mockup-card-dark view-container">
          <div className="panel-heading mb-0">
            <h2 className="text-[hsl(var(--on-dark))] text-xl font-serif">步骤 3: 运行环境依赖部署</h2>
            <span>正在安装 Node 及 OpenClaw 核心制品...</span>
          </div>

          <div className="progress-wrapper bg-[hsl(var(--surface-dark))] border border-white/5 rounded-lg p-5 flex items-center gap-8">
            <div className="progress-info flex flex-col min-w-[5rem]">
              <span className="text-[10px] text-[hsl(var(--on-dark-soft))] uppercase tracking-wide">整体进度</span>
              <strong className="font-serif text-3xl text-[hsl(var(--primary))] font-normal">{progressValue}%</strong>
            </div>
            <div className="progress-bar-container flex-1 flex flex-col gap-2">
              <div className="progress-bar-text flex justify-between text-xs font-medium text-[hsl(var(--on-dark))]">
                <span>{dashboard?.currentStepLabel ?? '核心安装进行中...'}</span>
                <span className="text-[hsl(var(--on-dark-soft))]">
                  {completedCount} / {stage1Steps.length} 步骤已完成
                </span>
              </div>
              <Progress value={progressValue} className="h-2" />
            </div>
          </div>

          <div className="split-layout grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-[hsl(var(--surface-dark-soft))] border-white/5 p-6 flex flex-col">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-[hsl(var(--on-dark))] text-lg font-sans font-medium">流程微步骤流水</CardTitle>
                <CardDescription className="text-xs text-[hsl(var(--on-dark-soft))]">步骤 1-9: 基础环境与依赖写入</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="sub-steps-timeline flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1" ref={timelineContainerRef}>
                  {step3TimelineItems.map((step) => {
                    const isActive = step.state === 'current';
                    const isDone = step.state === 'done';
                    const isFailed = step.state === 'failed';

                    return (
                      <div key={step.id} className={`timeline-row flex gap-4 p-3 rounded-lg border items-center transition-all duration-200 ${
                        isActive ? 'bg-[hsl(var(--surface-dark-elevated))] border-[hsl(var(--primary)/0.3)]' :
                        isDone ? 'bg-[hsl(var(--surface-dark-soft))] border-[hsl(var(--success)/0.15)]' :
                        isFailed ? 'bg-[hsl(var(--surface-dark-soft))] border-[hsl(var(--error)/0.3)]' :
                        'bg-[hsl(var(--surface-dark-soft))] border-white/2'
                      }`}>
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
                        <div className={`timeline-status-badge text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                          isDone ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]' :
                          isActive ? 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--on-dark))]' :
                          isFailed ? 'bg-[hsl(var(--error)/0.15)] text-[hsl(var(--error))]' :
                          'bg-white/5 text-[hsl(var(--on-dark-soft))]'
                        }`}>
                          {step.state === 'done'
                            ? '已就绪'
                            : step.state === 'current'
                            ? '运行中'
                            : step.state === 'failed'
                            ? '受阻'
                            : '等待中'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[hsl(var(--surface-dark-soft))] border-white/5 p-6 flex flex-col">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-[hsl(var(--on-dark))] text-lg font-sans font-medium">后台任务检测</CardTitle>
                <CardDescription className="text-xs text-[hsl(var(--on-dark-soft))]">活动部署步骤之实时诊断</CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                {diagnosticsInfo ? (
                  <div className="diagnostic-step-info bg-[hsl(var(--surface-dark-soft))] border border-white/3 rounded-lg p-4 flex flex-col gap-3 flex-1">
                    <div className="diagnostic-title flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] border-b border-white/5 pb-2">
                      <SettingsIcon size={14} className="spinning text-[hsl(var(--primary))]" style={{ animationDuration: '12s' }} />
                      {diagnosticsInfo.title}
                    </div>
                    <p className="diagnostic-desc text-xs text-[hsl(var(--on-dark-soft))] leading-relaxed">{diagnosticsInfo.description}</p>
                    <div className="diagnostic-tasks-list flex flex-col gap-2.5 mt-2">
                      {diagnosticsInfo.tasks.map((task, i) => (
                        <div key={i} className={`diagnostic-task-item flex gap-3 text-xs items-start text-[hsl(var(--on-dark-soft))] ${
                          task.status === 'checked' ? 'text-[hsl(var(--on-dark))]' : ''
                        }`}>
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
          </div>
        </div>
      );
    }

    return (
      <div className="product-mockup-card-dark view-container animate-fade-in">
        <div className="panel-heading mb-0">
          <h2 className="text-[hsl(var(--on-dark))] text-xl font-serif">步骤 4: 写入配置与服务验证</h2>
          <span>写入 openclaw.json 系统配置及 Skills 数据，开启首次冷启动联调校验...</span>
        </div>

        <div className="progress-wrapper bg-[hsl(var(--surface-dark))] border border-white/5 rounded-lg p-5 flex items-center gap-8">
          <div className="progress-info flex flex-col min-w-[5rem]">
            <span className="text-[10px] text-[hsl(var(--on-dark-soft))] uppercase tracking-wide">整体进度</span>
            <strong className="font-serif text-3xl text-[hsl(var(--primary))] font-normal">{progressValue}%</strong>
          </div>
          <div className="progress-bar-container flex-1 flex flex-col gap-2">
            <div className="progress-bar-text flex justify-between text-xs font-medium text-[hsl(var(--on-dark))]">
              <span>{dashboard?.currentStepLabel ?? '核心安装进行中...'}</span>
              <span className="text-[hsl(var(--on-dark-soft))]">
                {completedCount} / {stage1Steps.length} 步骤已完成
              </span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>
        </div>

        <div className="split-layout grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-[hsl(var(--surface-dark-soft))] border-white/5 p-6 flex flex-col">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-[hsl(var(--on-dark))] text-lg font-sans font-medium">流程微步骤流水</CardTitle>
              <CardDescription className="text-xs text-[hsl(var(--on-dark-soft))]">步骤 10-15: 系统配置写入及启动校验</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="sub-steps-timeline flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1" ref={timelineContainerRef}>
                {step4TimelineItems.map((step) => {
                  const isActive = step.state === 'current';
                  const isDone = step.state === 'done';
                  const isFailed = step.state === 'failed';

                  return (
                    <div key={step.id} className={`timeline-row flex gap-4 p-3 rounded-lg border items-center transition-all duration-200 ${
                      isActive ? 'bg-[hsl(var(--surface-dark-elevated))] border-[hsl(var(--primary)/0.3)]' :
                      isDone ? 'bg-[hsl(var(--surface-dark-soft))] border-[hsl(var(--success)/0.15)]' :
                      isFailed ? 'bg-[hsl(var(--surface-dark-soft))] border-[hsl(var(--error)/0.3)]' :
                      'bg-[hsl(var(--surface-dark-soft))] border-white/2'
                    }`}>
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
                      <div className={`timeline-status-badge text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                        isDone ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]' :
                        isActive ? 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--on-dark))]' :
                        isFailed ? 'bg-[hsl(var(--error)/0.15)] text-[hsl(var(--error))]' :
                        'bg-white/5 text-[hsl(var(--on-dark-soft))]'
                      }`}>
                        {step.state === 'done'
                          ? '已就绪'
                          : step.state === 'current'
                          ? '运行中'
                          : step.state === 'failed'
                          ? '受阻'
                          : '等待中'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[hsl(var(--surface-dark-soft))] border-white/5 p-6 flex flex-col">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-[hsl(var(--on-dark))] text-lg font-sans font-medium">后台任务检测</CardTitle>
              <CardDescription className="text-xs text-[hsl(var(--on-dark-soft))]">活动部署步骤之实时诊断</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col">
              {diagnosticsInfo ? (
                <div className="diagnostic-step-info bg-[hsl(var(--surface-dark-soft))] border border-white/3 rounded-lg p-4 flex flex-col gap-3 flex-1">
                  <div className="diagnostic-title flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] border-b border-white/5 pb-2">
                    <SettingsIcon size={14} className="spinning text-[hsl(var(--primary))]" style={{ animationDuration: '12s' }} />
                    {diagnosticsInfo.title}
                  </div>
                  <p className="diagnostic-desc text-xs text-[hsl(var(--on-dark-soft))] leading-relaxed">{diagnosticsInfo.description}</p>
                  <div className="diagnostic-tasks-list flex flex-col gap-2.5 mt-2">
                    {diagnosticsInfo.tasks.map((task, i) => (
                      <div key={i} className={`diagnostic-task-item flex gap-3 text-xs items-start text-[hsl(var(--on-dark-soft))] ${
                        task.status === 'checked' ? 'text-[hsl(var(--on-dark))]' : ''
                      }`}>
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
        </div>
      </div>
    );
  };

  return (
    <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
      <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
        <header className="hero-panel flex justify-between items-center pb-6 border-b border-[hsl(var(--hairline))]">
          <div>
            <div className="eyebrow-container flex items-center gap-2 mb-1">
              <BrandSpike size={14} className="text-[hsl(var(--ink))]" />
              <span className="eyebrow text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
                OpenClaw Toolkit · Stage 1
              </span>
            </div>
            <h1 className="font-serif text-4xl text-[hsl(var(--ink))] font-normal tracking-tight leading-tight">
              部署受管运行环境
            </h1>
            <p className="text-sm text-[hsl(var(--muted))] mt-1">
              基于离线授权系统检测，为 OpenClaw 开发生态圈构建隔离沙箱 Node 运行环境。
            </p>
          </div>
          {dashboard?.openclawVersion && (
            <div className="flex flex-col items-end gap-1">
              <span className="badge-coral bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">
                NEW
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted))] mt-1 font-medium">
                解析目标版本
              </span>
              <strong className="font-serif text-2xl text-[hsl(var(--primary))] font-normal leading-none mt-0.5">
                v{dashboard.openclawVersion}
              </strong>
              <span className="text-xs text-[hsl(var(--muted-soft))] font-medium">
                Node {dashboard.nodeVersion || '待加载'}
              </span>
            </div>
          )}
        </header>

        {/* Global Horizontal Wizard Stepper (Aligned perfectly in equal columns) */}
        <div className="stepper-container shadow-sm">
          {masterPhases.map((mp, index) => {
            let state: 'done' | 'active' | 'pending' = 'pending';
            if (wizardStep === index) {
              state = 'active';
            } else if (wizardStep > index) {
              state = 'done';
            }

            return (
              <div 
                key={mp.id} 
                className={`step-node group ${state}`}
                onClick={() => {
                  if (phase !== 'running' && phase !== 'succeeded' && index <= 1) {
                    setWizardStep(index);
                  }
                }}
              >
                {/* Horizontal line connector positioned behind the node circles */}
                {index < masterPhases.length - 1 && (
                  <div className="step-node-line">
                    <div className="step-node-line-fill" />
                  </div>
                )}
                
                <div className="step-node-circle">
                  {state === 'done' ? (
                    <CheckIcon size={12} />
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="step-node-label">{mp.label}</div>
              </div>
            );
          })}
        </div>

        {renderContent()}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
