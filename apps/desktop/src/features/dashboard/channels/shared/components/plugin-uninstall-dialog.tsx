import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import type { PluginInstallProgress } from '@/openclaw/model/types';

export type PluginUninstallDialogState = 'confirm' | 'loading' | 'error' | 'success';

type PluginUninstallDialogProps = {
  open: boolean;
  state: PluginUninstallDialogState;
  progress: PluginInstallProgress | null;
  error: string | null;
  pluginName: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function PluginUninstallDialog({
  open,
  state,
  progress,
  error,
  pluginName,
  onConfirm,
  onClose
}: PluginUninstallDialogProps) {
  const busy = state === 'loading';
  const progressValue = progress?.progress ?? (busy ? 16 : 0);
  const message =
    error ??
    progress?.message ??
    (state === 'success' ? '已安全卸载' : state === 'confirm' ? '移除插件与配置' : '处理中...');

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !busy && !nextOpen && onClose()}>
      <AlertDialogContent className="w-[min(92vw,28rem)] gap-5 rounded-2xl border border-[hsl(var(--hairline))] p-6 shadow-xl backdrop-blur-md">
        {state === 'confirm' && (
          <>
            <AlertDialogHeader className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100 dark:border-red-900/50">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <AlertDialogTitle className="text-base font-semibold text-[hsl(var(--ink))]">
                    确认卸载 {pluginName}？
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-[hsl(var(--muted))] mt-0.5">
                    此操作为敏感操作，请评估以下潜在影响。
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="flex flex-col gap-3 text-[11px] leading-relaxed">
              <div className="font-semibold text-[hsl(var(--body-strong))] text-xs pb-1.5 border-b border-[hsl(var(--hairline-soft))]">
                卸载该通道插件将产生以下影响：
              </div>
              <ul className="flex flex-col gap-2.5 text-[hsl(var(--body))] mt-1">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500 font-bold select-none">•</span>
                  <div>
                    <strong className="text-[hsl(var(--body-strong))]">清除通道配置</strong>
                    <p className="text-[10.5px] text-[hsl(var(--muted))] mt-0.5">
                      对应的配置凭证（如 App ID, Secret 等）将被清空且不可恢复。
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500 font-bold select-none">•</span>
                  <div>
                    <strong className="text-[hsl(var(--body-strong))]">关闭通道服务</strong>
                    <p className="text-[10.5px] text-[hsl(var(--muted))] mt-0.5">
                      将断开所有后台网关连接，智能体将无法再响应该通道消息。
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500 font-bold select-none">•</span>
                  <div>
                    <strong className="text-[hsl(var(--body-strong))]">卸载依赖插件包</strong>
                    <p className="text-[10.5px] text-[hsl(var(--muted))] mt-0.5">
                      从本地系统目录移除插件物理依赖，释放相应的运行内存。
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="h-9 text-xs rounded-lg px-4 border-[hsl(var(--hairline))] mr-2">
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
                className="h-9 text-xs rounded-lg px-4 bg-[hsl(var(--error))] text-white hover:bg-[hsl(var(--error)/0.9)] border-0"
              >
                确认卸载
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {state === 'loading' && (
          <>
            <AlertDialogHeader className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div>
                  <AlertDialogTitle className="text-base font-semibold text-[hsl(var(--ink))]">
                    正在卸载插件
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-[hsl(var(--muted))] mt-0.5">
                    正在执行清理链，请保持应用开启。
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[hsl(var(--body-strong))] flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
                  {progress?.stage === 'checking' ? '正在准备清理' : '正在卸载文件包'}
                </span>
                <span className="font-mono text-[hsl(var(--muted))] font-medium">{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-2" />
              <div className="max-h-[6rem] overflow-y-auto rounded-lg  font-mono text-[10.5px] leading-relaxed text-[hsl(var(--body))] break-all whitespace-pre-wrap">
                {message}
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled className="h-9 text-xs rounded-lg px-4">
                正在处理...
              </AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}

        {state === 'success' && (
          <>
            <AlertDialogHeader className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 animate-in fade-in zoom-in duration-300">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <div>
                  <AlertDialogTitle className="text-base font-semibold text-[hsl(var(--ink))]">
                    卸载成功
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-[hsl(var(--muted))] mt-0.5">
                    {pluginName} 已安全从系统移除。
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="flex flex-col gap-2.5 text-[11px] leading-relaxed">
              <div className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs pb-1.5 border-b border-emerald-100/20">
                系统清理结果明细：
              </div>
              <ul className="flex flex-col gap-2.5 text-[hsl(var(--body))] mt-1">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold select-none font-mono">✓</span>
                  <span>通道本地连接密钥与 App 证书已彻底注销清除</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold select-none font-mono">✓</span>
                  <span>后台消息网关已解除适配器绑定，服务已停止</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold select-none font-mono">✓</span>
                  <span>系统依赖管理器已成功卸载对应的 npm 物理组件包</span>
                </li>
              </ul>
            </div>

            <AlertDialogFooter>
              <AlertDialogAction onClick={onClose} className="h-9 text-xs rounded-lg px-4 bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary-active))] border-0">
                完成
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {state === 'error' && (
          <>
            <AlertDialogHeader className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100 dark:border-red-900/50">
                  <XCircle className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <AlertDialogTitle className="text-base font-semibold text-[hsl(var(--ink))]">
                    卸载未完成
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-[hsl(var(--muted))] mt-0.5">
                    在执行卸载清理指令时遭遇阻碍。
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="flex flex-col gap-2.5 text-[11px] leading-relaxed">
              <div className="font-semibold text-red-600 dark:text-red-400 text-xs pb-1.5 border-b border-red-100/20">
                阻碍报错详情：
              </div>
              <div className="rounded-lg border border-red-100 dark:border-red-950/20 bg-[hsl(var(--surface-soft))] p-3 font-mono text-[10.5px] leading-relaxed text-red-700 dark:text-red-400 break-all whitespace-pre-wrap">
                {error || '网络超时或进程资源被占用，请检查控制台输出并重试。'}
              </div>
            </div>

            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel onClick={onClose} className="h-9 text-xs rounded-lg px-4 border-[hsl(var(--hairline))]">
                关闭
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
                className="h-9 text-xs rounded-lg px-4 bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary-active))] flex items-center gap-1.5 border-0"
              >
                <RefreshCw className="h-3 w-3" />
                重新尝试
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
