import { getAdminToken } from './env';
import { apiError } from './api-response';

export function assertAdminRequest(request: Request) {
  const expectedToken = getAdminToken();
  if (!expectedToken) {
    return apiError('ADMIN_TOKEN_NOT_CONFIGURED', 'SERVER_ADMIN_TOKEN is not configured.', 503);
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization !== `Bearer ${expectedToken}`) {
    return apiError('UNAUTHORIZED', 'Unauthorized', 401);
  }

  return null;
}
