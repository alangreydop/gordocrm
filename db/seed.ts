import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

const DEFAULT_DATABASE_NAME =
  process.env.CLOUDFLARE_DATABASE_NAME ?? 'gordocrm';
const DEFAULT_ADMIN_EMAIL = 'admin@grandegordo.com';
const DEFAULT_PASSWORD = 'changeme123';
const DEFAULT_NAME = 'Admin Grande&Gordo';
const TEST_CLIENT_EMAIL = 'test@tumarca.com';
const TEST_CLIENT_NAME = 'Cliente de Prueba';

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function flag(name: '--local' | '--remote', args: string[]): boolean {
  return args.includes(name);
}

function getLocalDatabasePath(): string {
  const directory = join(
    process.cwd(),
    '.wrangler',
     'state',
     'v3',
     'd1',
     'miniflare-D1DatabaseObject',
   );

  const candidates = readdirSync(directory).filter(
     (entry) => entry.endsWith('.sqlite') && entry !== 'metadata.sqlite',
   );

  if (candidates.length === 0) {
    throw new Error(
       'No local D1 database found. Run `npm run db:migrate` before seeding.',
     );
   }

  return join(directory, candidates[0]!);
}

function executeLocal(sql: string): void {
  const db = new DatabaseSync(getLocalDatabasePath());
  try {
    db.exec(sql);
   } finally {
    db.close();
   }
}

function executeRemote(databaseName: string, sql: string): void {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const commandArgs = [
     'wrangler',
     'd1',
     'execute',
    databaseName,
     '--remote',
     '--command',
    sql,
   ];

  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env: process.env,
   });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
   }
}

async function main() {
  const args = process.argv.slice(2);
  const useRemote = flag('--remote', args);
  const useLocal = flag('--local', args) || !useRemote;
  const positionalArgs = args.filter(
     (arg: string) => arg !== '--local' && arg !== '--remote',
   );

  const adminEmail = positionalArgs[0] ?? DEFAULT_ADMIN_EMAIL;
  const password = positionalArgs[1] ?? DEFAULT_PASSWORD;
  const adminName = positionalArgs[2] ?? DEFAULT_NAME;
  const databaseName = process.env.CLOUDFLARE_DATABASE_NAME ?? DEFAULT_DATABASE_NAME;
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  const clientPasswordHash = await bcrypt.hash(password, 12);
  const now = Date.now();

  const sql = `
INSERT INTO users (id, email, password_hash, role, name, company, created_at, updated_at)
VALUES (
    ${quote(adminId)},
    ${quote(adminEmail)},
    ${quote(passwordHash)},
    'admin',
    ${quote(adminName)},
   NULL,
    ${now},
    ${now}
),
(
    ${quote(clientId)},
    ${quote(TEST_CLIENT_EMAIL)},
    ${quote(clientPasswordHash)},
    'client',
    ${quote(TEST_CLIENT_NAME)},
    'Test Marca S.L.',
    ${now},
    ${now}
)
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  role = excluded.role,
  name = excluded.name,
  updated_at = excluded.updated_at;
`.trim();

  if (useLocal) {
    executeLocal(sql);
   } else {
    executeRemote(databaseName, sql);
   }

  const target = useLocal ? 'local' : 'remote';
  console.log(
     `Admin + test client seeded in ${target} D1 database "${databaseName}": ${adminEmail} / ${password}, ${TEST_CLIENT_EMAIL} / ${password}`,
   );
}

await main();
