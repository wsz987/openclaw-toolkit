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
import type { Stage1Dashboard } from '../model/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  confirmationDescription: string;
  systemOpenclaw: Stage1Dashboard['systemOpenclaw'];
  confirmationTargetVersion: string;
  installPlan: Stage1Dashboard['installPlan'];
  installActionLabel: string;
  onConfirm: () => void;
};

export function ConfirmInstallDialog({
  open,
  onOpenChange,
  loading,
  confirmationDescription,
  systemOpenclaw,
  confirmationTargetVersion,
  installPlan,
  installActionLabel,
  onConfirm
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>检测到系统 OpenClaw</AlertDialogTitle>
          <AlertDialogDescription>{confirmationDescription}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="confirm-install-panel">
          <div className="confirm-install-panel__row">
            <span>系统路径</span>
            <code>{systemOpenclaw.executable ?? '未读取到'}</code>
          </div>
          <div className="confirm-install-panel__row">
            <span>系统版本</span>
            <code>{systemOpenclaw.version ?? `读取失败：${systemOpenclaw.error ?? '未知错误'}`}</code>
          </div>
          <div className="confirm-install-panel__row">
            <span>即将部署</span>
            <code>OpenClaw {confirmationTargetVersion}</code>
          </div>
          <div className="confirm-install-panel__row">
            <span>受管 Node</span>
            <code>{installPlan.targetNodeVersion ?? '待解析'}</code>
          </div>
          <div className="confirm-install-panel__row">
            <span>执行动作</span>
            <code>{installActionLabel}</code>
          </div>
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
            继续{installActionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
