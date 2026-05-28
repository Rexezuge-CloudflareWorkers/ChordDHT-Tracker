#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'jsonc-parser';

interface WranglerConfig {
  secrets_store_secrets?: Array<{
    binding: string;
    store_id: string;
    secret_name: string;
  }>;
}

// Placeholder stored on first deploy — user must replace with real Ed25519 CA public key.
// Value is intentionally non-key-shaped so getCAPublicKey returns null until configured.
const PLACEHOLDER_VALUE = 'UNCONFIGURED';

function runWrangler(args: string[], input?: string): string {
  try {
    return execFileSync('pnpm', ['exec', 'wrangler', ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      input,
    });
  } catch (error: unknown) {
    const e = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    const stdout = e.stdout ? e.stdout.toString() : '';
    const stderr = e.stderr ? e.stderr.toString() : '';
    throw new Error(`Command failed: pnpm exec wrangler ${args.join(' ')}\n${stdout}${stderr || e.message || ''}`);
  }
}

function parseWranglerConfig(): WranglerConfig {
  const content = readFileSync(join(process.cwd(), 'wrangler.jsonc'), 'utf8');
  return parse(content) as WranglerConfig;
}

function secretExists(storeId: string, secretName: string): boolean {
  try {
    const output = runWrangler(['secrets-store', 'secret', 'list', storeId, '--remote']);
    return output.includes(secretName);
  } catch {
    return false;
  }
}

function createSecret(storeId: string, secretName: string, value: string): void {
  console.log(`Creating secret: ${secretName}`);
  runWrangler(
    ['secrets-store', 'secret', 'create', storeId, '--name', secretName, '--scopes', 'workers', '--remote'],
    value,
  );
}

function main(): void {
  console.log('Initializing Cloudflare Secrets Store secrets...');
  const config = parseWranglerConfig();

  for (const secret of config.secrets_store_secrets ?? []) {
    if (secretExists(secret.store_id, secret.secret_name)) {
      console.log(`Secret already exists: ${secret.secret_name}`);
    } else {
      createSecret(secret.store_id, secret.secret_name, PLACEHOLDER_VALUE);
      console.log(`Created placeholder secret: ${secret.secret_name}`);
      console.log(`  !! Update with real value: wrangler secrets-store secret create ${secret.store_id} --name ${secret.secret_name} --scopes workers --remote`);
    }
  }

  console.log('Secret initialization complete.');
}

main();
