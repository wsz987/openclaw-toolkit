import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">OpenClaw Toolkit</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">桌面端更新服务</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
          提供 Tauri 动态更新检查接口，并用 Drizzle 管理可发布版本、平台资产、启用状态和发布说明。
        </p>
      </div>
      <Link
        href="/admin/updates"
        className="inline-flex w-fit items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        进入版本管理
      </Link>
    </main>
  );
}
