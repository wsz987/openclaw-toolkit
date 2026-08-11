import { describe, expect, it, vi } from 'vitest';
import {
  inspectInstallDashboard,
  readInstallLogTail,
  startOpenClawInstall
} from '../src/openclaw/api/client';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}));

describe('installer API command names', () => {
  it('uses neutral install workflow commands', async () => {
    invokeMock.mockResolvedValueOnce({
      workflowId: null,
      phase: 'precheck',
      currentStep: null,
      currentStepLabel: '',
      progress: 0,
      completedSteps: [],
      failedStep: null,
      message: null,
      steps: [],
      environment: [],
      installMode: 'local',
      selectedVersion: 'latest',
      openclawVersion: null,
      nodeVersion: null,
      baseDir: '',
      systemOpenclaw: { detected: false, executable: null, version: null, error: null },
      systemNode: {
        detected: false,
        executable: null,
        version: null,
        satisfiesRequirement: null,
        error: null
      },
      installPlan: {
        targetOpenclawVersion: null,
        targetNodeVersion: null,
        action: 'install',
        requiresConfirmation: false
      }
    });
    invokeMock.mockResolvedValueOnce({
      workflowId: 'wf',
      status: 'ok',
      openclawVersion: '1',
      nodeVersion: '1',
      openclawDir: '',
      nodeDir: '',
      configPath: ''
    });
    invokeMock.mockResolvedValueOnce({ path: '', lines: [], truncated: false });

    await inspectInstallDashboard({
      baseDir: '',
      installMode: 'local',
      selectedVersion: 'latest'
    });
    await startOpenClawInstall({
      baseDir: '',
      installMode: 'local',
      selectedVersion: 'latest'
    });
    await readInstallLogTail('', 20);

    expect(invokeMock.mock.calls.map((call) => call[0])).toEqual([
      'inspect_install_dashboard_command',
      'start_openclaw_install',
      'read_install_log_tail_command'
    ]);
  });
});
