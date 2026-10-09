import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/detect.ts'], bundle: true, format: 'esm', write: false, platform: 'node' });
const { detect } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('classifies an email without changing ordinary text', () => {
  const findings = detect('Contact alex@example.com. This is normal.');
  assert.deepEqual(findings.map(({ type, severity, text }) => ({ type, severity, text })), [{ type: 'Email', severity: 'medium', text: 'alex@example.com' }]);
});

test('classifies a password and an API key as high sensitivity', () => {
  const findings = detect('password = DemoPass123! sk-proj-FAKEEXAMPLEKEY1234567890');
  assert.deepEqual(findings.map(item => item.type), ['Password', 'API key']);
  assert.ok(findings.every(item => item.severity === 'high'));
});
