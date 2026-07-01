import { describe, expect, it, vi } from 'vitest';
import {
  inspectStage1Dashboard,
  readStage1InstallLogTail,
  startStage1Install
} from '../src/features/stage1/api/stage1-api';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}));

describe('stage1 API command names', () => {
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

    await inspectStage1Dashboard({
      baseDir: '',
      licenseKey: '',
      installMode: 'local',
      selectedVersion: 'latest'
    });
    await startStage1Install({
      baseDir: '',
      licenseKey: '',
      installMode: 'local',
      selectedVersion: 'latest'
    });
    await readStage1InstallLogTail('', 20);

    expect(invokeMock.mock.calls.map((call) => call[0])).toEqual([
      'inspect_install_dashboard_command',
      'start_openclaw_install',
      'read_install_log_tail_command'
    ]);
  });
});
