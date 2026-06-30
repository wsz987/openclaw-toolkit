import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { desktopReleaseAssets, desktopReleases } from '@/db/schema';
import { assertAdminRequest } from '@/lib/auth';
import { createDesktopReleaseSchema } from '@/lib/release-input';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authError = assertAdminRequest(request);
  if (authError) {
    return authError;
  }

  const parsed = createDesktopReleaseSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const [release] = await getDb()
    .insert(desktopReleases)
    .values({
      version: input.version,
      channel: input.channel,
      enabled: input.enabled,
      notes: input.notes ?? null,
      pubDate: input.pubDate ? new Date(input.pubDate) : new Date()
    })
    .returning();

  await getDb().insert(desktopReleaseAssets).values(input.assets.map((asset) => ({
    releaseId: release.id,
    target: asset.target,
    arch: asset.arch,
    url: asset.url,
    signature: asset.signature,
    sha256: asset.sha256 ?? null,
    enabled: asset.enabled
  })));

  return NextResponse.json({ releaseId: release.id }, { status: 201 });
}
