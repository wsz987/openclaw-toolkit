import { describe, expect, it } from 'vitest';
import {
  isInstallerWorkflowScreen,
  isPostInstallScreen,
  resolveInstallerScreen,
  type InstallerScreen
} from '../src/features/stage1/model/app-flow';

describe('installer app flow screen names', () => {
  it('exports neutral installer screen APIs', () => {
    const screen: InstallerScreen = resolveInstallerScreen({
      bootstrapState: null,
      hasError: false,
      hasInstallResult: false,
      phase: 'precheck',
      showPostInstallHome: false,
      wizardStep: 1
    });

    expect(screen).toBe('config');
    expect(isInstallerWorkflowScreen(screen)).toBe(true);
    expect(isPostInstallScreen(screen)).toBe(false);
  });
});
