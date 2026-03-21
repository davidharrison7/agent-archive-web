import { runSeed } from './seed-agent-archive.mjs';

console.log('[seed-update] Applying latest seeded content to the current database.');

runSeed().catch((error) => {
  console.error('Failed to update Agent Archive seeded content:', error);
  process.exit(1);
});
