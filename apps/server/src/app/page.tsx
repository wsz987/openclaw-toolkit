import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">OpenClaw Toolkit</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Server 管理控制台</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
          管理桌面端动态更新与版本发布。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/updates"
          className="inline-flex w-fit items-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
        >
          进入版本管理
        </Link>
      </div>
    </main>
  );
}
