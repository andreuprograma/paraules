import assert from 'node:assert/strict';
import CryptoJS from 'crypto-js';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

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
const optionsPanelSource = await readFile(new URL('../src/components/OptionsPanel.tsx', import.meta.url), 'utf8');
const cloudReadDiagnosticsSource = await readFile(new URL('../src/components/CloudReadDiagnosticsModal.tsx', import.meta.url), 'utf8');
const unlockScreenSource = await readFile(new URL('../src/components/UnlockScreen.tsx', import.meta.url), 'utf8');
const chatScreenSource = await readFile(new URL('../src/components/ChatScreen.tsx', import.meta.url), 'utf8');
const recycleBinSource = await readFile(new URL('../src/components/RecycleBinModal.tsx', import.meta.url), 'utf8');
const pinLockoutSource = await readFile(new URL('../src/lib/pinLockout.ts', import.meta.url), 'utf8');
const pinLockout = await importSource(pinLockoutSource, 'pinLockout.ts');

globalThis.__cloudCryptoJS = CryptoJS;
const mockCryptoUrl = 'data:text/javascript,export default globalThis.__cloudCryptoJS;';
const mockGeneratorUrl = `data:text/javascript,
  export const normalizeSeed = (seed) => seed.trim().normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  export const generatePassword = () => 'generated-password';
`;
const cloudCipherSource = await readFile(new URL('../src/lib/cloudCipher.ts', import.meta.url), 'utf8');
const cloudCipherJavascript = transpileModule(cloudCipherSource, 'cloudCipher.ts');
const cloudCipherUrl = `data:text/javascript;base64,${Buffer.from(cloudCipherJavascript).toString('base64')}`;
const cloudCipher = await import(cloudCipherUrl);
const mockPocketBaseUrl = `data:text/javascript,
  export function getCloudUser() { return globalThis.__cloudTest.user; }
  export const pb = {
    cancelRequest: (...args) => globalThis.__cloudTest.cancelled.push(...args),
    files: { getURL: (_record, filename) => 'https://pocketbase.test/files/' + filename },
    collection: () => ({
      getFullList: (...args) => globalThis.__cloudTest.getFullList(...args),
      getList: (...args) => {
        globalThis.__cloudTest.reads.push(args);
        return globalThis.__cloudTest.getList(...args);
      },
      create: async (...args) => {
        globalThis.__cloudTest.writes.push(['create', ...args]);
        return globalThis.__cloudTest.create?.(...args);
      },
      update: async (...args) => {
        globalThis.__cloudTest.writes.push(['update', ...args]);
        return globalThis.__cloudTest.update?.(...args);
      },
      delete: async (...args) => {
        globalThis.__cloudTest.writes.push(['delete', ...args]);
        return globalThis.__cloudTest.delete?.(...args);
      },
    }),
  };
`;

let cloudSource = await readFile(new URL('../src/lib/cloudSync.ts', import.meta.url), 'utf8');
cloudSource = transpileModule(cloudSource, 'cloudSync.ts')
  .replaceAll("'crypto-js'", JSON.stringify(mockCryptoUrl))
  .replaceAll("'@/lib/passwordGenerator'", JSON.stringify(mockGeneratorUrl))
  .replaceAll("'@/lib/cloudCipher'", JSON.stringify(cloudCipherUrl))
  .replaceAll("'@/lib/pocketbase'", JSON.stringify(mockPocketBaseUrl));
const cloudSync = await import(`data:text/javascript;base64,${Buffer.from(cloudSource).toString('base64')}`);
const logoSource = await readFile(new URL('../src/lib/logo.ts', import.meta.url), 'utf8');
const logo = await importSource(logoSource, 'logo.ts');
const passwordBubbleSource = await readFile(new URL('../src/components/PasswordBubble.tsx', import.meta.url), 'utf8');

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

function legacyEncrypt(value, seed = 'seed') {
  const normalizedSeed = seed.trim().normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = CryptoJS.SHA256(normalizedSeed).toString();
  return CryptoJS.AES.encrypt(value, key).toString();
}

function asLegacyCipher(value) {
  return value.startsWith('U2FsdGVkX1') ? value : legacyEncrypt(value);
}

function cloudRecord(id, overrides = {}) {
  const baseWord = overrides.encrypted_password ?? 'alpha';
  const comment = overrides.encrypted_comment ?? 'private comment';
  return {
    id,
    user_id: 'account-a',
    type: 'A',
    symbol: baseWord.charAt(0).toUpperCase(),
    encrypted_password: asLegacyCipher(baseWord),
    encrypted_comment: comment ? asLegacyCipher(comment) : '',
    password_length: 10,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: false,
    allowed_symbols: '',
    device_id: 'device-a',
    is_deleted: false,
    logo: 'logo.png',
    logo_url: '',
    created: '2025-01-01 00:00:00Z',
    updated: '2025-01-02 00:00:00Z',
    ...overrides,
    encrypted_password: asLegacyCipher(baseWord),
    encrypted_comment: comment ? asLegacyCipher(comment) : '',
  };
}

async function versionedRecord(id, baseWord = 'alpha', overrides = {}) {
  const resolvedBaseWord = overrides.encrypted_password ?? baseWord;
  const resolvedComment = overrides.encrypted_comment ?? 'private comment';
  const recordOverrides = { ...overrides };
  delete recordOverrides.encrypted_password;
  delete recordOverrides.encrypted_comment;
  return {
    ...cloudRecord(id, { ...recordOverrides, encrypted_password: resolvedBaseWord, encrypted_comment: resolvedComment }),
    encrypted_password: await cloudCipher.encryptCloudValue(resolvedBaseWord, 'seed', 'account-a', 'base'),
    encrypted_comment: resolvedComment === ''
      ? ''
      : await cloudCipher.encryptCloudValue(resolvedComment, 'seed', 'account-a', 'comment'),
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
    ['pwgen.cloud_pending.example', 'pending'],
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
    'pwgen.cloud_pending.example',
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

test('reset uses an in-app typed confirmation and returns to setup without cloud operations', () => {
  assert.doesNotMatch(unlockScreenSource, /window\.(?:confirm|prompt)\(/);
  assert.match(unlockScreenSource, /setResetConfirmationOpen\(true\)/);
  assert.match(unlockScreenSource, /role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(unlockScreenSource, /value=\{resetConfirmation\}/);
  assert.match(unlockScreenSource, /disabled=\{resetConfirmation !== 'RESTABLIR'\}/);
  assert.match(unlockScreenSource, /if \(resetConfirmation !== 'RESTABLIR'\) return;[\s\S]*resetLocalPasswordData\(\);[\s\S]*onResetLocalData\(\)/);
  assert.doesNotMatch(storageSource, /pocketbase|fetch\(/i);
  const resetHandlers = unlockScreenSource.match(/function handleResetLocalData\(\) \{[\s\S]*?function confirmResetLocalData\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.doesNotMatch(resetHandlers, /pb\.|cloudSync|fetch\(|signOut/);
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
    { id: 'a', user_id: 'account-a', type: 'A', symbol: 'A', encrypted_password: legacyEncrypt('alpha'), password_length: 10, uppercase: true, lowercase: true, numbers: true, symbols: false, is_deleted: false, created: '', updated: '' },
    { id: 'b', user_id: 'account-b', type: 'A', symbol: 'B', encrypted_password: legacyEncrypt('beta'), password_length: 10, uppercase: true, lowercase: true, numbers: true, symbols: false, is_deleted: false, created: '', updated: '' },
    { id: 'part-b', user_id: 'account-a', type: 'B', encrypted_password: 'not-an-A-ciphertext' },
  ];
  let queryFilter = '';
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async ({ filter }) => {
      queryFilter = filter;
      return records;
    },
  };

  const messages = await cloudSync.mergeLocalWithCloud('seed', true, 'account-a');
  assert.deepEqual(messages.map(({ baseWord }) => baseWord), ['alpha']);
  assert.match(queryFilter, /type = "A"/);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('sync read errors are visible and authentication does not claim a paused sync succeeded', () => {
  assert.match(chatScreenSource, /No s’ha pogut llegir ni fusionar les dades del núvol/);
  assert.doesNotMatch(chatScreenSource, /\.catch\(\(\) => undefined\)/);
  assert.match(appSource, /setCloudStatus\(cloudActionsEnabled \? 'synced' : 'offline'\)/);
});

test('cloud list and update helpers report missing authentication instead of succeeding silently', async () => {
  globalThis.__cloudTest = {
    user: null,
    writes: [],
    cancelled: [],
    getFullList: async () => [],
  };

  await assert.rejects(cloudSync.listUserRecords('seed'), /Inicia sessió al núvol/);
  await assert.rejects(
    cloudSync.updateRecordFields('record-id', { comment: 'updated' }, 'seed'),
    /Inicia sessió al núvol/,
  );
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('PocketBase diagnostic explicitly paginates twice and returns counts only', async () => {
  const records = Array.from({ length: 101 }, (_, index) => ({
    id: `record-${String(index).padStart(3, '0')}`,
    user_id: 'account-a',
    updated: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    is_deleted: index % 2 === 0,
  }));
  const reads = [];
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    reads,
    writes: [],
    cancelled: [],
    getList: async (page, perPage, options) => {
      const start = (page - 1) * perPage;
      return {
        page,
        perPage,
        totalItems: records.length,
        totalPages: Math.ceil(records.length / perPage),
        items: records.slice(start, start + perPage),
      };
    },
  };

  const result = await cloudSync.runCloudReadDiagnostic();

  assert.deepEqual(result, {
    recordCount: 101,
    firstReadPages: 2,
    secondReadPages: 2,
    uniqueRecordCount: 101,
    repeatedReadStable: true,
  });
  assert.equal(reads.length, 4);
  assert.deepEqual(reads.map(([page]) => page), [1, 2, 1, 2]);
  for (const [, perPage, options] of reads) {
    assert.equal(perPage, 100);
    assert.equal(options.filter, 'user_id = "account-a"');
    assert.equal(options.fields, 'id,user_id,updated,is_deleted');
    assert.equal(options.sort, 'id');
  }
  assert.equal(globalThis.__cloudTest.writes.length, 0);
  assert.equal(Object.keys(result).some((key) => /id|record/i.test(key) && !/count/i.test(key)), false);
});

test('PocketBase diagnostic reports no session instead of an empty collection', async () => {
  globalThis.__cloudTest = { user: null, reads: [], writes: [], cancelled: [] };
  await assert.rejects(
    cloudSync.runCloudReadDiagnostic(),
    (error) => error.code === 'AUTH_REQUIRED',
  );
  assert.deepEqual(globalThis.__cloudTest.reads, []);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('PocketBase diagnostic distinguishes an authenticated empty collection from errors', async () => {
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    reads: [],
    writes: [],
    cancelled: [],
    getList: async (page) => ({ page, perPage: 100, totalItems: 0, totalPages: 0, items: [] }),
  };

  const result = await cloudSync.runCloudReadDiagnostic();

  assert.equal(result.recordCount, 0);
  assert.equal(result.uniqueRecordCount, 0);
  assert.equal(result.repeatedReadStable, true);
  assert.equal(globalThis.__cloudTest.reads.length, 2);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('PocketBase diagnostic classifies authentication, permission, and network read failures', async () => {
  for (const [status, code] of [[401, 'AUTH_FAILED'], [403, 'PERMISSION_DENIED'], [0, 'NETWORK_ERROR']]) {
    globalThis.__cloudTest = {
      user: { id: 'account-a' },
      reads: [],
      writes: [],
      cancelled: [],
      getList: async () => {
        const error = new Error('redacted request failure');
        error.status = status;
        throw error;
      },
    };
    await assert.rejects(
      cloudSync.runCloudReadDiagnostic(),
      (error) => error.code === code && !error.message.includes('redacted request failure'),
    );
    assert.deepEqual(globalThis.__cloudTest.writes, []);
  }
});

test('PocketBase diagnostic rejects foreign owners, repeated IDs, and inconsistent page totals', async () => {
  const cases = [
    {
      code: 'FOREIGN_RECORD',
      getList: async (page) => ({ page, perPage: 100, totalItems: 1, totalPages: 1, items: [
        { id: 'opaque-id', user_id: 'account-b', updated: '', is_deleted: false },
      ] }),
    },
    {
      code: 'INCONSISTENT_RESULT',
      getList: async (page) => ({ page, perPage: 100, totalItems: 2, totalPages: 1, items: [
        { id: 'same-id', user_id: 'account-a', updated: '', is_deleted: false },
        { id: 'same-id', user_id: 'account-a', updated: '', is_deleted: false },
      ] }),
    },
    {
      code: 'INCONSISTENT_RESULT',
      getList: async (page) => ({ page, perPage: 100, totalItems: 2, totalPages: 1, items: [
        { id: 'opaque-id', user_id: 'account-a', updated: '', is_deleted: false },
      ] }),
    },
  ];

  for (const testCase of cases) {
    globalThis.__cloudTest = {
      user: { id: 'account-a' },
      reads: [],
      writes: [],
      cancelled: [],
      getList: testCase.getList,
    };
    await assert.rejects(
      cloudSync.runCloudReadDiagnostic(),
      (error) => error.code === testCase.code,
    );
    assert.deepEqual(globalThis.__cloudTest.writes, []);
  }
});

test('PocketBase diagnostic stops if the two complete reads differ', async () => {
  let callCount = 0;
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    reads: [],
    writes: [],
    cancelled: [],
    getList: async (page) => {
      callCount += 1;
      return {
        page,
        perPage: 100,
        totalItems: 1,
        totalPages: 1,
        items: [{ id: 'opaque-id', user_id: 'account-a', updated: `revision-${callCount}`, is_deleted: false }],
      };
    },
  };

  await assert.rejects(
    cloudSync.runCloudReadDiagnostic(),
    (error) => error.code === 'INCONSISTENT_RESULT',
  );
  assert.equal(globalThis.__cloudTest.reads.length, 2);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('diagnostic UI compares the admin count and does not claim completeness without rules confirmation', () => {
  assert.match(optionsPanelSource, /CloudReadDiagnosticsModal/);
  assert.match(cloudReadDiagnosticsSource, /Recompte de registres del compte de prova/);
  assert.match(cloudReadDiagnosticsSource, /He revisat per una via autoritzada/);
  assert.match(cloudReadDiagnosticsSource, /no es podrà indicar que la lectura és completa/);
  assert.match(cloudReadDiagnosticsSource, /No s’ha considerat el resultat com una llista buida/);
  assert.match(appSource, /const cloudActionsEnabled = true/);
});

test('cloud database inspection is read-only and returns only authenticated PocketBase records with logo fields', async () => {
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const records = [
    {
      id: 'owned',
      user_id: 'account-a',
      type: 'A',
      symbol: 'W',
      encrypted_password: legacyEncrypt('whatsapp'),
      encrypted_comment: legacyEncrypt('personal note'),
      logo: 'whatsapp.png',
      logo_url: 'https://example.test/old-logo.png',
      password_length: 14,
      uppercase: true,
      lowercase: true,
      numbers: false,
      symbols: true,
      allowed_symbols: '!@',
      device_id: 'device-a',
      is_deleted: false,
      created: '2025-01-01 00:00:00Z',
      updated: '2025-01-02 00:00:00Z',
    },
    {
      id: 'not-owned',
      user_id: 'account-b',
      type: 'A',
      symbol: 'N',
      encrypted_password: legacyEncrypt('other-account'),
      password_length: 10,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: false,
      is_deleted: false,
      created: '',
      updated: '',
    },
    {
      id: 'url-only',
      user_id: 'account-a',
      type: 'A',
      symbol: 'N',
      encrypted_password: legacyEncrypt('netflix'),
      logo: '',
      logo_url: 'https://cdn.example.test/netflix.png',
      password_length: 10,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: false,
      is_deleted: false,
      created: '',
      updated: '',
    },
  ];
  const queries = [];
  globalThis.localStorage = {
    getItem() { throw new Error('Cloud inspection must not read local storage'); },
  };
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async (...args) => {
      queries.push(args);
      return records;
    },
  };

  try {
    const inspected = await cloudSync.listCloudInspectionRecords('seed');

    assert.equal(inspected.length, 2);
    assert.equal(inspected[0].baseWord, 'whatsapp');
    assert.equal(inspected[0].comment, 'personal note');
    assert.equal(inspected[0].logoFilename, 'whatsapp.png');
    assert.equal(inspected[0].logoUrl, 'https://pocketbase.test/files/whatsapp.png');
    assert.equal(inspected[0].logoExternalUrl, 'https://example.test/old-logo.png');
    assert.equal(inspected[0].allowedSymbols, '!@');
    assert.equal(inspected[0].deviceId, 'device-a');
    assert.equal(inspected[1].logoUrl, 'https://cdn.example.test/netflix.png');
    assert.match(queries[0][0].filter, /user_id = "account-a"/);
    assert.deepEqual(globalThis.__cloudTest.writes, []);
  } finally {
    if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
    else delete globalThis.localStorage;
  }
});

test('cloud database viewer has Logo first and exposes no record mutation controls', async () => {
  const viewerSource = await readFile(new URL('../src/components/DatabaseViewerModal.tsx', import.meta.url), 'utf8');
  assert.match(viewerSource, /const COLUMNS:[\s\S]*?\{ key: 'logo', label: 'Logo' \}/);
  assert.match(viewerSource, /listCloudInspectionRecords\(seedWord, showDeleted\)/);
  assert.doesNotMatch(viewerSource, /updateRecordFields|setRecordDeleted|\.create\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(viewerSource, /localStorage|sessionStorage|from ['"].*storage/);
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
  installLocalStorage();
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    getFullList: async () => [],
  };

  await cloudSync.upsertMessage(chatMessage('alpha'), 'seed', 'account-a');

  assert.equal(globalThis.__cloudTest.writes.length, 1);
  assert.equal(globalThis.__cloudTest.writes[0][0], 'create');
  assert.equal(globalThis.__cloudTest.writes[0][1].user_id, 'account-a');
  assert.equal(globalThis.__cloudTest.writes[0][1].type, 'A');
});

test('new cloud records preserve exact Unicode bases and never send generated passwords', async () => {
  installLocalStorage();
  const baseWord = ' Google🚀Goo$gle! ';
  const message = chatMessage(baseWord, 'local-message');
  message.password = 'generated-password-must-not-leave-device';
  const records = [];
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => records,
    create: async (payload) => {
      records.push({ ...payload, id: 'remote-message', created: '', updated: '' });
      return records.at(-1);
    },
  };

  await cloudSync.upsertMessage(message, 'seed', 'account-a');

  const [, payload] = globalThis.__cloudTest.writes[0];
  assert.equal(payload.symbol, ' ');
  assert.match(payload.encrypted_password, /^paraules:v2:/);
  assert.equal(Object.hasOwn(payload, 'password'), false);
  assert.equal(JSON.stringify(payload).includes(message.password), false);
  assert.equal(await cloudCipher.decryptCloudValue(payload.encrypted_password, 'seed', 'account-a', 'base'), baseWord);
  const merged = await cloudSync.mergeLocalWithCloud('seed', true, 'account-a');
  assert.equal(merged[0].baseWord, baseWord);
  assert.equal(Object.hasOwn(merged[0], 'password'), false);
});

test('symbol remains an auxiliary value for spaces, emoji, symbols, and Unicode expansions', async () => {
  installLocalStorage();
  const records = [];
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => records,
    create: async (payload) => {
      records.push({ ...payload, id: `record-${records.length}`, created: '', updated: '' });
      return records.at(-1);
    },
  };

  for (const baseWord of [' Google🚀 ', '🚀base', '!base', 'ßeta']) {
    await cloudSync.upsertMessage(chatMessage(baseWord), 'seed', 'account-a');
    const record = records.at(-1);
    assert.equal(
      await cloudCipher.decryptCloudValue(record.encrypted_password, 'seed', 'account-a', 'base'),
      baseWord,
    );
  }

  assert.deepEqual(records.map(({ symbol }) => symbol), [' ', '🚀', '!', 'SS']);
  assert.equal(globalThis.__cloudTest.writes.filter(([method]) => method === 'create').length, 4);
});

test('v2 ciphertext and text fields exceeding the assumed 5000-character limit are rejected before writes', async () => {
  installLocalStorage();
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [],
  };

  await assert.rejects(
    cloudSync.upsertMessage(chatMessage('a'.repeat(3800)), 'seed', 'account-a'),
    /encrypted_password.*5000/i,
  );
  const longComment = chatMessage('short-base');
  longComment.comment = 'c'.repeat(3800);
  await assert.rejects(
    cloudSync.upsertMessage(longComment, 'seed', 'account-a'),
    /encrypted_comment.*5000/i,
  );
  const longAllowedSymbols = chatMessage('another-base');
  longAllowedSymbols.options.allowedSymbols = '!'.repeat(5001);
  await assert.rejects(
    cloudSync.upsertMessage(longAllowedSymbols, 'seed', 'account-a'),
    /allowed_symbols.*5000/i,
  );

  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('legacy ciphertext remains readable with its original normalized key and is rewritten as v2 on update', async () => {
  installLocalStorage();
  const legacy = cloudRecord('legacy', {
    symbol: ' ',
    encrypted_password: legacyEncrypt('  Google🚀 '),
    encrypted_comment: legacyEncrypt(' nota antiga '),
  });
  const originalPasswordCiphertext = legacy.encrypted_password;
  const originalCommentCiphertext = legacy.encrypted_comment;
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [legacy],
  };

  const [message] = await cloudSync.mergeLocalWithCloud('Sëed🚀', true, 'account-a');
  assert.equal(message.baseWord, '  Google🚀 ');
  assert.equal(message.comment, ' nota antiga ');
  assert.equal(Object.hasOwn(message, 'password'), false);
  await cloudSync.upsertMessage(chatMessage('  Google🚀 ', 'legacy'), 'Sëed🚀', 'account-a');
  assert.equal(globalThis.__cloudTest.writes.length, 1);
  assert.equal(globalThis.__cloudTest.writes[0][0], 'update');
  assert.match(globalThis.__cloudTest.writes[0][2].encrypted_password, /^paraules:v2:/);
  assert.notEqual(globalThis.__cloudTest.writes[0][2].encrypted_password, originalPasswordCiphertext);
  assert.equal(originalCommentCiphertext.length > 0, true);
});

test('exact base matching distinguishes case, symbols, and edge spaces during updates', async () => {
  installLocalStorage();
  const records = [
    await versionedRecord('upper', 'Google'),
    await versionedRecord('lower', 'google'),
    await versionedRecord('spaced', 'Google '),
  ];
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => records,
    update: async (id, fields) => ({ ...records.find((record) => record.id === id), ...fields }),
  };

  await cloudSync.upsertMessage(chatMessage('Google', 'local-id'), 'seed', 'account-a');

  const update = globalThis.__cloudTest.writes.find(([method]) => method === 'update');
  assert.equal(update[1], 'upper');
  assert.equal(globalThis.__cloudTest.writes.filter(([method]) => method === 'create').length, 0);
});

test('a timed-out create that committed is found on retry instead of duplicated', async () => {
  installLocalStorage();
  const records = [];
  let firstCreate = true;
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => records,
    create: async (payload) => {
      const record = { ...payload, id: 'remote-after-timeout', created: '', updated: '' };
      records.push(record);
      if (firstCreate) {
        firstCreate = false;
        throw new Error('network timeout after server commit');
      }
      return record;
    },
    update: async (id, fields) => ({ ...records.find((record) => record.id === id), ...fields }),
  };

  const message = chatMessage('retry-base', 'local-retry');
  await assert.rejects(cloudSync.upsertMessage(message, 'seed', 'account-a'), /network timeout/);
  await cloudSync.upsertMessage(message, 'seed', 'account-a');

  assert.equal(globalThis.__cloudTest.writes.filter(([method]) => method === 'create').length, 1);
  assert.equal(globalThis.__cloudTest.writes.filter(([method]) => method === 'update').length, 1);
});

test('an ambiguous failed create without a visible record stays blocked on retry', async () => {
  installLocalStorage();
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [],
    create: async () => { throw new Error('network timeout'); },
  };
  const message = chatMessage('uncertain-base', 'local-uncertain');

  await assert.rejects(cloudSync.upsertMessage(message, 'seed', 'account-a'), /network timeout/);
  await assert.rejects(cloudSync.upsertMessage(message, 'seed', 'account-a'), /resultat d’una creació anterior és incert/);
  assert.equal(globalThis.__cloudTest.writes.filter(([method]) => method === 'create').length, 1);
});

test('HTTP timeout and throttling responses preserve the uncertain-create retry marker', async () => {
  const mockStorage = installLocalStorage();
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [],
    create: async () => {
      const error = new Error('request timeout');
      error.status = 408;
      throw error;
    },
  };
  const message = chatMessage('uncertain-http-base');

  await assert.rejects(cloudSync.upsertMessage(message, 'seed', 'account-a'), /request timeout/);
  assert.equal([...mockStorage.values.keys()].some((key) => key.startsWith('pwgen.cloud_pending.')), true);
  await assert.rejects(cloudSync.upsertMessage(message, 'seed', 'account-a'), /resultat d’una creació anterior és incert/);
  assert.equal(globalThis.__cloudTest.writes.filter(([method]) => method === 'create').length, 1);
});

test('network and permission failures while reading never become an empty-list create', async () => {
  installLocalStorage();
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => { throw new Error('network timeout while listing'); },
  };

  await assert.rejects(cloudSync.upsertMessage(chatMessage('base'), 'seed', 'account-a'), /network timeout/);
  globalThis.__cloudTest.getFullList = async () => {
    const error = new Error('permission denied while listing');
    error.status = 403;
    throw error;
  };
  await assert.rejects(cloudSync.upsertMessage(chatMessage('base'), 'seed', 'account-a'), /permission denied/);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('permission rejection from create is surfaced and does not leave an uncertain retry marker', async () => {
  const mockStorage = installLocalStorage();
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [],
    create: async () => {
      const error = new Error('permission denied');
      error.status = 403;
      throw error;
    },
  };

  await assert.rejects(cloudSync.upsertMessage(chatMessage('permission-base'), 'seed', 'account-a'), /permission denied/);
  assert.equal([...mockStorage.values.keys()].some((key) => key.startsWith('pwgen.cloud_pending.')), false);
  assert.equal(globalThis.__cloudTest.writes.filter(([method]) => method === 'create').length, 1);
});

test('a successful cloud read preserves unmatched local messages and legacy passwords', async () => {
  const localMessage = chatMessage('local-only');
  localMessage.password = 'legacy-local-password';
  const matchingLocalMessage = chatMessage('same-base', 'local-id');
  matchingLocalMessage.password = 'legacy-cached-password';
  const records = [
    await versionedRecord('remote-match', 'same-base'),
    await versionedRecord('remote-only', 'remote-only'),
  ];
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => records,
  };

  const merged = await cloudSync.mergeLocalWithCloud(
    'seed',
    true,
    'account-a',
    [localMessage, matchingLocalMessage],
  );
  assert.deepEqual(merged.map(({ baseWord }) => baseWord), ['local-only', 'same-base', 'remote-only']);
  assert.equal(merged[0].password, 'legacy-local-password');
  assert.equal(merged[1].password, 'legacy-cached-password');
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('modified v2 ciphertext and a different master are reported as decryption failures', async () => {
  const valid = await versionedRecord('tampered', 'Unicode 🚀 ');
  const cloudCipherPrefix = 'paraules:v2:';
  const envelopeBytes = Buffer.from(valid.encrypted_password.slice(cloudCipherPrefix.length), 'base64url');
  envelopeBytes[envelopeBytes.length - 1] ^= 0x01;
  valid.encrypted_password = cloudCipherPrefix + envelopeBytes.toString('base64url');
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [valid],
  };

  await assert.rejects(cloudSync.mergeLocalWithCloud('seed', true, 'account-a'), /autenticar|desxifrar/);
  const untouched = await versionedRecord('wrong-master', 'base');
  globalThis.__cloudTest.getFullList = async () => [untouched];
  await assert.rejects(cloudSync.mergeLocalWithCloud('different full master', true, 'account-a'), /autenticar|desxifrar/);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('v2 ciphertext uses fresh nonces and is bound to the account and field', async () => {
  const first = await cloudCipher.encryptCloudValue(' Google 🚀 ', 'Mäster🚀', 'account-a', 'base');
  const second = await cloudCipher.encryptCloudValue(' Google 🚀 ', 'Mäster🚀', 'account-a', 'base');
  assert.notEqual(first, second);
  assert.equal(await cloudCipher.decryptCloudValue(first, 'Mäster🚀', 'account-a', 'base'), ' Google 🚀 ');
  await assert.rejects(cloudCipher.decryptCloudValue(first, 'Mäster🚀', 'account-b', 'base'));
  await assert.rejects(cloudCipher.decryptCloudValue(first, 'Mäster🚀', 'account-a', 'comment'));
});

test('does not reactivate a deleted record when an old local message is upserted', async () => {
  installLocalStorage();
  const deleted = await versionedRecord('deleted-id', 'alpha', { is_deleted: true });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [deleted],
  };

  await assert.rejects(
    cloudSync.upsertMessage(chatMessage('alpha', 'deleted-id'), 'seed', 'account-a'),
    /paperera.*Restaura-la explícitament/i,
  );
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('ordinary updates do not send or overwrite the deletion flag', async () => {
  installLocalStorage();
  const active = await versionedRecord('active-update');
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [active],
    update: async (id, fields) => ({ ...active, id, ...fields }),
  };

  await cloudSync.upsertMessage(chatMessage('alpha', 'active-update'), 'seed', 'account-a');

  const update = globalThis.__cloudTest.writes.find(([method]) => method === 'update');
  assert.equal(update[1], 'active-update');
  assert.equal(Object.hasOwn(update[2], 'is_deleted'), false);
});

test('saving a logo cannot reactivate a deleted record', async () => {
  const deleted = await versionedRecord('deleted-logo', 'alpha', { is_deleted: true });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [deleted],
  };

  await assert.rejects(
    cloudSync.saveMessageLogo(chatMessage('alpha', 'deleted-logo'), undefined, 'https://cdn.example/logo.png', 'seed', 'account-a'),
    /és a la paperera/,
  );
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('deletion uses the selected PocketBase ID when base words are duplicated', async () => {
  const selected = await versionedRecord('selected-id');
  const duplicate = await versionedRecord('duplicate-id', 'alpha', { password_length: 20 });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [selected, duplicate],
    update: async (id, fields) => ({ ...selected, id, ...fields }),
  };

  await cloudSync.markMessageDeleted(chatMessage('alpha', 'selected-id'), 'seed', 'account-a');

  const update = globalThis.__cloudTest.writes.find(([method]) => method === 'update');
  assert.equal(update[1], 'selected-id');
  assert.deepEqual(update[2], { is_deleted: true });
});

test('a remote record changed between resolution and mutation is left untouched', async () => {
  const resolved = await versionedRecord('racing-record', 'alpha', { updated: '2025-01-02T00:00:00Z' });
  const changed = await versionedRecord('racing-record', 'different base', { updated: '2025-01-03T00:00:00Z' });
  let readCount = 0;
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => {
      readCount += 1;
      return readCount === 1 ? [resolved] : [changed];
    },
  };

  await assert.rejects(
    cloudSync.markMessageDeleted(chatMessage('alpha', 'local-id'), 'seed', 'account-a'),
    /ha canviat durant l’operació/,
  );
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('the recycle bin queries only PocketBase and filters to deleted records owned by the current account', async () => {
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const queries = [];
  globalThis.localStorage = {
    getItem() { throw new Error('The recycle bin must not read local storage'); },
  };
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async (...args) => {
      queries.push(args);
      return [
        cloudRecord('deleted-owned', { is_deleted: true }),
        cloudRecord('active-owned'),
        cloudRecord('deleted-other', { user_id: 'account-b', is_deleted: true }),
      ];
    },
  };

  try {
    const records = await cloudSync.listDeletedCloudRecords('seed');
    assert.deepEqual(records.map(({ id }) => id), ['deleted-owned']);
    assert.match(queries[0][0].filter, /user_id = "account-a".*is_deleted = true/);
    assert.doesNotMatch(queries[0][0].filter, /is_deleted = false/);
    assert.deepEqual(globalThis.__cloudTest.writes, []);
    assert.doesNotMatch(recycleBinSource, /localStorage|sessionStorage|storage\.ts/);
  } finally {
    if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
    else delete globalThis.localStorage;
  }
});

test('the recycle bin resolves external logos from logo_url when there is no uploaded file', async () => {
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [
      cloudRecord('deleted-url-logo', {
        is_deleted: true,
        logo: null,
        logo_url: 'https://cdn.example.test/removed-logo.png',
      }),
    ],
  };

  const [record] = await cloudSync.listDeletedCloudRecords('seed');
  assert.equal(record.logoUrl, 'https://cdn.example.test/removed-logo.png');
});

test('restoring a deleted record changes only its deletion flag', async () => {
  const deleted = await versionedRecord('restore-id', 'alpha', { is_deleted: true });
  const originalCiphertext = deleted.encrypted_password;
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [deleted],
    update: async (id, fields) => ({ ...deleted, id, ...fields }),
  };

  await cloudSync.restoreDeletedCloudRecord('restore-id', 'seed');

  const update = globalThis.__cloudTest.writes.find(([method]) => method === 'update');
  assert.equal(update[1], 'restore-id');
  assert.deepEqual(update[2], { is_deleted: false });
  assert.equal(deleted.encrypted_password, originalCiphertext);
  assert.match(deleted.encrypted_comment, /^paraules:v2:/);
  assert.equal(deleted.logo, 'logo.png');
  assert.equal(deleted.password_length, 10);
});

test('a pending restore is stopped if the authenticated account changes before mutation', async () => {
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

  const pendingRestore = cloudSync.restoreDeletedCloudRecord('restore-pending', 'seed');
  await started;
  globalThis.__cloudTest.user = { id: 'account-b' };
  cloudSync.cancelCloudSyncRequests('account-a');
  releaseQuery([await versionedRecord('restore-pending', 'alpha', { is_deleted: true })]);

  await assert.rejects(pendingRestore, /sessió del compte ha canviat/);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
  assert.equal(globalThis.__cloudTest.cancelled.length, 1);
});

test('permanent deletion is confirmed in the recycle-bin UI and calls PocketBase with the selected ID', async () => {
  const deleted = await versionedRecord('permanent-id', 'alpha', { is_deleted: true });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [deleted],
    delete: async () => true,
  };

  await cloudSync.permanentlyDeleteCloudRecord('permanent-id', 'seed');

  const deletion = globalThis.__cloudTest.writes.find(([method]) => method === 'delete');
  assert.equal(deletion[1], 'permanent-id');
  assert.match(recycleBinSource, /window\.confirm\(/);
  assert.match(recycleBinSource, /permanentlyDeleteCloudRecord\(record\.id, seedWord\)/);
  assert.match(recycleBinSource, /Aquesta acció no es pot desfer/);
});

test('a permanent-delete permission error is shown and does not remove the trash record', async () => {
  const cannotDelete = await versionedRecord('cannot-delete', 'alpha', { is_deleted: true });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [cannotDelete],
    delete: async () => { throw new Error('permission denied'); },
  };

  await assert.rejects(cloudSync.permanentlyDeleteCloudRecord('cannot-delete', 'seed'), /permission denied/);
  assert.match(recycleBinSource, /catch \(deleteError\)[\s\S]*setError/);
  assert.match(recycleBinSource, /await permanentlyDeleteCloudRecord\(record\.id, seedWord\)/);
});

test('a false PocketBase delete result is reported as a failure', async () => {
  const deleteFalse = await versionedRecord('delete-false', 'alpha', { is_deleted: true });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [deleteFalse],
    delete: async () => false,
  };

  await assert.rejects(cloudSync.permanentlyDeleteCloudRecord('delete-false', 'seed'), /no ha confirmat l’eliminació permanent/);
});

test('network or permission errors from deletion are propagated instead of reported as success', async () => {
  const active = await versionedRecord('network-delete');
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [active],
    update: async () => { throw new Error('permission denied'); },
  };

  await assert.rejects(
    cloudSync.markMessageDeleted(chatMessage('alpha', 'network-delete'), 'seed', 'account-a'),
    /permission denied/,
  );
  assert.match(chatScreenSource, /catch \(deleteError\)[\s\S]*setCloudOperationError/);
  assert.match(chatScreenSource, /if \(message\) await onCloudMessageDelete\?\.\(message\);[\s\S]*catch[\s\S]*return;/);
});

test('a pending delete is stopped if the authenticated account changes before mutation', async () => {
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

  const pendingDelete = cloudSync.markMessageDeleted(chatMessage('alpha', 'record-a'), 'seed', 'account-a');
  await started;
  globalThis.__cloudTest.user = { id: 'account-b' };
  cloudSync.cancelCloudSyncRequests('account-a');
  releaseQuery([await versionedRecord('record-a')]);

  await assert.rejects(pendingDelete, /sessió del compte ha canviat/);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
  assert.equal(globalThis.__cloudTest.cancelled.length, 1);
});

test('the normal cloud list and initial synchronization still omit deleted records', async () => {
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async (...args) => {
      assert.match(args[0].filter, /user_id = "account-a"/);
      assert.doesNotMatch(args[0].filter, /is_deleted = false/);
      return [cloudRecord('visible'), cloudRecord('deleted', { is_deleted: true })];
    },
  };

  const messages = await cloudSync.mergeLocalWithCloud('seed', true, 'account-a');

  assert.deepEqual(messages.map(({ id }) => id), ['visible']);
});

test('active records cannot be permanently deleted from the recycle bin', async () => {
  const active = await versionedRecord('active-id');
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [active],
  };

  await assert.rejects(cloudSync.permanentlyDeleteCloudRecord('active-id', 'seed'), /és activa/);
  assert.deepEqual(globalThis.__cloudTest.writes, []);
});

test('resolves direct HTTP(S) image URLs and known brand domains, rejecting invalid URL schemes', () => {
  assert.equal(logo.resolveLogoInput(' https://cdn.example.test/logo.png ', 'token').url, 'https://cdn.example.test/logo.png');
  assert.equal(logo.resolveLogoInput('WhatsApp', 'test-token').url, 'https://img.logo.dev/whatsapp.com?token=test-token&size=128&format=png');
  assert.throws(() => logo.resolveLogoInput('javascript:alert(1)', 'test-token'), /domini conegut|URL completa/);
  assert.throws(() => logo.resolveLogoInput('http://', 'test-token'), /URL no és vàlida/);
  assert.throws(() => logo.resolveLogoInput('Netflix', ''), /VITE_LOGODEV_TOKEN/);
  assert.match(passwordBubbleSource, /type="file" accept="image\/\*"/);
  assert.match(passwordBubbleSource, /logoQuery\.trim\(\)[\s\S]*?setTimeout/);
  assert.match(passwordBubbleSource, /resolveLogoInput\(logoQuery/);
  assert.match(passwordBubbleSource, /onError=\{\(\) => \{ setLogoLoading\(false\); setLogoError\(/);
  assert.doesNotMatch(passwordBubbleSource, /fetch\(/);
});

test('saves a URL in logo_url and clears the previous file field', async () => {
  const record = await versionedRecord('record-a', 'alpha', { logo: 'old-logo.png', logo_url: '' });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [record],
    update: async () => record,
  };

  const savedUrl = await cloudSync.saveMessageLogo(chatMessage('alpha'), undefined, 'https://cdn.example.test/new-logo.png', 'seed', 'account-a');
  assert.equal(savedUrl, 'https://cdn.example.test/new-logo.png');
  const update = globalThis.__cloudTest.writes.find(([method]) => method === 'update');
  assert.deepEqual(update[2], { logo: [], logo_url: 'https://cdn.example.test/new-logo.png' });
  assert.match(passwordBubbleSource, /onSaveChanges\(changes\)/);
  assert.match(passwordBubbleSource, /changes\.logoChange =/);
  assert.match(passwordBubbleSource, /Treu-lo/);
});

test('uploads a selected local image as a file and clears the previous URL', async () => {
  const record = await versionedRecord('record-a', 'alpha', { logo: null, logo_url: 'https://cdn.example.test/old-logo.png' });
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => [record],
    update: async () => ({ ...record, logo: 'new-logo.png', logo_url: '' }),
  };

  const image = new Blob(['test-image'], { type: 'image/png' });
  const savedUrl = await cloudSync.saveMessageLogo(chatMessage('alpha'), image, undefined, 'seed', 'account-a');
  assert.equal(savedUrl, 'https://pocketbase.test/files/new-logo.png');
  const update = globalThis.__cloudTest.writes.find(([method]) => method === 'update');
  assert.ok(update[2] instanceof FormData);
  assert.equal(update[2].get('logo').type, 'image/png');
  assert.equal(update[2].get('logo_url'), '');
});

test('restores file logos with priority, URL logos, and legacy locally saved logo URLs', async () => {
  const records = [
    cloudRecord('file', { encrypted_password: 'file-brand', symbol: 'F', logo: 'brand.png', logo_url: 'https://old.example/ignored.png' }),
    cloudRecord('url', { encrypted_password: 'url-brand', symbol: 'U', logo: null, logo_url: 'https://cdn.example.test/url-logo.png' }),
  ];
  globalThis.__cloudTest = {
    user: { id: 'account-a' },
    writes: [],
    cancelled: [],
    getFullList: async () => records,
  };

  const messages = await cloudSync.mergeLocalWithCloud('seed', true, 'account-a');
  assert.deepEqual(messages.map(({ logoUrl }) => logoUrl), [
    'https://pocketbase.test/files/brand.png',
    'https://cdn.example.test/url-logo.png',
  ]);
  installLocalStorage();
  storage.setChatMessages([chatMessage('legacy-url', 'legacy-id')].map((message) => ({
    ...message,
    logoUrl: 'https://legacy.example/logo.png',
  })));
  assert.equal(storage.getChatMessages()[0].logoUrl, 'https://legacy.example/logo.png');
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
  assert.match(unlockScreenSource, /decrypted = decryptSeed\(encrypted, pin\)/);
  assert.match(unlockScreenSource, /decrypted = await unlockSeedVault\(JSON\.parse\(rawVault\), pin\)/);
  assert.doesNotMatch(unlockScreenSource, /recoverySecret|Secret de recuperació/);
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

test('focuses the PIN only when the field is enabled', () => {
  assert.match(unlockScreenSource, /const canEnterPin = !!pinSecurity\.status && pinSecurity\.status\.remainingMs <= 0/);
  assert.match(unlockScreenSource, /if \(!canEnterPin\) return;[\s\S]*input\??\.isConnected && !input\.disabled[\s\S]*input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(unlockScreenSource, /ref=\{pinInputRef\}/);
  assert.doesNotMatch(unlockScreenSource, /autoFocus/);
});

test('focuses the base-word input only on the first chat entry', () => {
  assert.match(appSource, /if \(!hasOpenedChatRef\.current\)[\s\S]*setFocusBaseWordOnMount\(true\)/);
  assert.match(chatScreenSource, /if \(!focusBaseWordOnMount\) return;[\s\S]*requestAnimationFrame[\s\S]*input\??\.isConnected && !input\.disabled[\s\S]*input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(chatScreenSource, /onInitialFocusComplete\(\)/);
  assert.doesNotMatch(chatScreenSource, /inputRef\.current\?\.select/);
});

test('unmounts the chat during PIN lock and restores focused field selection after unlock', () => {
  assert.match(appSource, /chatSessionMounted && state === 'unlocked' && \([\s\S]*<div ref=\{chatContainerRef\}>[\s\S]*<ChatScreen/);
  assert.match(appSource, /const snapshot = captureFocusedElement\(chatContainerRef\.current\);[\s\S]*if \(snapshot\) focusSnapshotRef\.current = snapshot/);
  assert.match(appSource, /snapshot\.element\.focus\(\{ preventScroll: true \}\)/);
  assert.match(appSource, /snapshot\.element\.setSelectionRange\([\s\S]*snapshot\.selectionStart[\s\S]*snapshot\.selectionEnd/);
  assert.match(appSource, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(appSource, /window\.addEventListener\('blur', onWindowBlur\)/);
  assert.match(appSource, /function onWindowBlur\(\) \{\s*rememberFocusedElement\(\);\s*\}/);
  assert.match(appSource, /setSeedWord\(''\)[\s\S]*setState\('locked'\)/);
});

function readPinSecurityStatusSource() {
  return /if \(!currentSecurity\.status\)[\s\S]*return;/.test(unlockScreenSource);
}
