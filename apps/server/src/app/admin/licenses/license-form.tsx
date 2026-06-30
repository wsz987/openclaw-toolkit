import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_LICENSE_FEATURES } from '@/lib/license-input';
import { issueLicenseKeyAction } from './actions';
import type { listCompaniesWithLicenseCounts } from '@/lib/license-repository';

type CompanyRows = Awaited<ReturnType<typeof listCompaniesWithLicenseCounts>>;

export function LicenseIssueForm({ companies }: { companies: CompanyRows }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">签发联网激活码</h2>
      </CardHeader>
      <CardContent>
        <form action={issueLicenseKeyAction} className="grid gap-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_0.8fr]">
            <Field label="已有公司">
              <select
                name="companyId"
                className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-400"
                defaultValue=""
              >
                <option value="">新建或按公司名签发</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </Field>
            <Field label="公司名">
              <Input name="companyName" placeholder="例如：杭州某某科技有限公司" />
            </Field>
            <Field label="授权等级">
              <Input name="tier" defaultValue="stage-1" />
            </Field>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Field label="过期日期">
              <Input name="expiresAt" type="date" title="留空表示长期有效，不做过期限制" />
            </Field>
            <Field label="激活数量上限">
              <Input name="maxActivations" type="number" min={1} placeholder="留空表示不限制" />
            </Field>
            <Field label="指定激活码">
              <Input name="activationCode" placeholder="留空自动生成" />
            </Field>
          </div>

          <Field label="功能能力">
            <Textarea
              name="features"
              defaultValue={DEFAULT_LICENSE_FEATURES.join('\n')}
              className="min-h-36 font-mono"
            />
          </Field>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="签发人">
              <Input name="issuedBy" placeholder="管理员或系统账号" />
            </Field>
            <Field label="备注">
              <Input name="note" placeholder="合同、交付批次或内部说明" />
            </Field>
          </div>

          <details className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <summary className="cursor-pointer text-sm font-medium text-neutral-800">离线兜底授权</summary>
            <div className="mt-4 grid gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                <input name="issueOfflineLicense" type="checkbox" className="size-4 rounded border-neutral-300" />
                同时生成离线 license.dat
              </label>
              <Field label="Ed25519 签名私钥 PEM">
                <Textarea
                  name="offlineSigningPrivateKeyPem"
                  placeholder="仅用于本次签名，不会写入数据库"
                  className="min-h-32 font-mono"
                />
              </Field>
            </div>
          </details>

          <div>
            <Button type="submit">生成密钥</Button>
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
