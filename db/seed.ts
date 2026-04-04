import 'dotenv/config';
import { createUser } from '../src/lib/auth.js';

const email = process.argv[2] ?? 'admin@grandegordo.com';
const password = process.argv[3] ?? 'changeme123';
const name = process.argv[4] ?? 'Admin';

async function main() {
  console.log(`Creating admin user: ${email}`);
  const user = await createUser(email, password, 'admin', name);
  console.log(`Admin created: ${user!.id} (${user!.email})`);
  console.log('⚠️  Change the default password immediately!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
