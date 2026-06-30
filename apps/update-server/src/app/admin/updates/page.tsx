import { DEFAULT_PUBLIC_BASE_URL } from '@/lib/env';
import { getUpdateServerSetting, listRecentDesktopReleases } from '@/lib/release-repository';
import { DesktopReleaseForm, UpdateServerConfigForm } from './release-form';
import { ReleaseTable } from './release-table';

export const dynamic = 'force-dynamic';

export default async function UpdatesAdminPage() {
  let rows: Awaited<ReturnType<typeof listRecentDesktopReleases>> = [];
  let publicBaseUrl = DEFAULT_PUBLIC_BASE_URL;
  let error: string | null = null;

  try {
    const configuredBaseUrl = await getUpdateServerSetting('publicBaseUrl');
    publicBaseUrl = configuredBaseUrl ?? DEFAULT_PUBLIC_BASE_URL;
    rows = await listRecentDesktopReleases();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Desktop Releases</p>
        <h1 className="text-3xl font-semibold tracking-tight">版本管理</h1>
        <p className="max-w-3xl text-sm leading-6 text-neutral-600">
          管理桌面端更新服务配置、上传 Tauri 更新包和 updater 校验签名、控制版本启用状态。
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <UpdateServerConfigForm publicBaseUrl={publicBaseUrl} />
      <DesktopReleaseForm publicBaseUrl={publicBaseUrl} />
      <ReleaseTable rows={rows} />
    </main>
  );
}
