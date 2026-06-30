import { mkdtempSync, rmSync } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;

async function loadRepository() {
  const dbClient = await import('../db/client');
  dbClient.resetDbForTests();
  return import('./license-repository');
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'openclaw-server-license-'));
  process.env.SQLITE_DB_PATH = join(tempDir, 'license.sqlite');
  migrateAll(process.env.SQLITE_DB_PATH);
});

afterEach(async () => {
  const dbClient = await import('../db/client');
  dbClient.resetDbForTests();
  delete process.env.SQLITE_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('license-repository', () => {
  it('issues and validates an online license key grouped by company', async () => {
    const { issueLicenseKey, validateLicenseKey } = await loadRepository();
    const issued = await issueLicenseKey({
      companyName: 'Example Co',
      tier: 'stage-1',
      features: ['offline-install', 'managed-node-runtime'],
      maxActivations: null,
      issueOfflineLicense: false
    });

    const result = await validateLicenseKey({
      activationCode: issued.activationCode,
      machineId: 'machine-a',
      appVersion: '0.1.2'
    });

    expect(result).toMatchObject({
      valid: true,
      code: 'OK',
      message: '激活成功',
      license: {
        companyName: 'Example Co',
        expiresAt: null,
        maxActivations: null,
        activationCount: 1
      }
    });
  });

  it('does not count the same machine twice when an activation limit exists', async () => {
    const { issueLicenseKey, validateLicenseKey } = await loadRepository();
    const issued = await issueLicenseKey({
      companyName: 'Limited Co',
      tier: 'stage-1',
      features: ['offline-install'],
      maxActivations: 1,
      issueOfflineLicense: false
    });

    const first = await validateLicenseKey({ activationCode: issued.activationCode, machineId: 'machine-a' });
    const repeat = await validateLicenseKey({ activationCode: issued.activationCode, machineId: 'machine-a' });
    const otherMachine = await validateLicenseKey({ activationCode: issued.activationCode, machineId: 'machine-b' });

    expect(first.valid).toBe(true);
    expect(repeat.valid).toBe(true);
    expect(repeat.license?.activationCount).toBe(1);
    expect(otherMachine).toMatchObject({
      valid: false,
      code: 'ACTIVATION_LIMIT_REACHED',
      message: '激活数量已达上限'
    });
  });

  it('auto-applies license migrations when an existing update database has no license tables', async () => {
    const dbPath = process.env.SQLITE_DB_PATH;
    if (!dbPath) {
      throw new Error('SQLITE_DB_PATH is not set');
    }
    rmSync(dbPath, { force: true });
    migrateOne(dbPath, '0000_long_gorilla_man.sql');

    const { issueLicenseKey, validateLicenseKey } = await loadRepository();
    const issued = await issueLicenseKey({
      companyName: 'Migrated Co',
      tier: 'stage-1',
      features: ['offline-install'],
      maxActivations: null,
      issueOfflineLicense: false
    });
    const result = await validateLicenseKey({ activationCode: issued.activationCode, machineId: 'machine-a' });

    expect(result.valid).toBe(true);
    expect(result.license?.companyName).toBe('Migrated Co');
  });
});

function migrateAll(dbPath: string) {
  const db = new Database(dbPath);
  for (const migration of readdirSync(join(process.cwd(), 'drizzle')).filter((name) => name.endsWith('.sql')).sort()) {
    execMigration(db, migration);
  }
  db.close();
}

function migrateOne(dbPath: string, migration: string) {
  const db = new Database(dbPath);
  execMigration(db, migration);
  db.close();
}

function execMigration(db: Database.Database, migration: string) {
  const sql = readFileSync(join(process.cwd(), 'drizzle', migration), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .join(';\n');
  db.exec(sql);
}
