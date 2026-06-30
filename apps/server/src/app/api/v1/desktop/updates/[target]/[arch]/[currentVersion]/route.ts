import { NextResponse } from 'next/server';
import { DEFAULT_UPDATE_CHANNEL } from '@/lib/env';
import { listDesktopUpdateCandidates } from '@/lib/release-repository';
import { selectDesktopUpdate } from '@/lib/update-selection';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    target: string;
    arch: string;
    currentVersion: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { target, arch, currentVersion } = await context.params;
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel') || DEFAULT_UPDATE_CHANNEL;

  const candidates = await listDesktopUpdateCandidates({ target, arch, channel });
  const update = selectDesktopUpdate(candidates, {
    currentVersion,
    target,
    arch,
    channel
  });

  if (!update) {
    return new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store'
      }
    });
  }

  return NextResponse.json(update, {
    headers: {
      'cache-control': 'no-store'
    }
  });
}
