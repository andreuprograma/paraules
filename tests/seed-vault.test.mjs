import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const source = await readFile(new URL('../src/lib/seedVault.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  fileName: 'seedVault.ts',
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const seedVault = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

const master = '  Màster🚀Google$  ';
const pin = '3141';

test('protects and unlocks the exact full master using only the PIN', async () => {
  const created = await seedVault.createSeedVault(master, pin);
  assert.equal(created.vault.format, 2);
  assert.equal('recoverySecret' in created, false);
  assert.notEqual(JSON.stringify(created.vault).includes(master), true);
  assert.equal(await seedVault.unlockSeedVault(created.vault, pin), master);
});

test('requires the correct PIN to unwrap the local master key', async () => {
  const created = await seedVault.createSeedVault(master, pin);
  assert.equal(await seedVault.verifySeedVaultPin(created.vault, pin), true);
  assert.equal(await seedVault.verifySeedVaultPin(created.vault, '0000'), false);
  await assert.rejects(seedVault.unlockSeedVault(created.vault, '0000'), /PIN o la integritat/);
});

test('rejects modified authenticated ciphertext and malformed Unicode without rewriting input', async () => {
  const created = await seedVault.createSeedVault(master, pin);
  const changed = {
    ...created.vault,
    master: { ...created.vault.master, ciphertext: `${created.vault.master.ciphertext.slice(0, -4)}AAAA` },
  };
  await assert.rejects(seedVault.unlockSeedVault(changed, pin));
  await assert.rejects(seedVault.createSeedVault('\ud800', pin), /Unicode no vàlida/);
});

test('uses fresh random nonces and PIN wrapping salts', async () => {
  const first = await seedVault.createSeedVault(master, pin);
  const second = await seedVault.createSeedVault(master, pin);
  assert.notEqual(first.vault.master.nonce, second.vault.master.nonce);
  assert.notEqual(first.vault.wrappedKey.nonce, second.vault.wrappedKey.nonce);
  assert.notEqual(first.vault.wrappedKey.salt, second.vault.wrappedKey.salt);
});

test('crypto module has no recovery secret flow and does not persist, log, or transmit secrets', () => {
  assert.doesNotMatch(source, /recoverySecret|deriveRecoveryWrappingKey|paraules-recovery/);
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|console)\b/);
});
