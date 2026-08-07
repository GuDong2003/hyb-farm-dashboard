import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(new URL(
  '../migrations/0003_price_submissions_accepted_captured_at.sql',
  import.meta.url
));
const deployWorkflowPath = fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url));

test('accepted price history has an accepted-and-captured-at index', () => {
  assert.equal(existsSync(migrationPath), true, 'the next numbered D1 migration exists');
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_price_submissions_accepted_captured_at/i);
  assert.match(
    sql,
    /ON\s+price_submissions\s*\(\s*accepted\s*,\s*captured_at\s+DESC\s*\)/i
  );
});

test('deployment workflow applies D1 migrations before deploying the Worker', () => {
  const workflow = readFileSync(deployWorkflowPath, 'utf8');
  const wranglerActionUses = workflow.match(/uses:\s*cloudflare\/wrangler-action@v3/g) || [];
  const migrationCommand = 'command: d1 migrations apply hyb-farm-dashboard-db --remote';
  const deployCommand = 'command: deploy';
  const migrationAt = workflow.indexOf(migrationCommand);
  const deployAt = workflow.indexOf(deployCommand);

  assert.ok(wranglerActionUses.length >= 2, 'migration and deploy use separate Wrangler action steps');
  assert.notEqual(migrationAt, -1, 'workflow applies remote D1 migrations');
  assert.notEqual(deployAt, -1, 'workflow deploys the Worker');
  assert.ok(migrationAt < deployAt, 'D1 migrations run before Worker deployment');

  for (const command of [migrationCommand, deployCommand]) {
    const commandAt = workflow.indexOf(command);
    const stepStart = workflow.lastIndexOf('- name:', commandAt);
    const step = workflow.slice(stepStart, commandAt + command.length);
    assert.match(step, /apiToken:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
    assert.match(step, /accountId:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  }
});
