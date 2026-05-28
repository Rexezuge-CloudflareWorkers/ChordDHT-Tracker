#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { applyEdits, modify, parse } from 'jsonc-parser';

const CONFIG_PATH = join(process.cwd(), 'wrangler.jsonc');
const TEMPLATE_PATH = join(process.cwd(), 'apps/api/wrangler.template.jsonc');
const DEFAULT_UUID = '00000000-0000-0000-0000-000000000000';

interface WranglerConfig {
  d1_databases?: Array<{
    binding?: string;
    database_id?: string;
    database_name?: string;
  }>;
}

interface D1DatabaseRecord {
  name?: string;
  uuid?: string;
  database_id?: string;
  id?: string;
}

function runWrangler(args: string[]): string {
  try {
    return execFileSync('pnpm', ['exec', 'wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error: unknown) {
    const e = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    const stdout = e.stdout ? e.stdout.toString() : '';
    const stderr = e.stderr ? e.stderr.toString() : '';
    throw new Error(`Command failed: pnpm exec wrangler ${args.join(' ')}\n${stdout}${stderr || e.message || ''}`);
  }
}

function readConfig(): { content: string; config: WranglerConfig } {
  const content = readFileSync(CONFIG_PATH, 'utf8');
  return { content, config: parse(content) as WranglerConfig };
}

function writeConfigValue(content: string, path: Array<string | number>, value: string): string {
  const edits = modify(content, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } });
  return applyEdits(content, edits);
}

function parseJsonArray<T>(output: string, cmd: string): T[] {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) return parsed as T[];
  } catch {
    // fall through
  }
  throw new Error(`Expected JSON array from "${cmd}". Got:\n${output}`);
}

function getD1Id(db: D1DatabaseRecord): string | undefined {
  return db.uuid ?? db.database_id ?? db.id;
}

function ensureD1Database(name: string): string {
  const all = parseJsonArray<D1DatabaseRecord>(runWrangler(['d1', 'list', '--json']), 'wrangler d1 list --json');
  let db = all.find((d) => d.name === name);

  if (!db) {
    console.log(`Creating D1 database: ${name}`);
    runWrangler(['d1', 'create', name]);
    const updated = parseJsonArray<D1DatabaseRecord>(runWrangler(['d1', 'list', '--json']), 'wrangler d1 list --json');
    db = updated.find((d) => d.name === name);
  }

  const id = db ? getD1Id(db) : undefined;
  if (!id) throw new Error(`Unable to discover D1 database ID for "${name}".`);
  return id;
}

function prepareConfigFile(): void {
  const dumped = process.env.WRANGLER_JSONC;
  if (dumped?.trim()) {
    writeFileSync(CONFIG_PATH, dumped.endsWith('\n') ? dumped : `${dumped}\n`);
    console.log('Wrote wrangler.jsonc from WRANGLER_JSONC repository variable.');
    return;
  }
  copyFileSync(TEMPLATE_PATH, CONFIG_PATH);
  console.log('Copied apps/api/wrangler.template.jsonc → wrangler.jsonc.');
}

function provisionResources(): void {
  const { config, content: rawContent } = readConfig();
  let content = rawContent;

  for (const [index, database] of config.d1_databases?.entries() ?? []) {
    if (database.database_id !== DEFAULT_UUID) continue;
    if (!database.database_name) {
      throw new Error(`D1 binding ${database.binding ?? index} has placeholder database_id but no database_name.`);
    }

    const id = ensureD1Database(database.database_name);
    console.log(`Using D1 database "${database.database_name}": ${id}`);
    content = writeConfigValue(content, ['d1_databases', index, 'database_id'], id);
  }

  writeFileSync(CONFIG_PATH, content.endsWith('\n') ? content : `${content}\n`);
}

prepareConfigFile();
provisionResources();
console.log('wrangler.jsonc is ready.');
