import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

function transpileModule(source, fileName) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

async function importTranspiled(source, fileName, replacements = []) {
  let javascript = transpileModule(source, fileName);
  for (const [specifier, replacement] of replacements) {
    javascript = javascript
      .replaceAll(`'${specifier}'`, JSON.stringify(replacement))
      .replaceAll(`"${specifier}"`, JSON.stringify(replacement));
  }
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

const generatorInputs = [];
globalThis.__generatorCrypto = {
  SHA256: (input) => {
    generatorInputs.push(input);
    return { toString: () => createHash('sha256').update(input, 'utf8').digest('hex') };
  },
};
const cryptoMockUrl = 'data:text/javascript,export default globalThis.__generatorCrypto;';
const generatorSource = await readFile(new URL('../src/lib/passwordGenerator.ts', import.meta.url), 'utf8');
const generator = await importTranspiled(generatorSource, 'passwordGenerator.ts', [['crypto-js', cryptoMockUrl]]);
const storageMockUrl = `data:text/javascript,export const DEFAULT_SETTINGS = {
  length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true, allowedSymbols: ''
};`;
const importExportSource = await readFile(new URL('../src/lib/importExport.ts', import.meta.url), 'utf8');
const importExport = await importTranspiled(importExportSource, 'importExport.ts', [['./storage', storageMockUrl]]);
const storageSource = await readFile(new URL('../src/lib/storage.ts', import.meta.url), 'utf8');
const chatScreenSource = await readFile(new URL('../src/components/ChatScreen.tsx', import.meta.url), 'utf8');
const setupScreenSource = await readFile(new URL('../src/components/SetupScreen.tsx', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('export and import preserve exact bases, including edge spaces and whitespace-only bases', () => {
  const baseWords = [
    'Google',
    'google',
    'Goo$gle!',
    'correu.personal+1@example.com',
    'paraula amb espais',
    ' Contrasenya-àèí-2026! ',
    ' ',
    '🚀🌍',
  ];
  const messages = baseWords.map((baseWord, index) => ({
    id: String(index),
    baseWord,
    password: 'not-exported',
    autoHide: true,
    comment: '',
    options: {
      length: 16,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
      allowedSymbols: '',
    },
  }));

  const exported = importExport.messagesToExportText(messages);
  const imported = importExport.parseImportData(exported);
  assert.deepEqual(imported.map(({ baseWord }) => baseWord), baseWords);
});

test('generator hashes the exact concatenation and remains deterministic', () => {
  const options = {
    length: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    allowedSymbols: '!@#$',
  };
  const seedWord = 'Mäster 🚀 ';
  const baseWord = ' Google ';

  generatorInputs.length = 0;
  const first = generator.generatePassword(seedWord, baseWord, options);
  const second = generator.generatePassword(seedWord, baseWord, options);

  assert.equal(first, second);
  assert.deepEqual(generatorInputs, [seedWord + baseWord, seedWord + baseWord]);
  assert.equal(generatorInputs[0], 'Mäster 🚀  Google ');
});

test('generator rejects unpaired UTF-16 surrogates without rewriting them', () => {
  const options = {
    length: 12,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: false,
  };

  assert.throws(() => generator.generatePassword('\ud800', 'base', options), /Unicode no vàlida/);
  assert.throws(() => generator.generatePassword('seed', '\udfff', options), /Unicode no vàlida/);
});

test('the existing generator formula remains direct SHA-256 concatenation', () => {
  assert.match(generatorSource, /CryptoJS\.SHA256\(seedWord \+ baseWord\)\.toString\(\)/);
  assert.doesNotMatch(generatorSource, /SHA256\([^)]*seedWord\s*\+\s*['"`]/);
});

test('new local chat records can be saved without a plaintext password field while legacy passwords remain readable', async () => {
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
  };
  const storage = await importTranspiled(storageSource, 'storage.ts');
  const legacy = {
    id: 'old',
    baseWord: 'old-base',
    password: 'legacy-plaintext',
    autoHide: true,
    comment: '',
    options: { length: 10, uppercase: true, lowercase: true, numbers: true, symbols: true, allowedSymbols: '' },
  };
  const fresh = {
    id: 'new',
    baseWord: ' Google ',
    autoHide: true,
    comment: '',
    options: { length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true, allowedSymbols: '' },
  };

  storage.setChatMessages([legacy, fresh]);
  const raw = stored.get('pwgen.chat');
  assert.match(raw, /legacy-plaintext/);
  assert.doesNotMatch(raw, /"password":undefined/);
  assert.deepEqual(storage.getChatMessages().map(({ password }) => password), ['legacy-plaintext', undefined]);
});

test('saving PIN-only unlock settings preserves old master records until explicit reset', async () => {
  const oldVault = JSON.stringify({ format: 1, master: { nonce: 'n', ciphertext: 'c' } });
  const stored = new Map([
    ['pwgen.seed', 'legacy-ciphertext'],
    ['pwgen.seed_vault', oldVault],
  ]);
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
  };
  const storage = await importTranspiled(storageSource, 'storage.ts');
  const vault = JSON.stringify({ format: 2, master: { nonce: 'new-n', ciphertext: 'new-c' } });

  storage.savePinOnlySeedVault(vault);
  assert.equal(stored.get('pwgen.seed'), 'legacy-ciphertext');
  assert.equal(stored.get('pwgen.seed_vault'), oldVault);
  assert.equal(stored.get('pwgen.pin_seed_vault'), vault);
  assert.equal(stored.get('pwgen.master_format'), 'pin');
});

test('chat generation and duplicate handling use the exact base string and do not persist generated output', () => {
  assert.match(chatScreenSource, /onChange=\{\(e\) => setBaseWord\(e\.target\.value\)\}/);
  assert.match(chatScreenSource, /const existing = messages\.find\(\(message\) => message\.baseWord === baseWord\)/);
  assert.match(chatScreenSource, /const idx = next\.findIndex\(\(m\) => m\.baseWord === row\.baseWord\)/);
  assert.doesNotMatch(chatScreenSource, /const password = generatePassword/);
  assert.doesNotMatch(chatScreenSource, /baseWord\.trim\(\)/);
  assert.match(chatScreenSource, /if \(!message \|\| message\.password !== undefined\)/);
});

test('setup confirms the exact master and PIN while requiring acknowledgment of PIN-only risk', () => {
  assert.match(setupScreenSource, /fixed inset-0 z-\[60\].*\[height:100dvh\].*overflow-y-auto/);
  assert.match(setupScreenSource, /min-h-full flex items-start justify-center/);
  assert.match(setupScreenSource, /if \(seed !== confirmSeed\)/);
  assert.doesNotMatch(setupScreenSource, /seed\.(?:trim|toLowerCase|normalize)\(/);
  assert.match(setupScreenSource, /if \(pin\.length < 4 \|\| pin !== confirmPin\)/);
  assert.match(setupScreenSource, /savePinOnlySeedVault\(JSON\.stringify\(vault\)\)/);
  assert.match(setupScreenSource, /acceptPinRisk/);
  assert.doesNotMatch(setupScreenSource, /recoverySecret|Genera i verifica recuperació/);
});

test('cloud sync and mutation callbacks remain disabled pending a safe legacy-data plan', () => {
  assert.match(appSource, /const cloudActionsEnabled = true/);
  assert.match(appSource, /onInitialSync=\{cloudActionsEnabled \? syncInitialMessages : undefined\}/);
  assert.match(appSource, /onCloudMessageChange=\{cloudActionsEnabled \? syncMessage : undefined\}/);
  assert.match(appSource, /onCloudLogoChange=\{cloudActionsEnabled \? saveCloudMessageLogo : undefined\}/);
});
