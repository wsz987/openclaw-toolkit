import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { Card } from './components/card';
import { DirectoryField } from './components/directory-field';
import { InstallModeSelect } from './components/install-mode-select';
import { PrimaryButton } from './components/primary-button';
import { SecretField } from './components/secret-field';
import { SectionTitle } from './components/section-title';
import { StatusBanner } from './components/status-banner';
import { TextField } from './components/text-field';
import './styles.css';

type InstallMode = 'local' | 'remote' | 'npm';

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

function App() {
  const [projectRoot, setProjectRoot] = useState('D:\\coding\\auto-intsall-openclaw');
  const [baseDir, setBaseDir] = useState('D:\\OpenClaw');
  const [licenseKey, setLicenseKey] = useState('stage1-dev');
  const [installMode, setInstallMode] = useState<InstallMode>('local');
  const [selectedVersion, setSelectedVersion] = useState('latest');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Stage1InstallResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => ({
    projectRoot,
    baseDir,
    licenseKey,
    installMode,
    selectedVersion
  }), [projectRoot, baseDir, licenseKey, installMode, selectedVersion]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="panel wizard">
        <SectionTitle
          title="Stage 1 安装向导"
          description="为国网内网环境自动配置 OpenClaw 运行环境、受管 Node Runtime、skills 和权限。"
        />

        <Card title="基础配置" description="用户可见且需要选择的安装参数。">
          <div className="wizard-grid">
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
        </Card>

        <div className="actions">
          <PrimaryButton onClick={startInstall} disabled={loading}>
            {loading ? '安装中…' : '开始安装'}
          </PrimaryButton>
        </div>

        {error ? <StatusBanner kind="error" title="失败" message={error} /> : null}

        {result ? (
          <div className="status success">
            <strong>安装完成</strong>
            <div className="result-grid">
              <span>Workflow ID</span><code>{result.workflowId}</code>
              <span>OpenClaw 版本</span><code>{result.openclawVersion}</code>
              <span>Node 版本</span><code>{result.nodeVersion}</code>
              <span>OpenClaw 目录</span><code>{result.openclawDir}</code>
              <span>Node 目录</span><code>{result.nodeDir}</code>
              <span>配置路径</span><code>{result.configPath}</code>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
