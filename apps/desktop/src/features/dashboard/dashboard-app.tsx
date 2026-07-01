import { useMemo } from 'react';
import { PostInstallHomeScreen } from './components/post-install-home-screen';
import { useOpenClawInstaller, type OpenClawInstallerController } from '../installer/hooks/use-openclaw-installer';
import { isRecoveredInstallationState } from '../installer/model/app-flow';
import type { AppBootstrapState } from '../installer/model/types';

type DashboardAppProps = {
  bootstrapState?: AppBootstrapState | null;
  onExitInstalledHome?: () => void;
  initialBaseDir?: string | null;
  /**
   * 由安装向导完成安装后直接传入的控制器。
   * 若未提供（如恢复进入已安装环境），则本组件自行构造控制器。
   */
  controller?: OpenClawInstallerController;
};

/**
 * 安装完成后的控制台入口。
 *
 * 负责渲染 PostInstallHomeScreen（控制面板、聊天渠道、Provider 授权、
 * Skill 管理、卸载等功能）。
 *
 * 两种挂载路径：
 *  1. 恢复进入：app-bootstrap 判定为"已安装/恢复"状态时直接挂载本组件，
 *     由本组件根据 bootstrapState 自行构造控制器。
 *  2. 安装向导完成：InstallerApp 在安装成功后挂载本组件，并传入已持有
 *     安装结果（result）的控制器，避免重新拉取状态的竞态。
 */
export function DashboardApp({ bootstrapState, onExitInstalledHome, initialBaseDir, controller }: DashboardAppProps) {
  const resolvedBaseDir = useMemo(
    () =>
      initialBaseDir ??
      bootstrapState?.settings.lastSelectedBaseDir ??
      bootstrapState?.activeInstallation?.baseDir ??
      bootstrapState?.defaultBaseDir ??
      null,
    [initialBaseDir, bootstrapState]
  );

  const ownedController = useOpenClawInstaller(
    resolvedBaseDir,
    bootstrapState?.activeInstallation?.configPath ?? null,
    isRecoveredInstallationState(bootstrapState)
  );

  const activeController = controller ?? ownedController;

  return (
    <PostInstallHomeScreen
      bootstrapState={bootstrapState}
      controller={activeController}
      onExitInstalledHome={onExitInstalledHome}
    />
  );
}
