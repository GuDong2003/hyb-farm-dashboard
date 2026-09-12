import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'web/app.js'), 'utf8');

test('settings markup contains the administrator entry and four controls', () => {
  assert.match(app, /管理员入口/);
  assert.match(app, /siteEnabled/);
  assert.match(app, /priceCaptureEnabled/);
  assert.match(app, /cloudUploadEnabled/);
  assert.match(app, /maintenanceMessage/);
});

test('admin password and csrf token are not exported or persisted in local state', () => {
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*password/i);
  assert.doesNotMatch(app, /JSON\.stringify\([^\n]*csrf/i);
  assert.match(app, /csrfToken/);
});

test('capture and upload controls consult runtime site config', () => {
  assert.match(app, /priceCaptureEnabled/);
  assert.match(app, /cloudUploadEnabled/);
  assert.match(app, /api\/site-config/);
  assert.match(app, /api\/admin\/login/);
  assert.match(app, /api\/admin\/config/);
});
