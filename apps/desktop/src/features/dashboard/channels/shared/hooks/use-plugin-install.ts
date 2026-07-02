import { useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { PluginInstallProgress } from '@/openclaw/model/types';

export type PluginInstallDialogCopy = {
  title: string;
  description: string;
  idleMessage: string;
  installingLabel: string;
  errorLabel: string;
  cancelLabel?: string;
  closeLabel?: string;
};

type UsePluginInstallOptions = {
  eventName: string;
  inspectInstalled: () => Promise<boolean>;
  install: () => Promise<unknown>;
  initialProgress: PluginInstallProgress;
  dialog: PluginInstallDialogCopy;
  closeOnSuccess?: boolean;
};

type UsePluginInstallResult = {
  open: boolean;
  installing: boolean;
  checking: boolean;
  error: string | null;
  progress: PluginInstallProgress | null;
  dialog: PluginInstallDialogCopy;
  ensureReady: () => Promise<boolean>;
  close: () => void;
};

export type UsePluginOperationResult = UsePluginInstallResult;
export const OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT = 'openclaw://plugin-install-progress';
export const OPENCLAW_PLUGIN_UNINSTALL_PROGRESS_EVENT = 'openclaw://plugin-uninstall-progress';

export function usePluginInstall({
  eventName,
  inspectInstalled,
  install,
  initialProgress,
  dialog,
  closeOnSuccess = true
}: UsePluginInstallOptions): UsePluginOperationResult {
  const progressUnlistenRef = useRef<UnlistenFn | null>(null);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PluginInstallProgress | null>(null);

  useEffect(() => {
    return () => {
      if (progressUnlistenRef.current) {
        void progressUnlistenRef.current();
        progressUnlistenRef.current = null;
      }
    };
  }, []);

  async function ensureReady() {
    setError(null);
    setProgress(null);
    setChecking(true);

    try {
      const installed = await inspectInstalled();
      if (installed) {
        setChecking(false);
        return true;
      }

      setOpen(true);
      setInstalling(true);
      setProgress(initialProgress);

      if (!progressUnlistenRef.current) {
        progressUnlistenRef.current = await listen<PluginInstallProgress>(eventName, (event) => {
          setProgress(event.payload);
        });
      }

      try {
        await install();
        setInstalling(false);
        setChecking(false);
        if (closeOnSuccess) {
          setOpen(false);
        }
        return true;
      } catch (installError) {
        setInstalling(false);
        setChecking(false);
        setError(installError instanceof Error ? installError.message : String(installError));
        return false;
      }
    } catch (inspectError) {
      setChecking(false);
      setError(inspectError instanceof Error ? inspectError.message : String(inspectError));
      return false;
    }
  }

  function close() {
    if (installing) {
      return;
    }
    setOpen(false);
    setError(null);
  }

  return {
    open,
    installing,
    checking,
    error,
    progress,
    dialog,
    ensureReady,
    close
  };
}
