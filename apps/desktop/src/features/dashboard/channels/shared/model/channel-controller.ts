export type ChannelController = {
  id: string;
  enabled: boolean;
  configured: boolean;
  loading: boolean;
  ensureReady?: () => Promise<boolean>;
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;
  openConfiguration: () => void;
};
