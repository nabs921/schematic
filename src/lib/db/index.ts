import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import net from 'net';
import dns from 'dns';

// Ensure IPv4 is prioritized in dual-stack environments without IPv6 routing.
if (net.setDefaultAutoSelectFamily) {
  net.setDefaultAutoSelectFamily(false);
}
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

let pool: Pool | null = null;
let migrationsPromise: Promise<void> | null = null;

function isLocalDatabase(connectionString: string): boolean {
  return /(?:^|@)(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(connectionString);
}

/**
 * Returns the shared PostgreSQL pool.
 *
 * Schematic talks to a regular PostgreSQL server. There is deliberately no
 * embedded/WASM fallback: the connection string must point at a real
 * PostgreSQL instance (the bundled docker compose setup starts one locally).
 */
export function getPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Add a PostgreSQL connection string to .env (for example postgresql://postgres:postgres@localhost:5432/schematic).'
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        isLocalDatabase(databaseUrl) || databaseUrl.includes('sslmode=disable')
          ? false
          : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }

  return pool;
}

export async function getDbClient() {
  const dbPool = getPool();

  return {
    type: 'postgres' as const,
    async query(sqlText: string, params?: unknown[]) {
      const res = await dbPool.query(sqlText, params);
      return { rows: res.rows, rowCount: res.rowCount ?? 0 };
    },
  };
}

export async function query<T = Record<string, unknown>>(
  sqlText: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  await ensureMigrated();
  const db = await getDbClient();
  return db.query(sqlText, params);
}

async function runMigrations() {
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const client = await getPool().connect();

  try {
    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      console.log(`Running migration: ${file}`);
      await client.query(sql);
      console.log(`✓ Completed migration: ${file}`);
    }
  } finally {
    client.release();
  }
}

export async function ensureMigrated() {
  if (!migrationsPromise) {
    migrationsPromise = runMigrations().catch((error) => {
      // Reset so a later call can retry after the database becomes available.
      migrationsPromise = null;
      console.error('Migration error:', error);
      throw error;
    });
  }

  await migrationsPromise;
}
