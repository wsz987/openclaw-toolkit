export const DEFAULT_UPDATE_CHANNEL = process.env.OPENCLAW_UPDATE_CHANNEL ?? 'stable';
export const DEFAULT_PUBLIC_BASE_URL =
  process.env.PUBLIC_SERVER_BASE_URL ?? process.env.PUBLIC_UPDATE_BASE_URL ?? 'https://YOUR-UPDATE-SERVER.invalid';
export const RELEASE_STORAGE_DIR = process.env.RELEASE_STORAGE_DIR ?? './storage/releases';

export function getAdminToken() {
  return process.env.SERVER_ADMIN_TOKEN ?? process.env.UPDATE_ADMIN_TOKEN ?? '';
}
