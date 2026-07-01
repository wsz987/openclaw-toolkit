import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { setLicenseKeyStatusAction } from './actions';
import type { listCompaniesWithLicenseCounts, listLicenseKeys } from '@/lib/license-repository';

type CompanyRows = Awaited<ReturnType<typeof listCompaniesWithLicenseCounts>>;
type LicenseRows = Awaited<ReturnType<typeof listLicenseKeys>>;

export function CompanyTable({ rows }: { rows: CompanyRows }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">公司分组</h2>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent>
          <div className="py-4 text-sm text-neutral-500">暂无公司。签发第一个密钥时会自动按公司名创建分组。</div>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3">公司</th>
                <th className="px-5 py-3">联系人</th>
                <th className="px-5 py-3">密钥</th>
                <th className="px-5 py-3">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3 font-medium text-neutral-900">{row.name}</td>
                  <td className="px-5 py-3 text-neutral-600">{row.contactName ?? row.contactEmail ?? '-'}</td>
                  <td className="px-5 py-3 text-neutral-600">{row.activeLicenseCount} / {row.licenseCount}</td>
                  <td className="px-5 py-3 text-neutral-600">{row.createdAt.toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function LicenseKeyTable({ rows }: { rows: LicenseRows }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">密钥管理</h2>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent>
          <div className="py-4 text-sm text-neutral-500">暂无密钥。</div>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3">公司</th>
                <th className="px-5 py-3">激活码</th>
                <th className="px-5 py-3">等级</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">激活数</th>
                <th className="px-5 py-3">过期</th>
                <th className="px-5 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-neutral-900">{row.companyName}</div>
                    <div className="mt-1 text-xs text-neutral-500">{row.licenseId}</div>
                  </td>
                  <td className="px-5 py-3 font-mono text-neutral-700">{row.activationCodePreview}</td>
                  <td className="px-5 py-3 text-neutral-600">{row.tier}</td>
                  <td className="px-5 py-3 text-neutral-600">{statusLabel(row.status)}</td>
                  <td className="px-5 py-3 text-neutral-600">
                    {row.activationCount} / {row.maxActivations ?? '不限'}
                  </td>
                  <td className="px-5 py-3 text-neutral-600">{row.expiresAt ?? '长期'}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusButton id={row.id} status={row.status === 'active' ? 'disabled' : 'active'}>
                        {row.status === 'active' ? '停用' : '启用'}
                      </StatusButton>
                      {row.status !== 'revoked' ? (
                        <StatusButton id={row.id} status="revoked" variant="outline">撤销</StatusButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function StatusButton({
  id,
  status,
  children,
  variant = 'secondary'
}: {
  id: string;
  status: string;
  children: React.ReactNode;
  variant?: 'secondary' | 'outline';
}) {
  return (
    <form action={setLicenseKeyStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant}>{children}</Button>
    </form>
  );
}

function statusLabel(status: string) {
  if (status === 'active') {
    return '启用';
  }
  if (status === 'disabled') {
    return '停用';
  }
  if (status === 'revoked') {
    return '已撤销';
  }
  return status;
}
