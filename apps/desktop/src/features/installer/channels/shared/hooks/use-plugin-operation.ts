import { usePluginInstall, type UsePluginOperationResult } from './use-plugin-install';

export type PluginOperationDialogCopy = {
  title: string;
  description: string;
  idleMessage: string;
  installingLabel: string;
  errorLabel: string;
  cancelLabel?: string;
  closeLabel?: string;
};

type UsePluginOperationOptions = {
  eventName: string;
  inspectInstalled: () => Promise<boolean>;
  run: () => Promise<unknown>;
  initialProgress: {
    stage: string;
    progress: number;
    message: string;
    done: boolean;
    failed: boolean;
  };
  dialog: PluginOperationDialogCopy;
  mode: 'install' | 'uninstall';
  closeOnSuccess?: boolean;
};

export function usePluginOperation({
  eventName,
  inspectInstalled,
  run,
  initialProgress,
  dialog,
  mode,
  closeOnSuccess
}: UsePluginOperationOptions): UsePluginOperationResult {
  return usePluginInstall({
    eventName,
    inspectInstalled: async () => {
      const installed = await inspectInstalled();
      return mode === 'install' ? installed : !installed;
    },
    install: run,
    initialProgress,
    dialog,
    closeOnSuccess
  });
}
