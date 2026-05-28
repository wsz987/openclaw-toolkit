import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { DirectoryField } from './components/directory-field';
import { InstallModeSelect } from './components/install-mode-select';
import { PrimaryButton } from './components/primary-button';
import { Progress } from './components/progress';
import { SecretField } from './components/secret-field';
import { StatusBanner } from './components/status-banner';
import { TextField } from './components/text-field';
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
  { id: 'configureBrowser', title: '配置浏览器运行环境', description: '确认浏览器运行环境可用' },
  { id: 'verifyRuntime', title: '验证运行环境', description: '执行最终运行校验' }
];

const stage1StepSet = new Set(stage1Steps.map((step) => step.id));

function isInstallStep(value: string): value is InstallStep {
  return stage1StepSet.has(value as InstallStep);
}

function stepStateLabel(state: Stage1StepState) {
  switch (state) {
    case 'done':
      return '已完成';
    case 'current':
      return '进行中';
    case 'failed':
      return '失败';
    default:
      return '等待中';
  }
}

function environmentLabel(state: Stage1CheckState) {
  switch (state) {
    case 'ok':
      return '正常';
    case 'warn':
      return '待确认';
    default:
      return '异常';
  }
}

function phaseLabel(phase: Stage1Phase) {
  switch (phase) {
    case 'precheck':
      return '环境预检';
    case 'running':
      return '安装进行中';
    case 'succeeded':
      return '安装完成';
    default:
      return '安装失败';
  }
}

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

  const payload = useMemo(() => ({
    projectRoot,
    baseDir,
    licenseKey,
    installMode,
    selectedVersion
  }), [projectRoot, baseDir, licenseKey, installMode, selectedVersion]);

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

  useEffect(() => {
    void loadDashboard();
  }, [payload]);

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
  const failedChecks = environmentItems.filter((item) => item.state === 'error').length;
  const warningChecks = environmentItems.filter((item) => item.state === 'warn').length;
  const readyChecks = environmentItems.filter((item) => item.state === 'ok').length;
  const phase = dashboard?.phase ?? 'precheck';
  const isReady = failedChecks === 0;
  const visibleSteps = stepProgress.filter((step) => step.state !== 'pending' || step.id === activeStep?.id).slice(-6);
  const upcomingStep = stepProgress.find((step) => step.state === 'pending');

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="hero-panel">
          <div>
            <div className="eyebrow">OpenClaw Toolkit · Stage 1</div>
            <h1>部署受管运行环境</h1>
            <p>
              按设计流程完成环境检测、版本解析、Node Runtime 安装、OpenClaw 配置、skills 和权限写入。
            </p>
          </div>
          <div className={`hero-status ${phase}`}>
            <span>{phaseLabel(phase)}</span>
            <strong>{progressValue}%</strong>
            <small>{completedCount}/{stage1Steps.length} 步完成</small>
          </div>
        </header>

        <section className="status-strip">
          <div className="metric-card primary">
            <span>当前步骤</span>
            <strong>{dashboard?.currentStepLabel ?? '正在初始化预检'}</strong>
            <small>{dashboard?.message ?? '页面加载后会自动判断进行到哪一步'}</small>
          </div>
          <div className="metric-card">
            <span>环境检查</span>
            <strong>{readyChecks}/{environmentItems.length || 10} 正常</strong>
            <small>{failedChecks > 0 ? `${failedChecks} 项异常需要处理` : warningChecks > 0 ? `${warningChecks} 项待确认` : '可以开始安装'}</small>
          </div>
          <div className="metric-card">
            <span>目标版本</span>
            <strong>{dashboard?.openclawVersion ?? selectedVersion}</strong>
            <small>Node {dashboard?.nodeVersion ?? '待解析'}</small>
          </div>
        </section>

        <section className="console-grid">
          <div className="install-main">
            <section className="glass-panel progress-console">
              <div className="panel-heading">
                <div>
                  <span>安装进度</span>
                  <h2>{activeStep?.title ?? dashboard?.currentStepLabel ?? '等待开始'}</h2>
                </div>
                <span className={`pill ${phase === 'failed' ? 'error' : phase === 'succeeded' ? 'ok' : 'warn'}`}>
                  {phaseLabel(phase)}
                </span>
              </div>
              <Progress value={progressValue} />
              <div className="timeline">
                {visibleSteps.length > 0 ? visibleSteps.map((step) => (
                  <div className={`timeline-item ${step.state}`} key={step.id}>
                    <div className="timeline-dot" />
                    <div>
                      <div className="timeline-title">
                        <strong>{step.title}</strong>
                        <span>{stepStateLabel(step.state)}</span>
                      </div>
                      <p>{step.description}</p>
                    </div>
                  </div>
                )) : (
                  <div className="empty-state">完成配置后点击开始安装，流程会从加载 Manifest 开始推进。</div>
                )}
                {upcomingStep && phase !== 'succeeded' ? (
                  <div className="next-step">下一步：{upcomingStep.title}</div>
                ) : null}
              </div>
            </section>

            {result ? (
              <section className="glass-panel result-panel">
                <div className="panel-heading">
                  <div>
                    <span>安装结果</span>
                    <h2>OpenClaw 已就绪</h2>
                  </div>
                </div>
                <div className="result-grid">
                  <span>Workflow ID</span><code>{result.workflowId}</code>
                  <span>OpenClaw 版本</span><code>{result.openclawVersion}</code>
                  <span>Node 版本</span><code>{result.nodeVersion}</code>
                  <span>OpenClaw 目录</span><code>{result.openclawDir}</code>
                  <span>Node 目录</span><code>{result.nodeDir}</code>
                  <span>配置路径</span><code>{result.configPath}</code>
                </div>
              </section>
            ) : null}
          </div>

          <aside className="install-side">
            <section className="glass-panel action-panel">
              <div className="panel-heading compact">
                <div>
                  <span>安装参数</span>
                  <h2>开始前确认</h2>
                </div>
              </div>
              <div className="form-stack">
                <DirectoryField
                  label="项目根目录"
                  value={projectRoot}
                  onChange={setProjectRoot}
                  onPick={() => pickDirectory('projectRoot')}
                />
                <DirectoryField
                  label="OpenClaw 基础目录"
                  value={baseDir}
                  onChange={setBaseDir}
                  onPick={() => pickDirectory('baseDir')}
                />
                <SecretField label="激活密钥" value={licenseKey} onChange={setLicenseKey} />
                <TextField label="目标版本" value={selectedVersion} onChange={setSelectedVersion} placeholder="latest" />
                <InstallModeSelect installMode={installMode} onChange={setInstallMode} />
              </div>
              <PrimaryButton onClick={startInstall} disabled={loading || !isReady}>
                {loading ? '安装中…' : isReady ? '开始 Stage 1 安装' : '先处理异常项'}
              </PrimaryButton>
              {dashboardLoading ? <div className="side-note">正在检测环境和安装状态…</div> : null}
            </section>

            <section className="glass-panel checks-panel">
              <div className="panel-heading compact">
                <div>
                  <span>环境状态</span>
                  <h2>可执行性检查</h2>
                </div>
              </div>
              <div className="check-list">
                {environmentItems.map((item) => (
                  <div className="check-item" key={item.id}>
                    <div className="check-icon" data-state={item.state} />
                    <div>
                      <div className="check-title">
                        <strong>{item.label}</strong>
                        <span>{environmentLabel(item.state)}</span>
                      </div>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>

        {error ? <StatusBanner kind="error" title="失败" message={error} /> : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
