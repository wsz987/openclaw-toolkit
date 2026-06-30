import type { DesktopUpdateStatus } from './use-desktop-updater';

export type DesktopUpdateCheckFailure = {
  status: DesktopUpdateStatus;
  userError: string | null;
  logMessage: string;
};

export function buildUpdateCheckFailure(err: unknown, manual: boolean): DesktopUpdateCheckFailure {
  const message = err instanceof Error ? err.message : String(err);

  return {
    status: manual ? 'not-available' : 'idle',
    userError: null,
    logMessage: `[更新检查] ${message}`
  };
}
