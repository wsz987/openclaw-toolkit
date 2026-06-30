import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { setReleaseEnabledAction } from './actions';
import type { listRecentDesktopReleases } from '@/lib/release-repository';

type ReleaseRows = Awaited<ReturnType<typeof listRecentDesktopReleases>>;

export function ReleaseTable({ rows }: { rows: ReleaseRows }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">最近发布</h2>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent>
          <div className="py-4 text-sm text-neutral-500">暂无版本。上传一个更新包后会显示在这里。</div>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3">版本</th>
                <th className="px-5 py-3">通道</th>
                <th className="px-5 py-3">平台</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">发布时间</th>
                <th className="px-5 py-3">下载地址</th>
                <th className="px-5 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <tr key={`${row.id}-${row.target ?? 'none'}-${row.arch ?? 'none'}`}>
                  <td className="px-5 py-3 font-medium text-neutral-900">{row.version}</td>
                  <td className="px-5 py-3 text-neutral-600">{row.channel}</td>
                  <td className="px-5 py-3 text-neutral-600">{row.target && row.arch ? `${row.target}/${row.arch}` : '-'}</td>
                  <td className="px-5 py-3 text-neutral-600">{row.enabled && row.assetEnabled ? '启用' : '停用'}</td>
                  <td className="px-5 py-3 text-neutral-600">{row.pubDate.toISOString()}</td>
                  <td className="max-w-md truncate px-5 py-3 text-neutral-600">{row.url ?? '-'}</td>
                  <td className="px-5 py-3">
                    <form action={setReleaseEnabledAction}>
                      <input type="hidden" name="releaseId" value={row.id} />
                      <input type="hidden" name="enabled" value={row.enabled ? 'false' : 'true'} />
                      <Button type="submit" variant="outline">
                        {row.enabled ? '停用' : '启用'}
                      </Button>
                    </form>
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
