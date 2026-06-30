import { validateLicenseKeySchema } from '@/lib/license-input';
import { validateLicenseKey } from '@/lib/license-repository';
import { apiError, apiSuccess } from '@/lib/api-response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const parsed = validateLicenseKeySchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError('INVALID_INPUT', '激活码校验参数无效', 400, parsed.error.flatten());
  }

  const result = await validateLicenseKey(parsed.data);
  if (!result.valid) {
    return apiError(result.code, result.message, 200, { license: result.license });
  }

  return apiSuccess({ license: result.license }, result.message);
}
