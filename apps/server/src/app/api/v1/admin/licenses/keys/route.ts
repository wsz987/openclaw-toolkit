import { createLicenseKeySchema } from '@/lib/license-input';
import { issueLicenseKey, listLicenseKeys } from '@/lib/license-repository';
import { apiError, apiSuccess } from '@/lib/api-response';
import { assertAdminRequest } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = assertAdminRequest(request);
  if (authError) {
    return authError;
  }

  return apiSuccess({ licenseKeys: await listLicenseKeys() });
}

export async function POST(request: Request) {
  const authError = assertAdminRequest(request);
  if (authError) {
    return authError;
  }

  const parsed = createLicenseKeySchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError('INVALID_INPUT', '密钥签发参数无效', 400, parsed.error.flatten());
  }

  try {
    const issued = await issueLicenseKey(parsed.data);
    return apiSuccess({
      company: {
        id: issued.company.id,
        name: issued.company.name
      },
      licenseKey: {
        id: issued.licenseKey.id,
        licenseId: issued.licenseKey.licenseId,
        tier: issued.licenseKey.tier,
        features: JSON.parse(issued.licenseKey.featuresJson) as string[],
        expiresAt: issued.licenseKey.expiresAt?.toISOString() ?? null,
        maxActivations: issued.licenseKey.maxActivations,
        activationCode: issued.activationCode,
        activationCodePreview: issued.licenseKey.activationCodePreview,
        offlineLicense: issued.offlineLicense
      }
    }, '密钥已签发', { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '密钥签发失败';
    return apiError('ISSUE_LICENSE_FAILED', message, 400);
  }
}
