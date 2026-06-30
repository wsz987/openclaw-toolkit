import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { desktopReleaseAssets, desktopReleases, updateServerSettings } from '@/db/schema';
import type { DesktopUpdateCandidate } from './update-selection';

export async function listDesktopUpdateCandidates(input: {
  target: string;
  arch: string;
  channel: string;
}): Promise<DesktopUpdateCandidate[]> {
  const rows = await getDb()
    .select({
      version: desktopReleases.version,
      enabled: desktopReleases.enabled,
      channel: desktopReleases.channel,
      notes: desktopReleases.notes,
      pubDate: desktopReleases.pubDate,
      assetTarget: desktopReleaseAssets.target,
      assetArch: desktopReleaseAssets.arch,
      assetEnabled: desktopReleaseAssets.enabled,
      assetUrl: desktopReleaseAssets.url,
      assetSignature: desktopReleaseAssets.signature
    })
    .from(desktopReleases)
    .innerJoin(desktopReleaseAssets, eq(desktopReleaseAssets.releaseId, desktopReleases.id))
    .where(and(
      eq(desktopReleases.channel, input.channel),
      eq(desktopReleaseAssets.target, input.target),
      eq(desktopReleaseAssets.arch, input.arch)
    ))
    .orderBy(desc(desktopReleases.pubDate));

  return rows.map((row) => ({
    version: row.version,
    enabled: row.enabled,
    channel: row.channel,
    notes: row.notes,
    pubDate: row.pubDate.toISOString(),
    asset: {
      target: row.assetTarget,
      arch: row.assetArch,
      enabled: row.assetEnabled,
      url: row.assetUrl,
      signature: row.assetSignature
    }
  }));
}

export async function listRecentDesktopReleases(limit = 20) {
  return getDb()
    .select({
      id: desktopReleases.id,
      version: desktopReleases.version,
      channel: desktopReleases.channel,
      enabled: desktopReleases.enabled,
      notes: desktopReleases.notes,
      pubDate: desktopReleases.pubDate,
      target: desktopReleaseAssets.target,
      arch: desktopReleaseAssets.arch,
      assetEnabled: desktopReleaseAssets.enabled,
      url: desktopReleaseAssets.url
    })
    .from(desktopReleases)
    .leftJoin(desktopReleaseAssets, eq(desktopReleaseAssets.releaseId, desktopReleases.id))
    .orderBy(desc(desktopReleases.pubDate))
    .limit(limit);
}

export async function createDesktopRelease(input: {
  version: string;
  channel: string;
  enabled: boolean;
  notes: string | null;
  pubDate: Date;
  asset: {
    target: string;
    arch: string;
    url: string;
    signature: string;
    sha256: string | null;
    enabled: boolean;
  };
}) {
  const releaseId = crypto.randomUUID();
  const assetId = crypto.randomUUID();

  getDb().transaction((tx) => {
    tx.insert(desktopReleases).values({
      id: releaseId,
      version: input.version,
      channel: input.channel,
      enabled: input.enabled,
      notes: input.notes,
      pubDate: input.pubDate
    }).run();

    tx.insert(desktopReleaseAssets).values({
      id: assetId,
      releaseId,
      target: input.asset.target,
      arch: input.asset.arch,
      url: input.asset.url,
      signature: input.asset.signature,
      sha256: input.asset.sha256,
      enabled: input.asset.enabled
    }).run();
  });

  return { releaseId, assetId };
}

export async function setReleaseEnabled(releaseId: string, enabled: boolean) {
  getDb()
    .update(desktopReleases)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(desktopReleases.id, releaseId))
    .run();
}

export async function getUpdateServerSetting(key: string) {
  const row = getDb()
    .select({ value: updateServerSettings.value })
    .from(updateServerSettings)
    .where(eq(updateServerSettings.key, key))
    .get();
  return row?.value ?? null;
}

export async function setUpdateServerSetting(key: string, value: string) {
  getDb()
    .insert(updateServerSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: updateServerSettings.key,
      set: { value, updatedAt: new Date() }
    })
    .run();
}
