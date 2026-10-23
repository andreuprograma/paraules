import assert from 'node:assert/strict';
import CryptoJS from 'crypto-js';
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

async function importSource(source, fileName) {
  const javascript = transpileModule(source, fileName);
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

const storageSource = await readFile(new URL('../src/lib/storage.ts', import.meta.url), 'utf8');
const storage = await importSource(storageSource, 'storage.ts');
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const unlockScreenSource = await readFile(new URL('../src/components/UnlockScreen.tsx', import.meta.url), 'utf8');
const pinLockoutSource = await readFile(new URL('../src/lib/pinLockout.ts', import.meta.url), 'utf8');
const pinLockout = await importSource(pinLockoutSource, 'pinLockout.ts');

const mockCryptoUrl = `data:text/javascript,export default {
  SHA256: () => ({ toString: () => 'test-key' }),
  AES: {
    encrypt: (value) => ({ toString: () => value }),
    decrypt: (value) => ({ toString: () => value }),
  },
  enc: { Utf8: {} },
};`;
const mockGeneratorUrl = `data:text/javascript,
  export const normalizeSeed = (seed) => seed;
  export const generatePassword = () => 'generated-password';
`;
const mockPocketBaseUrl = `data:text/javascript,
  export function getCloudUser() { return globalThis.__cloudTest.user; }
  export const pb = {
    cancelRequest: (...args) => globalThis.__cloudTest.cancelled.push(...args),
    collection: () => ({
      getFullList: (...args) => globalThis.__cloudTest.getFullList(...args),
      create: (...args) => globalThis.__cloudTest.writes.push(['create', ...args]),
      update: (...args) => globalThis.__cloudTest.writes.push(['update', ...args]),
    }),
  };
`;

let cloudSource = await readFile(new URL('../src/lib/cloudSync.ts', import.meta.url), 'utf8');
cloudSource = transpileModule(cloudSource, 'cloudSync.ts')
  .replaceAll("'crypto-js'", JSON.stringify(mockCryptoUrl))
  .replaceAll("'@/lib/passwordGenerator'", JSON.stringify(mockGeneratorUrl))
  .replaceAll("'@/lib/pocketbase'", JSON.stringify(mockPocketBaseUrl));
const cloudSync = await import(`data:text/javascript;base64,${Buffer.from(cloudSource).toString('base64')}`);

function installLocalStorage() {
  const values = new Map();
  let failNextRemovalOf = null;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => {
      if (key === failNextRemovalOf) {
        failNextRemovalOf = null;
        throw new Error('simulated storage failure');
      }
      values.delete(key);
    },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  return {
    values,
    failNextRemovalOf: (key) => { failNextRemovalOf = key; },
  };
}

function chatMessage(baseWord, id = baseWord) {
  return {
    id,
    baseWord,
    password: 'password',
    autoHide: true,
    comment: '',
    options: {
      length: 10,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: false,
      allowedSymbols: '',
    },
  };
}

test('keeps legacy local data intact and separates account caches', () => {
  installLocalStorage();
  const legacy = [chatMessage('legacy')];
  storage.setChatMessages(legacy);
  storage.setChatMessages([chatMessage('account-a')], 'account-a');
  storage.setChatMessages([chatMessage('account-b')], 'account-b');

  assert.deepEqual(storage.getChatMessages('account-a').map(({ baseWord }) => baseWord), ['account-a']);
  assert.deepEqual(storage.getChatMessages('account-b').map(({ baseWord }) => baseWord), ['account-b']);
  assert.deepEqual(storage.getChatMessages().map(({ baseWord }) => baseWord), ['legacy']);
});

test('local password reset removes all box data and account caches but preserves device, theme, and auth state', () => {
  installLocalStorage();
  for (const [key, value] of [
    ['pwgen.seed', 'encrypted-seed'],
    ['pwgen.settings', '{"length":20}'],
    ['pwgen.autohide', 'false'],
    ['pwgen.pin_lockout', '{"failedAttempts":4}'],
    ['pwgen.chat', '[{"baseWord":"legacy"}]'],
    ['pwgen.chat.account-a', '[{"baseWord":"account-a"}]'],
    ['pwgen.chat.account-b', '[{"baseWord":"account-b"}]'],
    ['pwgen.device_id', 'device-id'],
    ['pwgen.theme', 'dark'],
    ['pocketbase_auth', 'auth-state'],
  ]) localStorage.setItem(key, value);

  storage.resetLocalPasswordData();

  for (const key of [
    'pwgen.seed',
    'pwgen.settings',
    'pwgen.autohide',
    'pwgen.pin_lockout',
    'pwgen.chat',
    'pwgen.chat.account-a',
    'pwgen.chat.account-b',
  ]) assert.equal(localStorage.getItem(key), null, `${key} should be removed`);
  assert.equal(localStorage.getItem('pwgen.device_id'), 'device-id');
  assert.equal(localStorage.getItem('pwgen.theme'), 'dark');
  assert.equal(localStorage.getItem('pocketbase_auth'), 'auth-state');
});

test('local password reset restores the previous local state if a removal fails', () => {
  const mockStorage = installLocalStorage();
  localStorage.setItem('pwgen.seed', 'encrypted-seed');
  localStorage.setItem('pwgen.chat.account-a', 'cached-data');
  mockStorage.failNextRemovalOf('pwgen.chat.account-a');

  assert.throws(storage.resetLocalPasswordData, /S’ha restaurat l’estat anterior/);
  assert.equal(localStorage.getItem('pwgen.seed'), 'encrypted-seed');
  assert.equal(localStorage.getItem('pwgen.chat.account-a'), 'cached-data');
});

test('reset requires two explicit confirmations and returns to setup without cloud operations', () => {
  assert.match(unlockScreenSource, /window\.confirm\(/);
  assert.match(unlockScreenSource, /window\.prompt\(/);
  assert.match(unlockScreenSource, /confirmation !== 'RESTABLIR'/);
  assert.match(unlockScreenSource, /resetLocalPasswordData\(\)[\s\S]*onResetLocalData\(\)/);
  assert.doesNotMatch(storageSource, /pocketbase|fetch\(/i);
  const resetHandler = unlockScreenSource.match(/function handleResetLocalData\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.doesNotMatch(resetHandler, /pb\.|cloudSync|fetch\(|signOut/);
  assert.match(unlockScreenSource, /Restablir contrasenyes/);
  assert.match(appSource, /onResetLocalData=\{\(\) => \{[\s\S]*setSeedWord\(''\)[\s\S]*setDefaultSettings\(getDefaultSettings\(\)\)[\s\S]*setState\('setup'\)/);
});

test('clears in-memory seed and remounts the message view when the account changes', () => {
  assert.match(appSource, /pb\.authStore\.onChange/);
  assert.match(appSource, /setSeedWord\(''\)/);
  assert.match(appSource, /key=\{cloudUserId \?\? 'local'\}/);
});

test('initial cloud loading returns only the authenticated owner records and never uploads local cache', async () => {
  const records = [
    { id: 'a', user_id: 'account-a', symbol: 'A', encrypted_password: 'alpha', password_length: 10, uppercase: true, lowercase: true, numbers: true, symbols: false, is_deleted: false, created: '', updated: '' },
    { id: 'b', user_id: 'account-b', symbol: 'B', encrypted_password: 'beta', password_length: 10, uppercase: true, lowercase: true, numbers: true, symbols: false, is_deleted: false, created: '', updated: '' },
  ];
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => records,
  };

  const messages = await cloudSync.mergeLocalWithCloud('seed', true, 'account-a');
  assert.deepEqual(messages.map(({ baseWord }) => baseWord), ['alpha']);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('stops an account A sync if identity changes while its query is pending', async () => {
  let releaseQuery;
  let queryStarted;
  const started = new Promise((resolve) => { queryStarted = resolve; });
  const pendingQuery = new Promise((resolve) => { releaseQuery = resolve; });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => {
      queryStarted();
      return pendingQuery;
    },
  };

  const pendingWrite = cloudSync.upsertMessage(chatMessage('alpha'), 'seed', 'account-a');
  await started;
  globalThis.__cloudTest.user = { id: 'account-b' };
  cloudSync.cancelCloudSyncRequests('account-a');
  releaseQuery([]);

  await assert.rejects(pendingWrite, /sessió del compte ha canviat/);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
  assert.equal(globalThis.__cloudTest.cancelled.length, 1);
});

test('creates ordinary records with the captured owner identity', async () => {
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    getFullList: async () => [],
  };

  await cloudSync.upsertMessage(chatMessage('alpha'), 'seed', 'account-a');

  assert.equal(globalThis.__cloudTest.writes.length, 1);
  assert.equal(globalThis.__cloudTest.writes[0][0], 'create');
  assert.equal(globalThis.__cloudTest.writes[0][1].user_id, 'account-a');
});

test('applies every progressive lockout duration, including repeated 24-hour lockouts', () => {
  installLocalStorage();
  const durations = [60_000, 300_000, 900_000, 1_800_000, 3_600_000, 14_400_000, 86_400_000];
  let now = 1_000_000;

  for (let failure = 1; failure <= 10; failure += 1) {
    const status = pinLockout.recordPinFailure(now);
    const expectedDuration = failure < 3 ? 0 : durations[Math.min(failure - 3, durations.length - 1)];
    assert.equal(status.failedAttempts, failure);
    assert.equal(status.remainingMs, expectedDuration);
    if (expectedDuration > 0) {
      assert.equal(pinLockout.getPinLockoutStatus(now + expectedDuration - 1).remainingMs, 1);
      now += expectedDuration;
    }
  }
});

test('persists lockout across a module reload and a PocketBase account change without changing box data', async () => {
  installLocalStorage();
  const boxData = [chatMessage('preserved-box-data')];
  storage.setChatMessages(boxData, 'account-a');
  pinLockout.recordPinFailure(2_000_000);
  const before = storage.getChatMessages('account-a');

  globalThis.__cloudTest = { user: { id: 'account-a' } };
  globalThis.__cloudTest.user = { id: 'account-b' };

  const reloadedModule = await importSource(`${pinLockoutSource}\n`, 'pinLockout-reloaded.ts');
  assert.equal(reloadedModule.getPinLockoutStatus(2_000_001).failedAttempts, 1);
  assert.deepEqual(storage.getChatMessages('account-a'), before);
});

test('a correct PIN clears lockout and preserves box records', () => {
  installLocalStorage();
  storage.setChatMessages([chatMessage('must-survive-lockout')], 'account-a');
  pinLockout.recordPinFailure(3_000_000);
  const encryptedSeed = CryptoJS.AES.encrypt('test-seed', 'test-pin').toString();
  const decryptedSeed = CryptoJS.AES.decrypt(encryptedSeed, 'test-pin').toString(CryptoJS.enc.Utf8);
  assert.equal(decryptedSeed, 'test-seed');

  pinLockout.clearPinLockout();

  assert.deepEqual(storage.getChatMessages('account-a').map(({ baseWord }) => baseWord), ['must-survive-lockout']);
  assert.match(unlockScreenSource, /status\.remainingMs > 0/);
  assert.match(unlockScreenSource, /const decrypted = decryptSeed\(encrypted, pin\)/);
  assert.match(unlockScreenSource, /clearPinLockout\(\)[\s\S]*onUnlock\(decrypted\)/);
  assert.doesNotMatch(unlockScreenSource, /clearSeed|Reinicia la caixa/);
  assert.equal(pinLockout.getPinLockoutStatus(3_000_000).failedAttempts, 0);
});

test('corrupted lockout state fails closed rather than allowing a PIN attempt', () => {
  installLocalStorage();
  localStorage.setItem('pwgen.pin_lockout', '{invalid');
  assert.throws(() => pinLockout.getPinLockoutStatus(), /estat de seguretat/);
  assert.equal(readPinSecurityStatusSource(), true);
});

function readPinSecurityStatusSource() {
  return /if \(!currentSecurity\.status\)[\s\S]*return;/.test(unlockScreenSource);
}
