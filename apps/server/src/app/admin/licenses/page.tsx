import Link from 'next/link';
import { listCompaniesWithLicenseCounts, listLicenseKeys } from '@/lib/license-repository';
import { LicenseIssueForm } from './license-form';
import { CompanyTable, LicenseKeyTable } from './license-table';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{
    issuedCode?: string;
    licenseId?: string;
    company?: string;
    offlinePath?: string;
  }>;
};

export default async function LicensesAdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let companies: Awaited<ReturnType<typeof listCompaniesWithLicenseCounts>> = [];
  let licenseKeys: Awaited<ReturnType<typeof listLicenseKeys>> = [];
  let error: string | null = null;

  try {
    companies = await listCompaniesWithLicenseCounts();
    licenseKeys = await listLicenseKeys();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3">
        <Link href="/" className="text-sm font-medium text-neutral-500 hover:text-neutral-900">返回控制台</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Licenses</p>
          <h1 className="text-3xl font-semibold tracking-tight">激活码管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            按公司分组签发联网激活码，默认不限制激活数量；离线 license.dat 作为断网兜底材料保留。
          </p>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {params.issuedCode ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">密钥已生成：{params.issuedCode}</div>
          <div className="mt-1 text-emerald-800">
            公司：{params.company ?? '-'}；License ID：{params.licenseId ?? '-'}
            {params.offlinePath ? `；离线兜底文件：${params.offlinePath}` : ''}
          </div>
        </div>
      ) : null}

      <LicenseIssueForm companies={companies} />
      <LicenseKeyTable rows={licenseKeys} />
      <CompanyTable rows={companies} />
    </main>
  );
}
