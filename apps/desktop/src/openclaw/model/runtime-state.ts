import type { RuntimeLifecycleState } from './types';

export function deriveRuntimePresentation(
  state: RuntimeLifecycleState,
  gatewayReady: boolean,
  error: string | null
) {
  switch (state) {
    case 'starting':
      return { busy: true, canStart: false, canStop: true, label: '服务启动中', tone: 'pending' as const };
    case 'running':
      return gatewayReady
        ? { busy: false, canStart: false, canStop: true, label: '服务运行中', tone: 'success' as const }
        : { busy: false, canStart: false, canStop: true, label: '运行中，尚未就绪', tone: 'pending' as const };
    case 'stopping':
      return { busy: true, canStart: false, canStop: false, label: '服务停止中', tone: 'pending' as const };
    case 'failed':
      return { busy: false, canStart: true, canStop: false, label: error ? '启动失败' : '服务异常', tone: 'error' as const };
    case 'stopped':
      return { busy: false, canStart: true, canStop: false, label: '服务已停止', tone: 'muted' as const };
  }
}
