import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createDesktopReleaseAction, saveUpdateServerConfigAction } from './actions';

export function UpdateServerConfigForm({ publicBaseUrl }: { publicBaseUrl: string }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">服务配置</h2>
      </CardHeader>
      <CardContent>
        <form action={saveUpdateServerConfigAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-600">公开访问地址</span>
            <Input name="publicBaseUrl" defaultValue={publicBaseUrl} placeholder="https://YOUR-UPDATE-SERVER.invalid" />
          </label>
          <Button type="submit" className="self-end">保存配置</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function DesktopReleaseForm({ publicBaseUrl }: { publicBaseUrl: string }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">上传可更新版本</h2>
      </CardHeader>
      <CardContent>
        <form action={createDesktopReleaseAction} className="grid gap-4">
          <input type="hidden" name="publicBaseUrl" value={publicBaseUrl} />
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="版本号">
              <Input name="version" placeholder="0.1.1" required />
            </Field>
            <Field label="通道">
              <Input name="channel" defaultValue="stable" required />
            </Field>
            <Field label="平台 target">
              <Input name="target" defaultValue="windows" required />
            </Field>
            <Field label="架构 arch">
              <Input name="arch" defaultValue="x86_64" required />
            </Field>
          </div>

          <div className="grid gap-3">
            <Field label="更新包">
              <Input name="assetFile" type="file" accept=".zip,.gz,.msi,.exe" required />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="签名文件">
              <Input name="signatureFile" type="file" accept=".sig,.txt" />
            </Field>
            <Field label="签名文本">
              <Input name="signatureText" placeholder="Tauri updater 更新包签名，不是 Windows 代码签名" />
            </Field>
          </div>

          <Field label="发布说明">
            <Textarea name="notes" placeholder="修复内容、升级说明、注意事项" />
          </Field>

          <div className="flex flex-wrap gap-4 text-sm text-neutral-700">
            <label className="inline-flex items-center gap-2">
              <input name="enabled" type="checkbox" className="size-4 rounded border-neutral-300" />
              创建后启用版本
            </label>
            <label className="inline-flex items-center gap-2">
              <input name="assetEnabled" type="checkbox" defaultChecked className="size-4 rounded border-neutral-300" />
              启用该平台资产
            </label>
          </div>

          <div>
            <Button type="submit">上传并创建版本</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
