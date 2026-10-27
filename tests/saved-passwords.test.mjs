import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

async function importSource(source, fileName) {
  return import(`data:text/javascript;base64,${Buffer.from(transpile(source, fileName)).toString('base64')}`);
}

const encryptionSource = await readFile(new URL('../src/lib/passwordEncryption.ts', import.meta.url), 'utf8');
const encryption = await importSource(encryptionSource, 'passwordEncryption.ts');
const savedPasswordCryptoSource = await readFile(new URL('../src/lib/savedPasswordCrypto.ts', import.meta.url), 'utf8');
const savedPasswordCryptoJavascript = transpile(savedPasswordCryptoSource, 'savedPasswordCrypto.ts')
  .replaceAll("'@/lib/passwordEncryption'", JSON.stringify(`data:text/javascript,export const encryptExistingPassword=(...args)=>globalThis.__passwordCrypto.encryptExistingPassword(...args);export const decryptExistingPassword=(...args)=>globalThis.__passwordCrypto.decryptExistingPassword(...args);`));
globalThis.__passwordCrypto = encryption;
const savedPasswordCrypto = await import(`data:text/javascript;base64,${Buffer.from(savedPasswordCryptoJavascript).toString('base64')}`);
const storageSource = await readFile(new URL('../src/lib/storage.ts', import.meta.url), 'utf8');
const storage = await importSource(storageSource, 'storage.ts');
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const chatScreenSource = await readFile(new URL('../src/components/ChatScreen.tsx', import.meta.url), 'utf8');
const passwordBubbleSource = await readFile(new URL('../src/components/PasswordBubble.tsx', import.meta.url), 'utf8');
const savedPasswordCardsSource = await readFile(new URL('../src/components/SavedPasswordCards.tsx', import.meta.url), 'utf8');
const passwordCardVisualsSource = await readFile(new URL('../src/components/PasswordCardVisuals.tsx', import.meta.url), 'utf8');
const optionsPanelSource = await readFile(new URL('../src/components/OptionsPanel.tsx', import.meta.url), 'utf8');
const syncSource = await readFile(new URL('../src/lib/savedPasswords.ts', import.meta.url), 'utf8');
const mockCloudInfraUrl = `data:text/javascript,
  export function assertCurrentUser(userId) {
    if (globalThis.__savedPasswordTest.user?.id !== userId) throw new Error('AUTH_CHANGED');
  }
  export async function withUserRequest(userId, request) {
    assertCurrentUser(userId);
    return request('mock-request');
  }
  export async function withCloudSyncLock(callback) {
    return callback();
  }
`;
const mockPocketBaseUrl = `data:text/javascript,
  export function getCloudUser() { return globalThis.__savedPasswordTest.user; }
  export const pb = {
    collection: () => ({
      getFullList: async (...args) => {
        globalThis.__savedPasswordTest.reads.push(args);
        if (globalThis.__savedPasswordTest.readError) throw globalThis.__savedPasswordTest.readError;
        return globalThis.__savedPasswordTest.records;
      },
      create: async (payload) => {
        globalThis.__savedPasswordTest.writes.push(['create', payload]);
        const record = { id: 'pb-record', created: '2026-01-01', updated: '2026-01-02', ...payload };
        globalThis.__savedPasswordTest.records.push(record);
        return record;
      },
      update: async (id, payload) => {
        globalThis.__savedPasswordTest.writes.push(['update', id, payload]);
        const record = globalThis.__savedPasswordTest.records.find((item) => item.id === id);
        Object.assign(record, payload, { updated: '2026-01-03' });
        return record;
      },
    }),
  };
`;
const syncJavascript = transpile(syncSource, 'savedPasswords.ts')
  .replaceAll("'@/lib/cloudSync'", JSON.stringify(mockCloudInfraUrl))
  .replaceAll("'@/lib/pocketbase'", JSON.stringify(mockPocketBaseUrl));
const savedPasswords = await import(`data:text/javascript;base64,${Buffer.from(syncJavascript).toString('base64')}`);
const MASTER = 'thisisapocmasterkeywithmorethan25chars';
const PASSWORD = 'Artificial-Password-Only-For-Tests!';
const NAME = 'Artificial test entry';

function setMock() {
  const mock = {
    user: { id: 'account-a' },
    reads: [],
    writes: [],
    records: [],
    readError: null,
  };
  globalThis.__savedPasswordTest = mock;
  return mock;
}

async function makeLocalRecord(id = 'local-id') {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id,
    encryptedName: await savedPasswordCrypto.encryptSavedPasswordField(NAME, MASTER, 'name'),
    encryptedPassword: await savedPasswordCrypto.encryptSavedPasswordField(PASSWORD, MASTER, 'password'),
    createdAt: now,
    updatedAt: now,
    syncState: 'pending',
    deleted: false,
  };
}

test('stores encrypted fields locally and retrieves them on a second device using the same master', async () => {
  const localStorageValues = new Map();
  globalThis.localStorage = {
    getItem: (key) => localStorageValues.get(key) ?? null,
    setItem: (key, value) => localStorageValues.set(key, String(value)),
  };
  const record = await makeLocalRecord();
  storage.setSavedPasswordRecords([record], 'account-a');
  const raw = localStorageValues.get('pwgen.saved_passwords.account-a');

  assert.equal(raw.includes(PASSWORD), false);
  assert.equal(raw.includes(NAME), false);
  const secondDeviceCopy = storage.getSavedPasswordRecords('account-a')[0];
  assert.equal(await savedPasswordCrypto.decryptSavedPasswordField(secondDeviceCopy.encryptedName, MASTER, 'name'), NAME);
  assert.equal(await savedPasswordCrypto.decryptSavedPasswordField(secondDeviceCopy.encryptedPassword, MASTER, 'password'), PASSWORD);
  await assert.rejects(savedPasswordCrypto.decryptSavedPasswordField(secondDeviceCopy.encryptedName, MASTER, 'password'), /no correspon al camp esperat/);
  await assert.rejects(
    savedPasswordCrypto.decryptSavedPasswordField(secondDeviceCopy.encryptedPassword, 'wrongmasterkeywithmorethan25characters', 'password'),
  );
});

test('encrypts saved-password notes and icon with the service name', async () => {
  const notes = 'Recovery email verified';
  const icon = '🌐';
  const logoUrl = 'https://example.test/logo.png';
  const encryptedName = await savedPasswordCrypto.encryptSavedPasswordField(NAME, MASTER, 'name', { notes, icon, logoUrl });
  const decoded = await savedPasswordCrypto.decryptSavedPasswordDetails(encryptedName, MASTER);

  assert.deepEqual(decoded, { name: NAME, notes, icon, logoUrl });
  assert.equal(JSON.stringify(encryptedName).includes(notes), false);
  assert.equal(JSON.stringify(encryptedName).includes(icon), false);
  assert.equal(JSON.stringify(encryptedName).includes(logoUrl), false);
  assert.deepEqual(
    await savedPasswordCrypto.decryptSavedPasswordDetails(
      await savedPasswordCrypto.encryptSavedPasswordField(NAME, MASTER, 'name'),
      MASTER,
    ),
    { name: NAME, notes: '', icon: '🔐' },
  );
});

test('sync sends only encrypted name and password, and a second device can decrypt them', async () => {
  const mock = setMock();
  const local = await makeLocalRecord();
  const [synced] = await savedPasswords.synchronizeSavedPasswords([local], 'account-a');

  assert.match(mock.reads[0][0].filter, /type = "B"/);
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.writes[0][0], 'create');
  const payload = mock.writes[0][1];
  assert.deepEqual(Object.keys(payload).sort(), [
    'allowed_symbols',
    'device_id',
    'encrypted_comment',
    'encrypted_password',
    'is_deleted',
    'lowercase',
    'numbers',
    'password_length',
    'symbol',
    'symbols',
    'type',
    'uppercase',
    'user_id',
  ]);
  assert.equal(payload.type, 'B');
  assert.equal(payload.encrypted_password.includes(NAME), false);
  assert.equal(payload.encrypted_password.includes(PASSWORD), false);
  assert.equal(payload.user_id, 'account-a');
  assert.equal(synced.syncState, 'synced');

  const [downloaded] = await savedPasswords.synchronizeSavedPasswords([], 'account-a');
  assert.equal(await savedPasswordCrypto.decryptSavedPasswordField(downloaded.encryptedName, MASTER, 'name'), NAME);
  assert.equal(await savedPasswordCrypto.decryptSavedPasswordField(downloaded.encryptedPassword, MASTER, 'password'), PASSWORD);
});

test('Part A records are never interpreted as Part B records', async () => {
  const mock = setMock();
  mock.records.push({
    id: 'part-a',
    type: 'A',
    user_id: 'account-a',
    encrypted_password: 'not-a-Part-B-payload',
    is_deleted: false,
    created: '2026-01-01',
    updated: '2026-01-02',
  });

  await assert.rejects(savedPasswords.listCloudSavedPasswords('account-a'), /no són fitxes B/);
});

test('metadata updates preserve password ciphertext and deletion is a tombstone', async () => {
  const mock = setMock();
  const local = await makeLocalRecord();
  const [synced] = await savedPasswords.synchronizeSavedPasswords([local], 'account-a');
  const newName = await savedPasswordCrypto.encryptSavedPasswordField('Renamed test entry', MASTER, 'name');

  const updated = await savedPasswords.syncSavedPassword({
    ...synced,
    encryptedName: newName,
    updatedAt: '2026-01-04T00:00:00.000Z',
  }, 'account-a');
  assert.equal(updated.cloudUpdatedAt, '2026-01-03');
  const update = mock.writes.find(([method]) => method === 'update');
  assert.deepEqual(JSON.parse(update[2].encrypted_password), {
    format: 'paraules-saved-password:v1',
    clientId: local.id,
    encryptedName: newName,
    encryptedPassword: local.encryptedPassword,
  });
  assert.equal(update[2].type, 'B');
  assert.equal(update[2].is_deleted, false);

  await savedPasswords.syncSavedPassword({
    ...synced,
    encryptedName: newName,
    cloudUpdatedAt: updated.cloudUpdatedAt,
    cloudSnapshot: updated.cloudSnapshot,
    deleted: true,
  }, 'account-a');
  const deleteUpdate = mock.writes.filter(([method]) => method === 'update').at(-1);
  assert.equal(deleteUpdate[2].type, 'B');
  assert.equal(deleteUpdate[2].is_deleted, true);
  assert.deepEqual(JSON.parse(deleteUpdate[2].encrypted_password), {
    format: 'paraules-saved-password:v1',
    clientId: local.id,
    encryptedName: newName,
    encryptedPassword: local.encryptedPassword,
  });
});

test('refuses stale cloud edits and account changes without writing', async () => {
  const mock = setMock();
  const local = await makeLocalRecord();
  const [synced] = await savedPasswords.synchronizeSavedPasswords([local], 'account-a');
  const remotePayload = JSON.parse(mock.records[0].encrypted_password);
  remotePayload.encryptedName = await savedPasswordCrypto.encryptSavedPasswordField('Changed remotely', MASTER, 'name');
  mock.records[0].encrypted_password = JSON.stringify(remotePayload);

  await assert.rejects(
    savedPasswords.syncSavedPassword({
      ...synced,
      encryptedName: await savedPasswordCrypto.encryptSavedPasswordField('Conflicting name', MASTER, 'name'),
    }, 'account-a'),
    /conflict|canviat/i,
  );
  const writeCount = mock.writes.length;

  mock.user = { id: 'account-b' };
  await assert.rejects(savedPasswords.listCloudSavedPasswords('account-a'), /AUTH_CHANGED/);
  assert.equal(mock.writes.length, writeCount);
});

test('a failed cloud read does not discard the local encrypted records', async () => {
  const mock = setMock();
  mock.readError = new Error('offline');
  const local = await makeLocalRecord();

  await assert.rejects(savedPasswords.synchronizeSavedPasswords([local], 'account-a'), /offline/);
  assert.equal(local.id, 'local-id');
  assert.equal(await savedPasswordCrypto.decryptSavedPasswordField(local.encryptedPassword, MASTER, 'password'), PASSWORD);
  assert.deepEqual(mock.writes, []);
});

test('Part A cards do not expose the Part B save action and Part B syncs only when enabled', () => {
  assert.doesNotMatch(passwordBubbleSource, /Desa la contrasenya|onSavePassword/);
  assert.match(chatScreenSource, /setSavedPasswordRecords\(savedPasswordRecords/);
  assert.match(chatScreenSource, /if \(!cloudActionsEnabled \|\| !cloudUserId\) return/);
  assert.match(chatScreenSource, /<SavedPasswordCards/);
  assert.match(appSource, /const cloudActionsEnabled = true/);
  assert.doesNotMatch(chatScreenSource, /localStorage\.setItem\([^,]+,\s*(?:password|pendingSavedPassword)/);
});

test('Part B opens an editable password card with encrypted metadata and matching actions', () => {
  assert.match(chatScreenSource, /setNewSavedPasswordDraft\(\{ id: crypto\.randomUUID\(\), password: baseWord \}\)/);
  assert.match(chatScreenSource, /aria-label="Desa a la Part B"/);
  assert.match(savedPasswordCardsSource, /initialPassword=\{draft\.password\}/);
  assert.match(savedPasswordCardsSource, /Nom o servei/);
  assert.match(savedPasswordCardsSource, /Observacions/);
  assert.match(savedPasswordCardsSource, /Canvia la icona/);
  assert.match(savedPasswordCardsSource, /logoUrl: details\.logoUrl/);
  assert.match(savedPasswordCardsSource, /Copia la contrasenya/);
  assert.match(savedPasswordCardsSource, /Mostra la contrasenya/);
  assert.match(savedPasswordCardsSource, /Esborra la contrasenya/);
  assert.match(savedPasswordCardsSource, /encryptSavedPasswordField\(details\.name\.trim\(\), seedWord, 'name', \{/);
  assert.match(savedPasswordCardsSource, /encryptSavedPasswordField\(password, seedWord, 'password'\)/);
  assert.match(savedPasswordCardsSource, /onUpdate\(record\.id, encryptedName, encryptedPassword\)/);
  assert.match(savedPasswordCardsSource, /Paràmetres per regenerar/);
  assert.match(savedPasswordCardsSource, /record && regenerationPanelOpen &&/);
  assert.match(savedPasswordCardsSource, /La contrasenya actual se substituirà per una de nova amb aquests paràmetres/);
  assert.match(savedPasswordCardsSource, /Sí, regenera/);
  assert.match(savedPasswordCardsSource, /Cancel·la/);
  assert.doesNotMatch(chatScreenSource, /SavedPasswordsModal/);
  assert.match(chatScreenSource, /w-12 h-12 flex-shrink-0 rounded-2xl/);
});

test('confirming regeneration converts the saved entry into a Part A message', () => {
  assert.match(chatScreenSource, /onConvertToPartA=\{handleConvertSavedPasswordToPartA\}/);
  assert.match(chatScreenSource, /baseWord: details\.name/);
  assert.match(chatScreenSource, /comment: details\.notes/);
  assert.match(chatScreenSource, /deleted: true/);
  assert.match(chatScreenSource, /options,/);
  assert.match(chatScreenSource, /onCloudMessageChange\?\.\(message\)/);
  assert.match(savedPasswordCardsSource, /await onConvertToPartA\(record\.id, details, regenerationOptions\)/);
  assert.match(passwordBubbleSource, /generatePassword\(seedWord, baseWord, options\)/);
  assert.match(passwordBubbleSource, /setPendingRegenerationOptions\(regenerationOptions\)/);
  assert.doesNotMatch(passwordBubbleSource, /onRegenerate\(regenerationOptions\)/);
  assert.match(passwordBubbleSource, /onSaveChanges\(changes\)/);
  assert.match(passwordBubbleSource, /Desa els canvis/);
});

test('Part A and Part B cards share their surface, icon, and aligned action bar', () => {
  assert.match(passwordBubbleSource, /<PasswordCardSurface>/);
  assert.match(savedPasswordCardsSource, /<PasswordCardSurface>/);
  assert.match(passwordBubbleSource, /<PasswordCardIcon/);
  assert.match(savedPasswordCardsSource, /<PasswordCardIcon/);
  assert.match(passwordBubbleSource, /<PasswordCardActions actions=\{\[/);
  assert.match(savedPasswordCardsSource, /<PasswordCardActions actions=\{\[/);
  assert.match(passwordCardVisualsSource, /grid-cols-4 gap-2 min-\[430px\]:grid-cols-6/);
});

test('settings show the logged-in email and the main screen counts visible Part A and B records', () => {
  assert.match(optionsPanelSource, /Sessió iniciada al núvol/);
  assert.match(optionsPanelSource, /No has iniciat sessió al núvol/);
  assert.match(optionsPanelSource, /\{cloudUser\.email \|\| 'Correu electrònic no disponible'\}/);
  assert.match(chatScreenSource, /visibleRecordCount = displayItems\.length \+ \(showDraft \? 1 : 0\)/);
  assert.match(chatScreenSource, /typeFilter !== 'B'/);
  assert.match(chatScreenSource, /typeFilter !== 'A'/);
  assert.match(chatScreenSource, /Només Part A/);
  assert.match(chatScreenSource, /Només Part B/);
  assert.match(chatScreenSource, /Per entrada/);
  assert.match(chatScreenSource, /registre mostrat/);
  assert.match(chatScreenSource, /registres mostrats/);
});
