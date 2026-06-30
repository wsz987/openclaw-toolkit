import { createCompanySchema } from '@/lib/license-input';
import { createCompany, listCompaniesWithLicenseCounts } from '@/lib/license-repository';
import { apiError, apiSuccess } from '@/lib/api-response';
import { assertAdminRequest } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = assertAdminRequest(request);
  if (authError) {
    return authError;
  }

  return apiSuccess({ companies: await listCompaniesWithLicenseCounts() });
}

export async function POST(request: Request) {
  const authError = assertAdminRequest(request);
  if (authError) {
    return authError;
  }

  const parsed = createCompanySchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError('INVALID_INPUT', '公司信息格式无效', 400, parsed.error.flatten());
  }

  try {
    const company = await createCompany(parsed.data);
    return apiSuccess({ company }, '公司已创建', { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '公司创建失败';
    return apiError('CREATE_COMPANY_FAILED', message, 400);
  }
}
