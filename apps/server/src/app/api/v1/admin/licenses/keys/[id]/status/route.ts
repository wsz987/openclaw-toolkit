import { z } from 'zod';
import { setLicenseKeyStatus } from '@/lib/license-repository';
import { apiError, apiSuccess } from '@/lib/api-response';
import { assertAdminRequest } from '@/lib/auth';

export const runtime = 'nodejs';

const statusSchema = z.object({
  status: z.enum(['active', 'disabled', 'revoked'])
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authError = assertAdminRequest(request);
  if (authError) {
    return authError;
  }

  const parsed = statusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError('INVALID_INPUT', '密钥状态参数无效', 400, parsed.error.flatten());
  }

  const { id } = await context.params;
  await setLicenseKeyStatus(id, parsed.data.status);
  return apiSuccess({ id, status: parsed.data.status }, '密钥状态已更新');
}
