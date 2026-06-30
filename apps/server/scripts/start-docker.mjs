import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const sqlitePath = resolve(process.env.SQLITE_DB_PATH ?? '/data/server.sqlite');
const releaseStorageDir = resolve(process.env.RELEASE_STORAGE_DIR ?? '/data/releases');

mkdirSync(dirname(sqlitePath), { recursive: true });
mkdirSync(releaseStorageDir, { recursive: true });

const db = new Database(sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec('CREATE TABLE IF NOT EXISTS __openclaw_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');

const migrationsDir = resolve('apps/server/drizzle');
if (existsSync(migrationsDir)) {
  const applied = new Set(
    db.prepare('SELECT name FROM __openclaw_migrations').all().map((row) => String(row.name))
  );
  const existingMigrationMarkers = {
    '0000_long_gorilla_man.sql': ['desktop_releases', 'desktop_release_assets', 'update_server_settings'],
    '0001_license_management.sql': ['companies', 'license_keys', 'license_activation_events']
  };
  const existingTables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name))
  );
  for (const [migration, markerTables] of Object.entries(existingMigrationMarkers)) {
    if (!applied.has(migration) && markerTables.every((tableName) => existingTables.has(tableName))) {
      db.prepare('INSERT INTO __openclaw_migrations (name, applied_at) VALUES (?, ?)').run(migration, Date.now());
      applied.add(migration);
    }
  }

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
      db.prepare('INSERT INTO __openclaw_migrations (name, applied_at) VALUES (?, ?)').run(migration, Date.now());
    })();
  }
}
db.close();

const server = spawnSync('node', ['apps/server/.next/standalone/apps/server/server.js'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0',
    PORT: process.env.PORT ?? '31421',
    SQLITE_DB_PATH: sqlitePath,
    RELEASE_STORAGE_DIR: releaseStorageDir
  }
});

process.exit(server.status ?? 1);
