import { FeishuPluginPanel, type FeishuPluginPanelProps } from '../plugins/feishu/components/feishu-plugin-panel';

export type ChannelsPanelProps = FeishuPluginPanelProps;

export function ChannelsPanel(props: ChannelsPanelProps) {
  return <FeishuPluginPanel {...props} />;
}
