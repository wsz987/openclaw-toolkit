import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';
import { runSqliteMigrations } from './migrations';

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let cachedClient: Database.Database | null = null;

export function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  const databasePath = resolve(process.cwd(), process.env.SQLITE_DB_PATH ?? './data/server.sqlite');
  mkdirSync(dirname(databasePath), { recursive: true });

  const client = new Database(databasePath);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  runSqliteMigrations(client);
  cachedClient = client;
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}

export function resetDbForTests() {
  cachedClient?.close();
  cachedClient = null;
  cachedDb = null;
}
