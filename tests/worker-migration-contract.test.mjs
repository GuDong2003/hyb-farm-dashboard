import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(new URL(
  '../migrations/0003_price_submissions_accepted_captured_at.sql',
  import.meta.url
));

test('accepted price history has an accepted-and-captured-at index', () => {
  assert.equal(existsSync(migrationPath), true, 'the next numbered D1 migration exists');
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_price_submissions_accepted_captured_at/i);
  assert.match(
    sql,
    /ON\s+price_submissions\s*\(\s*accepted\s*,\s*captured_at\s+DESC\s*\)/i
  );
});
