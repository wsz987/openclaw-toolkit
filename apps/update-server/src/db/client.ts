import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  const databasePath = resolve(process.cwd(), process.env.SQLITE_DB_PATH ?? './data/update-server.sqlite');
  mkdirSync(dirname(databasePath), { recursive: true });

  const client = new Database(databasePath);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}
