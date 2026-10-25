import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatFileSummary, isSensitivePath } from '../scripts/publish.mjs';

test('publication excludes environment and credential files', () => {
  for (const filePath of [
    '.env',
    '.env.local',
    'config/.env.production',
    'secrets/pocketbase.json',
    'private/credentials.txt',
    'api-token.txt',
    'tls/server.pem',
    'certs/client.p12',
  ]) {
    assert.equal(isSensitivePath(filePath), true, `${filePath} must be excluded`);
  }
});

test('publication allows ordinary project source and configuration files', () => {
  for (const filePath of [
    'src/App.tsx',
    'src/lib/cloudSync.ts',
    'tests/account-isolation.test.mjs',
    '.vscode/tasks.json',
    'package.json',
  ]) {
    assert.equal(isSensitivePath(filePath), false, `${filePath} should remain publishable`);
  }
});

test('file summary does not pass Array.map index as basename suffix', () => {
  const files = ['src/App.tsx', 'src/components/ChatScreen.tsx', 'tests/publish.test.mjs'];

  assert.throws(() => files.slice(0, 2).map(basename), /suffix.*number|number.*suffix/i);
  assert.equal(formatFileSummary(files), 'App.tsx, ChatScreen.tsx +1 more');
});

test('VS Code button is connected to the guarded publication task', async () => {
  const [settings, tasks] = await Promise.all([
    readFile(new URL('../.vscode/settings.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../.vscode/tasks.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const button = settings['VsCodeTaskButtons.tasks'].find(({ label }) => label.includes('Publicar Paraules'));
  assert.equal(button?.task, 'Publicar Paraules');
  assert.equal(tasks.tasks.find(({ label }) => label === 'Publicar Paraules')?.args?.[0], 'scripts/publish.mjs');
});
