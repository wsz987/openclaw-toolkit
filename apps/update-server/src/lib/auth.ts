import { getAdminToken } from './env';

export function assertAdminRequest(request: Request) {
  const expectedToken = getAdminToken();
  if (!expectedToken) {
    return new Response('UPDATE_ADMIN_TOKEN is not configured.', { status: 503 });
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization !== `Bearer ${expectedToken}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  return null;
}
