import type Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS_TABLE = '__openclaw_migrations';
const EXISTING_TABLE_MARKERS: Record<string, string[]> = {
  '0000_long_gorilla_man.sql': ['desktop_releases', 'desktop_release_assets', 'update_server_settings'],
  '0001_license_management.sql': ['companies', 'license_keys', 'license_activation_events']
};

type SqliteNameRow = {
  name: string;
};

function resolveMigrationsDir() {
  const candidates = [
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'apps/server/drizzle')
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function runSqliteMigrations(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);

  const migrationsDir = resolveMigrationsDir();
  if (!migrationsDir) {
    return;
  }

  const applied = new Set(
    db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all().map((row) => String((row as SqliteNameRow).name))
  );
  markExistingMigrations(db, applied);

  for (const migration of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    if (applied.has(migration)) {
      continue;
    }

    const sql = readFileSync(resolve(migrationsDir, migration), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .join(';\n');

    db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`).run(migration, Date.now());
    })();
  }
}

function markExistingMigrations(db: Database.Database, applied: Set<string>) {
  const existingTables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String((row as SqliteNameRow).name))
  );

  for (const [migration, markerTables] of Object.entries(EXISTING_TABLE_MARKERS)) {
    if (applied.has(migration)) {
      continue;
    }
    if (!markerTables.every((tableName) => existingTables.has(tableName))) {
      continue;
    }

    db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`).run(migration, Date.now());
    applied.add(migration);
  }
}
