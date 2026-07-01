import type Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS_TABLE = '__openclaw_migrations';
const CREATE_TABLE_PATTERN = /CREATE\s+TABLE\s+`?([A-Za-z0-9_]+)`?/gi;

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
  const existingTables = getExistingTables(db);

  for (const migration of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    if (applied.has(migration)) {
      continue;
    }

    const sql = readFileSync(resolve(migrationsDir, migration), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .join(';\n');
    const markerTables = createdTables(sql);

    if (markerTables.length > 0 && markerTables.every((tableName) => existingTables.has(tableName))) {
      db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`).run(migration, Date.now());
      applied.add(migration);
      continue;
    }

    db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`).run(migration, Date.now());
    })();
    for (const tableName of markerTables) {
      existingTables.add(tableName);
    }
  }
}

function getExistingTables(db: Database.Database) {
  return new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String((row as SqliteNameRow).name))
  );
}

function createdTables(sql: string) {
  return [...sql.matchAll(CREATE_TABLE_PATTERN)].map((match) => match[1]);
}
