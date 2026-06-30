import { NextResponse } from 'next/server';
import { extname } from 'node:path';
import { readStoredReleaseAsset } from '@/lib/upload-storage';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

const contentTypes: Record<string, string> = {
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.msi': 'application/octet-stream',
  '.exe': 'application/octet-stream'
};

export async function GET(_request: Request, context: RouteContext) {
  const { path } = await context.params;
  const relativePath = path.join('/');

  try {
    const file = await readStoredReleaseAsset(relativePath);
    const extension = extname(relativePath).toLowerCase();
    return new Response(file, {
      headers: {
        'content-type': contentTypes[extension] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}
