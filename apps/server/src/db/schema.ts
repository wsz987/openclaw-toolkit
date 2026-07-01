import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const desktopReleases = sqliteTable('desktop_releases', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  version: text('version').notNull(),
  channel: text('channel').notNull().default('stable'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  pubDate: integer('pub_date', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => [
  uniqueIndex('desktop_releases_version_channel_idx').on(table.version, table.channel)
]);

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
}, (table) => [
  uniqueIndex('desktop_release_assets_release_target_arch_idx').on(
    table.releaseId,
    table.target,
    table.arch
  )
]);

export const updateServerSettings = sqliteTable('update_server_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => [
  uniqueIndex('companies_name_idx').on(table.name)
]);

export const licenseKeys = sqliteTable('license_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  activationCodeHash: text('activation_code_hash').notNull(),
  activationCodePreview: text('activation_code_preview').notNull(),
  licenseId: text('license_id').notNull(),
  tier: text('tier').notNull().default('basic'),
  featuresJson: text('features_json').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'),
  maxActivations: integer('max_activations'),
  activationCount: integer('activation_count').notNull().default(0),
  note: text('note'),
  issuedBy: text('issued_by'),
  issuedAt: integer('issued_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastValidatedAt: integer('last_validated_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => [
  uniqueIndex('license_keys_activation_code_hash_idx').on(table.activationCodeHash),
  uniqueIndex('license_keys_license_id_idx').on(table.licenseId),
  index('license_keys_company_id_idx').on(table.companyId),
  index('license_keys_status_idx').on(table.status)
]);

export const licenseActivationEvents = sqliteTable('license_activation_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  licenseKeyId: text('license_key_id').notNull().references(() => licenseKeys.id, { onDelete: 'cascade' }),
  machineIdHash: text('machine_id_hash'),
  appVersion: text('app_version'),
  result: text('result').notNull(),
  message: text('message').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => [
  index('license_activation_events_license_key_id_idx').on(table.licenseKeyId),
  index('license_activation_events_created_at_idx').on(table.createdAt)
]);
