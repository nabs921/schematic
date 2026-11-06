import { ensureMigrated } from '../src/lib/db';

async function main() {
  console.log('Running database migrations...');
  try {
    await ensureMigrated();
    console.log('✓ Database migrations completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('✗ Migration failed:', err);
    process.exit(1);
  }
}

main();
