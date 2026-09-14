// Migration loading for the pool-workers integration suite.
//
// The concatenated SQL for migrations/0001-0008 is injected by
// vitest.config.mts as the __INTEGRATION_MIGRATION_SQL__ define (test files
// run inside workerd, where node:fs is unavailable). This module splits the
// script into executable statements and applies them to the test D1.

// Injected at build time via `define` in test/integration/vitest.config.mts.
declare const __INTEGRATION_MIGRATION_SQL__: string;

const MARKER_KEY = '__integration_migrations_applied';

function getCombinedMigrationSql(): string {
  return __INTEGRATION_MIGRATION_SQL__;
}

// splitSql splits a multi-statement SQL script on semicolons that appear
// outside string literals and comments. It handles:
// - `--` line comments (ignored, including comment-only chunks, which are
//   skipped because they produce no statement text),
// - single-quoted strings with doubled-quote escapes (`''`),
// - double-quoted identifiers with doubled-quote escapes (`""`).
function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let inIdentifier = false;
  let inLineComment = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (inIdentifier) {
      current += ch;
      if (ch === '"') {
        if (next === '"') {
          current += next;
          i += 2;
          continue;
        }
        inIdentifier = false;
      }
      i += 1;
      continue;
    }
    if (ch === '-' && next === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inIdentifier = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

// fingerprint identifies the exact migration bundle so re-runs against an
// already-migrated database can skip the DDL. FNV-1a over the combined SQL.
function fingerprint(sql: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sql.length; i += 1) {
    hash ^= sql.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// applyMigrations creates the nodes/vnodes/crl/tracker_meta schema in an
// empty test database. It is idempotent: a fingerprint marker in
// tracker_meta short-circuits repeat runs, and `ALTER TABLE ... ADD COLUMN`
// statements that hit an existing column (duplicate-column error) are skipped
// so partial states still converge.
async function applyMigrations(db: D1Database): Promise<void> {
  const combined = getCombinedMigrationSql();
  const expected = fingerprint(combined);
  try {
    const marker = await db
      .prepare('SELECT value FROM tracker_meta WHERE key = ?')
      .bind(MARKER_KEY)
      .first<{ value: string }>();
    if (marker?.value === expected) return;
  } catch {
    // tracker_meta does not exist yet — migrate from scratch below.
  }
  for (const statement of splitSql(combined)) {
    try {
      await db.prepare(statement).run();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate column name/i.test(message)) continue;
      throw error;
    }
  }
  await db
    .prepare('INSERT INTO tracker_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(MARKER_KEY, expected)
    .run();
}

export { applyMigrations, fingerprint, getCombinedMigrationSql, splitSql };
