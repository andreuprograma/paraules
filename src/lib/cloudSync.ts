import CryptoJS from 'crypto-js';
import { ChatMessage, MessageOptions } from '@/lib/storage';
import { normalizeSeed } from '@/lib/passwordGenerator';
import { decryptCloudValue, encryptCloudValue, isVersionedCloudCiphertext } from '@/lib/cloudCipher';
import { getCloudUser, pb } from '@/lib/pocketbase';

export interface CloudPasswordRecord {
  id: string;
  user_id: string;
  type: 'A' | 'B';
  symbol: string;
  encrypted_password: string;
  encrypted_comment?: string;
  logo?: string | string[] | null;
  logo_url?: string;
  password_length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  allowed_symbols?: string;
  device_id?: string;
  is_deleted: boolean;
  created: string;
  updated: string;
}

export interface DecodedRecord {
  id: string;
  baseWord: string;
  comment: string;
  options: MessageOptions;
  isDeleted: boolean;
  created: string;
  updated: string;
}

export interface CloudInspectionRecord {
  id: string;
  userId: string;
  symbol: string;
  baseWord: string;
  comment: string;
  logoFilename: string;
  logoUrl?: string;
  logoExternalUrl: string;
  passwordLength: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  allowedSymbols: string;
  deviceId: string;
  cipherFormat: 'legacy' | 'v2';
  isDeleted: boolean;
  created: string;
  updated: string;
}

export async function listUserRecords(seedWord: string, includeDeleted = false): Promise<DecodedRecord[]> {
  const user = getCloudUser();
  if (!user) throw new Error('Inicia sessió al núvol per consultar les fitxes.');
  return withCloudSyncLock(async () => {
    assertCurrentUser(user.id);
    const userFilter = `user_id = "${escapeFilterValue(user.id)}" && type = "${PART_A_TYPE}"${includeDeleted ? '' : ' && is_deleted = false'}`;
    const records = await withUserRequest(user.id, (requestKey) =>
      pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
        filter: userFilter,
        sort: '-created',
        requestKey,
      }),
    );
    assertCurrentUser(user.id);
    return Promise.all(records.filter((record) => record.user_id === user.id && record.type === PART_A_TYPE).map(async (record) => {
      const baseWord = await decryptRecordBase(record, seedWord, user.id);
      const comment = record.encrypted_comment
        ? await decryptCloud(record.encrypted_comment, seedWord, user.id, 'comment')
        : { value: '', format: baseWord.format };
      return {
        id: record.id,
        baseWord: baseWord.value,
        comment: comment.value,
        options: optionsFromRecord(record),
        isDeleted: record.is_deleted,
        created: record.created,
        updated: record.updated,
      };
    }));
  });
}

export async function listCloudInspectionRecords(
  seedWord: string,
  includeDeleted = false,
): Promise<CloudInspectionRecord[]> {
  const user = getCloudUser();
  if (!user) throw new Error('Inicia sessió al núvol per consultar la base de dades.');
  const userId = user.id;

  const records = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: userRecordFilter(userId, includeDeleted),
      sort: '-created',
      requestKey,
    }),
  );
  assertCurrentUser(userId);

  return Promise.all(records
    .filter((record) => record.user_id === userId && record.type === PART_A_TYPE)
    .map((record) => inspectionFromRecord(record, seedWord, userId)));
}

export async function listDeletedCloudRecords(seedWord: string): Promise<CloudInspectionRecord[]> {
  const user = getCloudUser();
  if (!user) throw new Error('Inicia sessió al núvol per consultar la paperera.');
  const userId = user.id;
  const records = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: `${userRecordFilter(userId, true)} && is_deleted = true`,
      sort: '-updated',
      requestKey,
    }),
  );
  assertCurrentUser(userId);
  return Promise.all(records
    .filter((record) => record.user_id === userId && record.type === PART_A_TYPE && record.is_deleted)
    .map((record) => inspectionFromRecord(record, seedWord, userId)));
}

export async function updateRecordFields(
  recordId: string,
  fields: { comment?: string; baseWord?: string; options?: MessageOptions },
  seedWord: string,
): Promise<void> {
  const user = getCloudUser();
  if (!user) throw new Error('Inicia sessió al núvol per modificar les fitxes.');
  assertCurrentUser(user.id);
  const record = await getOwnedRecord(recordId, user.id);
  assertCanMutateRecord(record);
  const update: Record<string, unknown> = {};
  if (fields.baseWord !== undefined) {
    update.encrypted_password = await encryptCloud(fields.baseWord, seedWord, user.id, 'base');
  }
  if (fields.comment !== undefined) {
    update.encrypted_comment = fields.comment
      ? await encryptCloud(fields.comment, seedWord, user.id, 'comment')
      : '';
  }
  if (fields.options) {
    const allowedSymbols = fields.options.allowedSymbols || '';
    assertTextFieldLength('allowed_symbols', allowedSymbols);
    update.password_length = fields.options.length;
    update.uppercase = fields.options.uppercase;
    update.lowercase = fields.options.lowercase;
    update.numbers = fields.options.numbers;
    update.symbols = fields.options.symbols;
    update.allowed_symbols = allowedSymbols;
  }
  assertCurrentUser(user.id);
  await withUserRequest(user.id, (requestKey) =>
    pb.collection(COLLECTION).update(recordId, update, { requestKey }),
  );
  assertCurrentUser(user.id);
}

const DEVICE_ID_KEY = 'pwgen.device_id';
const PENDING_CREATE_PREFIX = 'pwgen.cloud_pending.';
const COLLECTION = 'paraules_paraules';
const MAX_TEXT_FIELD_LENGTH = 5000;
const PART_A_TYPE = 'A' as const;

function assertTextFieldLength(field: string, value: string): void {
  if (Array.from(value).length > MAX_TEXT_FIELD_LENGTH) {
    throw new Error(
      `El camp ${field} supera el límit local assumit de ${MAX_TEXT_FIELD_LENGTH} caràcters. No s’ha enviat cap canvi.`,
    );
  }
}

function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function assertCurrentUser(userId: string): void {
  if (getCloudUser()?.id !== userId) {
    throw new Error('La sessió del compte ha canviat; s’ha aturat la sincronització.');
  }
}

function assertVersionedRecord(record: CloudPasswordRecord): void {
  if (record.type !== PART_A_TYPE) {
    throw new Error('El registre no és una fitxa automàtica; no s’ha modificat.');
  }
}

function assertCanMutateRecord(record: CloudPasswordRecord): void {
  assertVersionedRecord(record);
}

async function getOwnedRecord(recordId: string, userId: string): Promise<CloudPasswordRecord> {
  assertCurrentUser(userId);
  const records = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: `id = "${escapeFilterValue(recordId)}" && user_id = "${escapeFilterValue(userId)}" && type = "${PART_A_TYPE}"`,
      requestKey,
    }),
  );
  assertCurrentUser(userId);
  const record = records.find((candidate) =>
    candidate.id === recordId && candidate.user_id === userId && candidate.type === PART_A_TYPE,
  );
  if (!record) throw new Error('El registre no pertany al compte autenticat o ja no existeix.');
  return record;
}

async function getUnchangedOwnedRecord(
  snapshot: CloudPasswordRecord,
  seedWord: string,
  userId: string,
): Promise<CloudPasswordRecord> {
  const current = await getOwnedRecord(snapshot.id, userId);
  if (current.updated !== snapshot.updated ||
    current.type !== snapshot.type ||
    current.encrypted_password !== snapshot.encrypted_password ||
    current.encrypted_comment !== snapshot.encrypted_comment ||
    current.is_deleted !== snapshot.is_deleted ||
    current.password_length !== snapshot.password_length ||
    current.uppercase !== snapshot.uppercase ||
    current.lowercase !== snapshot.lowercase ||
    current.numbers !== snapshot.numbers ||
    current.symbols !== snapshot.symbols ||
    current.allowed_symbols !== snapshot.allowed_symbols ||
    current.symbol !== snapshot.symbol ||
    current.device_id !== snapshot.device_id ||
    current.logo_url !== snapshot.logo_url ||
    JSON.stringify(current.logo) !== JSON.stringify(snapshot.logo)) {
    throw new Error('El registre ha canviat durant l’operació. No s’ha modificat cap dada; torna-ho a provar.');
  }
  assertCanMutateRecord(current);
  return current;
}

async function inspectionFromRecord(
  record: CloudPasswordRecord,
  seedWord: string,
  userId: string,
): Promise<CloudInspectionRecord> {
  const filename = Array.isArray(record.logo) ? record.logo[0] : record.logo || '';
  const baseWord = await decryptRecordBase(record, seedWord, userId);
  const comment = record.encrypted_comment
    ? await decryptCloud(record.encrypted_comment, seedWord, userId, 'comment')
    : { value: '', format: baseWord.format };
  return {
    id: record.id,
    userId: record.user_id,
    symbol: record.symbol,
    baseWord: baseWord.value,
    comment: comment.value,
    logoFilename: filename,
    logoUrl: filename ? pb.files.getURL(record, filename) : record.logo_url || undefined,
    logoExternalUrl: record.logo_url || '',
    passwordLength: record.password_length,
    uppercase: record.uppercase,
    lowercase: record.lowercase,
    numbers: record.numbers,
    symbols: record.symbols,
    allowedSymbols: record.allowed_symbols || '',
    deviceId: record.device_id || '',
    cipherFormat: baseWord.format,
    isDeleted: record.is_deleted,
    created: record.created,
    updated: record.updated,
  };
}

const pendingRequestsByUser = new Map<string, Set<string>>();

export async function withUserRequest<T>(userId: string, request: (requestKey: string) => Promise<T>): Promise<T> {
  assertCurrentUser(userId);
  const requestKey = `paraules-${userId}-${crypto.randomUUID()}`;
  const requests = pendingRequestsByUser.get(userId) ?? new Set<string>();
  requests.add(requestKey);
  pendingRequestsByUser.set(userId, requests);
  try {
    return await request(requestKey);
  } finally {
    requests.delete(requestKey);
    if (requests.size === 0) pendingRequestsByUser.delete(userId);
  }
}

export function cancelCloudSyncRequests(userId: string | null): void {
  if (!userId) return;
  for (const requestKey of pendingRequestsByUser.get(userId) ?? []) {
    pb.cancelRequest(requestKey);
  }
}

interface DecryptedCloudValue {
  value: string;
  format: 'legacy' | 'v2';
}

async function encryptCloud(
  text: string,
  seedWord: string,
  userId: string,
  field: 'base' | 'comment',
): Promise<string> {
  const ciphertext = await encryptCloudValue(text, seedWord, userId, field);
  assertTextFieldLength(field === 'base' ? 'encrypted_password' : 'encrypted_comment', ciphertext);
  return ciphertext;
}

function decryptLegacyCloud(encryptedText: string, seedWord: string): string {
  const normalizedSeed = normalizeSeed(seedWord);
  const methods = [
    () => {
      const key = CryptoJS.SHA256(normalizedSeed).toString();
      return CryptoJS.AES.decrypt(encryptedText, key).toString(CryptoJS.enc.Utf8);
    },
    () => CryptoJS.AES.decrypt(encryptedText, normalizedSeed).toString(CryptoJS.enc.Utf8),
    () => {
      const key = CryptoJS.SHA256(normalizedSeed);
      return CryptoJS.AES.decrypt(encryptedText, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }).toString(CryptoJS.enc.Utf8);
    },
    () => {
      const key = CryptoJS.SHA256(normalizedSeed);
      return CryptoJS.AES.decrypt(encryptedText, key).toString(CryptoJS.enc.Utf8);
    },
  ];

  for (const method of methods) {
    try {
      const result = method();
      if (result && !result.includes('\uFFFD')) return result;
    } catch {
      // Try the next legacy format.
    }
  }
  throw new Error('El ciphertext legacy no s’ha pogut desxifrar amb la paraula mestra disponible. No s’ha modificat cap registre.');
}

async function decryptCloud(
  encryptedText: string,
  seedWord: string,
  userId: string,
  field: 'base' | 'comment',
): Promise<DecryptedCloudValue> {
  if (isVersionedCloudCiphertext(encryptedText)) {
    return {
      value: await decryptCloudValue(encryptedText, seedWord, userId, field),
      format: 'v2',
    };
  }
  return { value: decryptLegacyCloud(encryptedText, seedWord), format: 'legacy' };
}

async function decryptRecordBase(
  record: CloudPasswordRecord,
  seedWord: string,
  userId: string,
): Promise<DecryptedCloudValue> {
  const decoded = await decryptCloud(record.encrypted_password, seedWord, userId, 'base');
  return decoded;
}

function symbolForBaseWord(baseWord: string): string {
  const symbol = Array.from(baseWord)[0]?.toUpperCase() ?? '';
  if (!symbol) {
    throw new Error('No s’ha pogut generar un valor auxiliar symbol vàlid per a aquesta base.');
  }
  assertTextFieldLength('symbol', symbol);
  return symbol;
}

function pendingCreateKey(baseWord: string, userId: string): string {
  const identity = JSON.stringify([userId, baseWord]);
  return `${PENDING_CREATE_PREFIX}${CryptoJS.SHA256(identity).toString()}`;
}

function isDefinitivePocketBaseRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 425 &&
    status !== 429;
}

export function messageKey(baseWord: string, options: MessageOptions): string {
  return `${baseWord}_${options.length}_${options.uppercase}_${options.lowercase}_${options.numbers}_${options.symbols}_${options.allowedSymbols}`;
}

function optionsFromRecord(record: CloudPasswordRecord): MessageOptions {
  return {
    length: record.password_length,
    uppercase: record.uppercase,
    lowercase: record.lowercase,
    numbers: record.numbers,
    symbols: record.symbols,
    allowedSymbols: record.allowed_symbols || '',
  };
}

function userRecordFilter(userId: string, includeDeleted = false): string {
  const deletedClause = includeDeleted ? '' : ' && is_deleted = false';
  return `user_id = "${escapeFilterValue(userId)}" && type = "${PART_A_TYPE}"${deletedClause}`;
}

async function listOwnedRecords(userId: string): Promise<CloudPasswordRecord[]> {
  assertCurrentUser(userId);
  const records = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: userRecordFilter(userId, true),
      sort: '-updated',
      requestKey,
    }),
  );
  assertCurrentUser(userId);
  return records.filter((record) => record.user_id === userId && record.type === PART_A_TYPE);
}

async function resolveRecordForMessage(
  message: ChatMessage,
  seedWord: string,
  userId: string,
): Promise<CloudPasswordRecord | null> {
  const records = await listOwnedRecords(userId);
  const idMatch = records.find((record) => record.id === message.id);
  if (idMatch) {
    return idMatch;
  }

  const matchingRecords: CloudPasswordRecord[] = [];
  for (const record of records) {
    try {
      const decoded = await decryptCloud(record.encrypted_password, seedWord, userId, 'base');
      if (decoded.value === message.baseWord) matchingRecords.push(record);
    } catch {
      // Registre il·legible amb aquesta paraula mestra: s'ignora.
    }
  }
  return matchingRecords[0] ?? null;
}

async function messageFromRecord(
  record: CloudPasswordRecord,
  seedWord: string,
  autoHide: boolean,
  userId: string,
): Promise<ChatMessage> {
  const baseWord = await decryptRecordBase(record, seedWord, userId);
  const comment = record.encrypted_comment
    ? await decryptCloud(record.encrypted_comment, seedWord, userId, 'comment')
    : { value: '', format: baseWord.format };
  const options = optionsFromRecord(record);
  const logoFilename = Array.isArray(record.logo) ? record.logo[0] : record.logo;
  return {
    id: record.id,
    baseWord: baseWord.value,
    autoHide,
    comment: comment.value,
    logoUrl: logoFilename ? pb.files.getURL(record, logoFilename) : record.logo_url || undefined,
    options,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

export async function mergeLocalWithCloud(
  seedWord: string,
  autoHide: boolean,
  userId: string,
  localMessages: ChatMessage[] = [],
): Promise<ChatMessage[]> {
  assertCurrentUser(userId);

  return withCloudSyncLock(async () => {
    const records = (await listOwnedRecords(userId)).filter((record) => !record.is_deleted);
    const settled = await Promise.allSettled(records.map((record) => messageFromRecord(record, seedWord, autoHide, userId)));
    const decodedMessages = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    if (records.length > 0 && decodedMessages.length === 0) {
      throw new Error('No s’ha pogut desxifrar cap fitxa del núvol amb la paraula mestra actual.');
    }
    const seenBases = new Set<string>();
    const cloudMessages = decodedMessages.filter((message) => {
      if (seenBases.has(message.baseWord)) return false;
      seenBases.add(message.baseWord);
      return true;
    });

    const localIds = new Set(localMessages.map((message) => message.id));
    const localBases = new Set(localMessages.map((message) => message.baseWord));
    return [
      ...localMessages,
      ...cloudMessages.filter((message) => !localIds.has(message.id) && !localBases.has(message.baseWord)),
    ];
  });
}

const MESSAGE_SNAPSHOT_PREFIX = 'paraules:part-a-snapshot:';

function messageContentHash(comment: string, options: MessageOptions): string {
  return CryptoJS.SHA256(JSON.stringify([
    comment,
    options.length,
    options.uppercase,
    options.lowercase,
    options.numbers,
    options.symbols,
    options.allowedSymbols || '',
  ])).toString();
}

function readMessageSnapshots(userId: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`${MESSAGE_SNAPSHOT_PREFIX}${userId}`) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

// Còpia del contingut tal com era l'última vegada que local i núvol coincidien.
function setMessageSnapshot(userId: string, baseWord: string, hash: string | null): void {
  const snapshots = readMessageSnapshots(userId);
  const key = CryptoJS.SHA256(baseWord).toString();
  if (hash) snapshots[key] = hash;
  else delete snapshots[key];
  localStorage.setItem(`${MESSAGE_SNAPSHOT_PREFIX}${userId}`, JSON.stringify(snapshots));
}

export type MessageSyncChangeKind = 'create' | 'push' | 'pull' | 'conflict' | 'missing-cloud';
export type MessageSyncChoice = 'local' | 'cloud' | 'skip';

export interface MessageSyncChange {
  id: string;
  kind: MessageSyncChangeKind;
  local?: ChatMessage;
  cloud?: ChatMessage;
  cloudRecordId?: string;
  cloudDeleted: boolean;
  defaultChoice: MessageSyncChoice;
}

export interface MessageSyncPlan {
  messages: ChatMessage[];
  changes: MessageSyncChange[];
}

// Només llegeix el núvol: no escriu res fins que l'usuari triï cada canvi.
export async function planMessageSync(
  seedWord: string,
  autoHide: boolean,
  userId: string,
  localMessages: ChatMessage[] = [],
): Promise<MessageSyncPlan> {
  assertCurrentUser(userId);

  return withCloudSyncLock(async () => {
    const records = await listOwnedRecords(userId);
    const settled = await Promise.allSettled(records.map(async (record) => ({
      record,
      message: await messageFromRecord(record, seedWord, autoHide, userId),
    })));
    const decoded = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    if (records.length > 0 && decoded.length === 0) {
      throw new Error('No s’ha pogut desxifrar cap fitxa del núvol amb la paraula mestra actual.');
    }

    const cloudByBase = new Map<string, { record: CloudPasswordRecord; message: ChatMessage }>();
    for (const entry of decoded) {
      const current = cloudByBase.get(entry.message.baseWord);
      if (!current || (current.record.is_deleted && !entry.record.is_deleted)) {
        cloudByBase.set(entry.message.baseWord, entry);
      }
    }

    const snapshots = readMessageSnapshots(userId);
    const changes: MessageSyncChange[] = [];
    const localBases = new Set<string>();
    const localIds = new Set<string>();

    for (const local of localMessages) {
      localBases.add(local.baseWord);
      localIds.add(local.id);
      const cloudEntry = cloudByBase.get(local.baseWord);
      const snapshot = snapshots[CryptoJS.SHA256(local.baseWord).toString()];
      const localHash = messageContentHash(local.comment, local.options);

      if (!cloudEntry) {
        changes.push({
          id: local.id,
          kind: snapshot ? 'missing-cloud' : 'create',
          local,
          cloudDeleted: false,
          defaultChoice: snapshot ? 'skip' : 'local',
        });
        continue;
      }

      const { record, message: cloud } = cloudEntry;
      const base = { id: local.id, local, cloud, cloudRecordId: record.id, cloudDeleted: record.is_deleted };
      if (record.is_deleted) {
        const untouched = snapshot !== undefined && snapshot === localHash;
        changes.push({ ...base, kind: untouched ? 'pull' : 'conflict', defaultChoice: untouched ? 'cloud' : 'skip' });
        continue;
      }

      const cloudHash = messageContentHash(cloud.comment, cloud.options);
      if (cloudHash === localHash) {
        if (snapshot !== localHash) setMessageSnapshot(userId, local.baseWord, localHash);
      } else if (snapshot === cloudHash) {
        changes.push({ ...base, kind: 'push', defaultChoice: 'local' });
      } else if (snapshot === localHash) {
        changes.push({ ...base, kind: 'pull', defaultChoice: 'cloud' });
      } else {
        changes.push({ ...base, kind: 'conflict', defaultChoice: 'skip' });
      }
    }

    const cloudOnly: ChatMessage[] = [];
    for (const { record, message } of cloudByBase.values()) {
      if (record.is_deleted || localBases.has(message.baseWord) || localIds.has(message.id)) continue;
      cloudOnly.push(message);
      setMessageSnapshot(userId, message.baseWord, messageContentHash(message.comment, message.options));
    }

    return { messages: [...localMessages, ...cloudOnly], changes };
  });
}

export async function applyMessageChoices(
  plan: MessageSyncPlan,
  choices: Record<string, MessageSyncChoice>,
  seedWord: string,
  userId: string,
): Promise<{ messages: ChatMessage[]; unresolved: MessageSyncChange[] }> {
  let messages = plan.messages;
  const unresolved: MessageSyncChange[] = [];

  for (const change of plan.changes) {
    const choice = choices[change.id] ?? 'skip';
    if (choice === 'skip') {
      unresolved.push(change);
      continue;
    }
    try {
      assertCurrentUser(userId);
      const target = change.local ?? change.cloud;
      if (!target) throw new Error('Fitxa sense dades.');
      if (choice === 'local') {
        if (!change.local) throw new Error('No hi ha còpia local.');
        if (change.cloudDeleted && change.cloudRecordId) await restoreDeletedCloudRecord(change.cloudRecordId, seedWord);
        await upsertMessage(change.local, seedWord, userId);
      } else if (!change.cloud || change.cloudDeleted) {
        messages = messages.filter((message) => message.id !== change.id);
        setMessageSnapshot(userId, target.baseWord, null);
      } else {
        messages = messages.map((message) => (message.id === change.id ? change.cloud as ChatMessage : message));
        setMessageSnapshot(userId, change.cloud.baseWord, messageContentHash(change.cloud.comment, change.cloud.options));
      }
    } catch {
      unresolved.push(change);
    }
  }
  return { messages, unresolved };
}

export async function upsertMessage(message: ChatMessage, seedWord: string, userId: string): Promise<void> {
  assertCurrentUser(userId);
  await withCloudSyncLock(() => upsertMessageInternal(message, seedWord, userId));
}

export async function saveMessageLogo(
  message: ChatMessage,
  file: File | undefined,
  logoUrl: string | undefined,
  seedWord: string,
  userId: string,
): Promise<string | undefined> {
  assertCurrentUser(userId);

  return withCloudSyncLock(async () => {
    assertCurrentUser(userId);
    const existingRecord = await findRecordForMessage(message, seedWord, userId);
    if (!existingRecord) {
      throw new Error('No s’ha trobat una fitxa existent a PocketBase. Sincronitza la fitxa abans de desar-hi el logo.');
    }
    if (existingRecord.is_deleted) {
      throw new Error('La fitxa és a la paperera. Restaura-la abans de modificar-ne el logo.');
    }
    assertCurrentUser(userId);
    const currentRecord = await getUnchangedOwnedRecord(existingRecord, seedWord, userId);

    if (!file && logoUrl) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(logoUrl);
      } catch {
        throw new Error('La URL del logotip no és vàlida.');
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
        throw new Error('La URL del logotip ha de ser HTTP o HTTPS vàlida.');
      }
      assertTextFieldLength('logo_url', parsedUrl.href);
      assertCurrentUser(userId);
      await withUserRequest(userId, (requestKey) =>
        pb.collection(COLLECTION).update(currentRecord.id, { logo: [], logo_url: parsedUrl.href }, { requestKey }),
      );
      return parsedUrl.href;
    }
    if (!file) {
      assertCurrentUser(userId);
      await withUserRequest(userId, (requestKey) =>
        pb.collection(COLLECTION).update(currentRecord.id, { logo: [], logo_url: '' }, { requestKey }),
      );
      return undefined;
    }
    if (!file.type.startsWith('image/') || file.size === 0) {
      throw new Error('El fitxer del logotip no té un tipus MIME d’imatge vàlid.');
    }

    const formData = new FormData();
    formData.set('logo', file);
    formData.set('logo_url', '');
    assertCurrentUser(userId);
    const updatedRecord = await withUserRequest(userId, (requestKey) =>
      pb.collection(COLLECTION).update<CloudPasswordRecord>(currentRecord.id, formData, { requestKey }),
    );
    assertCurrentUser(userId);
    if (updatedRecord.user_id !== userId) throw new Error('PocketBase ha retornat un registre d’un altre compte.');
    const filename = Array.isArray(updatedRecord.logo) ? updatedRecord.logo[0] : updatedRecord.logo;
    if (!filename) {
      throw new Error('PocketBase ha acceptat la petició però no ha retornat el fitxer del logotip.');
    }
    return pb.files.getURL(updatedRecord, filename);
  });
}

async function upsertMessageInternal(
  message: ChatMessage,
  seedWord: string,
  userId: string,
): Promise<void> {
  assertCurrentUser(userId);
  if (!message.baseWord) throw new Error('No es pot sincronitzar una paraula base buida.');
  const symbol = symbolForBaseWord(message.baseWord);
  const allowedSymbols = message.options.allowedSymbols || '';
  assertTextFieldLength('allowed_symbols', allowedSymbols);
  const pendingKey = pendingCreateKey(message.baseWord, userId);
  const payload: Record<string, unknown> = {
    type: PART_A_TYPE,
    encrypted_password: await encryptCloud(message.baseWord, seedWord, userId, 'base'),
    encrypted_comment: message.comment ? await encryptCloud(message.comment, seedWord, userId, 'comment') : '',
    password_length: message.options.length,
    uppercase: message.options.uppercase,
    lowercase: message.options.lowercase,
    numbers: message.options.numbers,
    symbols: message.options.symbols,
    allowed_symbols: allowedSymbols,
  };

  const existing = await resolveRecordForMessage(message, seedWord, userId);
  assertCurrentUser(userId);
  if (existing) {
    localStorage.removeItem(pendingKey);
    const currentRecord = await getUnchangedOwnedRecord(existing, seedWord, userId);
    if (currentRecord.is_deleted) {
      throw new Error('La fitxa és a la paperera i no s’ha sincronitzat. Restaura-la explícitament abans de modificar-la.');
    }
    assertCurrentUser(userId);
    await withUserRequest(userId, (requestKey) =>
      pb.collection(COLLECTION).update(currentRecord.id, payload, { requestKey }),
    );
  } else {
    if (localStorage.getItem(pendingKey)) {
      throw new Error('El resultat d’una creació anterior és incert. No es repetirà la petició per evitar duplicats; comprova els registres del compte abans de resoldre-ho.');
    }
    localStorage.setItem(pendingKey, 'pending');
    assertCurrentUser(userId);
    try {
      await withUserRequest(userId, (requestKey) =>
        pb.collection(COLLECTION).create({
          ...payload,
            symbol,
          device_id: getDeviceId(),
          user_id: userId,
          is_deleted: false,
        }, { requestKey }),
      );
      localStorage.removeItem(pendingKey);
    } catch (error) {
      if (isDefinitivePocketBaseRejection(error)) localStorage.removeItem(pendingKey);
      throw error;
    }
  }
  assertCurrentUser(userId);
  setMessageSnapshot(userId, message.baseWord, messageContentHash(message.comment, message.options));
}

async function findRecordForMessage(
  message: ChatMessage,
  seedWord: string,
  userId: string,
): Promise<CloudPasswordRecord | null> {
  return resolveRecordForMessage(message, seedWord, userId);
}

export async function markMessageDeleted(message: ChatMessage, seedWord: string, userId: string): Promise<void> {
  assertCurrentUser(userId);
  await withCloudSyncLock(async () => {
    const existing = await resolveRecordForMessage(message, seedWord, userId);
    if (!existing) throw new Error('No s’ha trobat la fitxa del núvol. No s’ha eliminat cap registre.');
    if (existing.is_deleted) throw new Error('La fitxa ja és a la paperera.');
    const currentRecord = await getUnchangedOwnedRecord(existing, seedWord, userId);
    if (currentRecord.is_deleted) throw new Error('La fitxa ja és a la paperera.');
    assertCurrentUser(userId);
    const updated = await withUserRequest(userId, (requestKey) =>
      pb.collection(COLLECTION).update<CloudPasswordRecord>(currentRecord.id, { is_deleted: true }, { requestKey }),
    );
    assertCurrentUser(userId);
    if (updated && (updated.id !== existing.id || updated.user_id !== userId || !updated.is_deleted)) {
      throw new Error('PocketBase no ha confirmat l’eliminació de la fitxa seleccionada.');
    }
    setMessageSnapshot(userId, message.baseWord, null);
  });
}

export async function restoreDeletedCloudRecord(recordId: string, seedWord: string): Promise<void> {
  const user = getCloudUser();
  if (!user) throw new Error('Inicia sessió al núvol per restaurar la fitxa.');
  await withCloudSyncLock(async () => {
    const record = await getOwnedRecord(recordId, user.id);
    const currentRecord = await getUnchangedOwnedRecord(record, seedWord, user.id);
    if (!currentRecord.is_deleted) throw new Error('La fitxa ja no és eliminada i no es pot restaurar des de la paperera.');
    assertCurrentUser(user.id);
    const restored = await withUserRequest(user.id, (requestKey) =>
      pb.collection(COLLECTION).update<CloudPasswordRecord>(currentRecord.id, { is_deleted: false }, { requestKey }),
    );
    assertCurrentUser(user.id);
    if (restored && (restored.id !== recordId || restored.user_id !== user.id || restored.is_deleted)) {
      throw new Error('PocketBase no ha confirmat la restauració de la fitxa seleccionada.');
    }
  });
}

export async function permanentlyDeleteCloudRecord(recordId: string, seedWord: string): Promise<void> {
  const user = getCloudUser();
  if (!user) throw new Error('Inicia sessió al núvol per eliminar la fitxa permanentment.');
  await withCloudSyncLock(async () => {
    const record = await getOwnedRecord(recordId, user.id);
    const currentRecord = await getUnchangedOwnedRecord(record, seedWord, user.id);
    if (!currentRecord.is_deleted) throw new Error('La fitxa és activa i no es pot eliminar permanentment des de la paperera.');
    assertCurrentUser(user.id);
    const deleted = await withUserRequest(user.id, (requestKey) =>
      pb.collection(COLLECTION).delete(currentRecord.id, { requestKey }),
    );
    assertCurrentUser(user.id);
    if (!deleted) throw new Error('PocketBase no ha confirmat l’eliminació permanent de la fitxa.');
  });
}

// Mutex per evitar que sincronitzacions simultànies creïn duplicats.
let syncMutex: Promise<unknown> = Promise.resolve();
export function withCloudSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncMutex.then(fn, fn);
  syncMutex = run.then(() => undefined, () => undefined);
  return run;
}
