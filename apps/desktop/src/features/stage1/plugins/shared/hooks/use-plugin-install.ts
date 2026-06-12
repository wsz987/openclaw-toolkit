import { useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { PluginInstallProgress } from '../../../model/types';

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
  error: string | null;
  progress: PluginInstallProgress | null;
  dialog: PluginInstallDialogCopy;
  ensureReady: () => Promise<boolean>;
  close: () => void;
};

export type UsePluginOperationResult = UsePluginInstallResult;

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

    const installed = await inspectInstalled();
    if (installed) {
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
      if (closeOnSuccess) {
        setOpen(false);
      }
      return true;
    } catch (installError) {
      setInstalling(false);
      setError(installError instanceof Error ? installError.message : String(installError));
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
    error,
    progress,
    dialog,
    ensureReady,
    close
  };
}
