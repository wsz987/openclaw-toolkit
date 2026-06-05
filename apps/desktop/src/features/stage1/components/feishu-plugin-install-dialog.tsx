import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../../components/ui/alert-dialog';
import { FEISHU_PLUGIN_PACKAGE } from '../model/feishu-channel';

type FeishuPluginInstallDialogProps = {
  installDir: string;
  loading: boolean;
  open: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function FeishuPluginInstallDialog({
  installDir,
  loading,
  open,
  onConfirm,
  onOpenChange
}: FeishuPluginInstallDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>需要先安装飞书插件</AlertDialogTitle>
          <AlertDialogDescription>
            当前准备启用飞书聊天渠道，但还没有检测到 `{FEISHU_PLUGIN_PACKAGE}` 的安装记录。是否现在使用项目内置压缩包安装，并通过国内 npm 镜像补齐依赖？
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))/0.45] p-4 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
          <div>安装目标：Feishu / Lark 聊天渠道插件</div>
          <div>安装方式：离线 tgz 压缩包 + `npmmirror` 依赖补齐</div>
          <div>安装位置：{installDir}\\package</div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {loading ? '正在安装...' : '安装插件并继续'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
