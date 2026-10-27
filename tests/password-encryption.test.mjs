import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const source = await readFile(new URL('../src/lib/passwordEncryption.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  fileName: 'passwordEncryption.ts',
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const encryption = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

const artificialMaster = 'pocmaster0123456789abcdefghij';
const artificialPassword = 'Poc-Only!Pass-482';

test('encrypts and decrypts an artificial password with the same master', async () => {
  const envelope = await encryption.encryptExistingPassword(artificialPassword, artificialMaster);

  assert.equal(await encryption.decryptExistingPassword(envelope, artificialMaster), artificialPassword);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.algorithm, 'AES-256-GCM');
  assert.equal(envelope.kdf, 'PBKDF2-HMAC-SHA-256');
  assert.equal(envelope.iterations, 600_000);
});

test('uses short and non-ASCII master words exactly without normalizing them', async () => {
  const masters = [
    'abc',
    'ParaulaMestra',
    'màster amb accent',
    'sym!$#bol',
    ' master ',
    '密碼🔐',
  ];

  for (const master of masters) {
    const envelope = await encryption.encryptExistingPassword(artificialPassword, master);
    assert.equal(await encryption.decryptExistingPassword(envelope, master), artificialPassword);
  }
});

test('rejects a wrong artificial master and modified authenticated ciphertext', async () => {
  const envelope = await encryption.encryptExistingPassword(artificialPassword, artificialMaster);
  await assert.rejects(
    encryption.decryptExistingPassword(envelope, 'differentpocmaster0123456789'),
    /No s’ha pogut desxifrar/,
  );

  const modified = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
  await assert.rejects(
    encryption.decryptExistingPassword(modified, artificialMaster),
    /No s’ha pogut desxifrar/,
  );
});

test('master capitalization and surrounding spaces are significant', async () => {
  const master = ' Maíster! ';
  const envelope = await encryption.encryptExistingPassword(artificialPassword, master);

  assert.equal(await encryption.decryptExistingPassword(envelope, master), artificialPassword);
  await assert.rejects(
    encryption.decryptExistingPassword(envelope, master.trim()),
    /No s’ha pogut desxifrar/,
  );
  await assert.rejects(
    encryption.decryptExistingPassword(envelope, master.toLowerCase()),
    /No s’ha pogut desxifrar/,
  );
});

test('creates a fresh random salt and nonce for each encryption', async () => {
  const first = await encryption.encryptExistingPassword(artificialPassword, artificialMaster);
  const second = await encryption.encryptExistingPassword(artificialPassword, artificialMaster);

  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.nonce, second.nonce);
});

test('rejects unsupported or malformed envelope parameters', async () => {
  const envelope = await encryption.encryptExistingPassword(artificialPassword, artificialMaster);
  await assert.rejects(
    encryption.decryptExistingPassword({ ...envelope, iterations: 1 }, artificialMaster),
    /no és vàlid o no és compatible/,
  );
});

test('the crypto module uses Web Crypto only and contains no persistence or logging', () => {
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|console)\b/);
  assert.doesNotMatch(source, /\bCryptoJS\b/);
});
