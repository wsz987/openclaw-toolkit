type ChannelActivationOptions = {
  enabled: boolean;
  configured: boolean;
  loading?: boolean;
  ensureReady?: () => Promise<boolean>;
  onEnable: () => Promise<boolean>;
  onDisable: () => Promise<boolean>;
  onRequireConfiguration?: () => void;
};

type ChannelActivationResult = {
  toggle: (nextEnabled: boolean) => Promise<boolean>;
};

export function useChannelActivation({
  enabled,
  configured,
  loading = false,
  ensureReady,
  onEnable,
  onDisable,
  onRequireConfiguration
}: ChannelActivationOptions): ChannelActivationResult {
  async function toggle(nextEnabled: boolean) {
    if (loading || nextEnabled === enabled) {
      return false;
    }

    if (!nextEnabled) {
      return onDisable();
    }

    if (ensureReady) {
      const ready = await ensureReady();
      if (!ready) {
        return false;
      }
    }

    if (!configured) {
      onRequireConfiguration?.();
      return false;
    }

    return onEnable();
  }

  return {
    toggle
  };
}
