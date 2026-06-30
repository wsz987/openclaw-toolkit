import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const desktopReleases = sqliteTable('desktop_releases', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  version: text('version').notNull(),
  channel: text('channel').notNull().default('stable'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  pubDate: integer('pub_date', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
  versionChannelIndex: uniqueIndex('desktop_releases_version_channel_idx').on(table.version, table.channel)
}));

export const desktopReleaseAssets = sqliteTable('desktop_release_assets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  releaseId: text('release_id').notNull().references(() => desktopReleases.id, { onDelete: 'cascade' }),
  target: text('target').notNull(),
  arch: text('arch').notNull(),
  url: text('url').notNull(),
  signature: text('signature').notNull(),
  sha256: text('sha256'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
  releaseTargetArchIndex: uniqueIndex('desktop_release_assets_release_target_arch_idx').on(
    table.releaseId,
    table.target,
    table.arch
  )
}));

export const updateServerSettings = sqliteTable('update_server_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});
