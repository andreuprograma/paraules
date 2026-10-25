import CryptoJS from 'crypto-js';
import { ChatMessage, MessageOptions } from '@/lib/storage';
import { generatePassword, normalizeSeed } from '@/lib/passwordGenerator';
import { getCloudUser, pb } from '@/lib/pocketbase';

export interface CloudPasswordRecord {
  id: string;
  user_id: string;
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
  isDeleted: boolean;
  created: string;
  updated: string;
}

export async function listUserRecords(seedWord: string, includeDeleted = false): Promise<DecodedRecord[]> {
  const user = getCloudUser();
  if (!user) return [];
  return withSyncLock(async () => {
    assertCurrentUser(user.id);
    const userFilter = `user_id = "${escapeFilterValue(user.id)}"${includeDeleted ? '' : ' && is_deleted = false'}`;
    const records = await withUserRequest(user.id, (requestKey) =>
      pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
        filter: userFilter,
        sort: '-created',
        requestKey,
      }),
    );
    assertCurrentUser(user.id);
    return records.filter((record) => record.user_id === user.id).flatMap((record) => {
      const baseWord = decryptCloud(record.encrypted_password, seedWord);
      if (!baseWord) return [];
      return [{
        id: record.id,
        baseWord,
        comment: record.encrypted_comment ? decryptCloud(record.encrypted_comment, seedWord) : '',
        options: optionsFromRecord(record),
        isDeleted: record.is_deleted,
        created: record.created,
        updated: record.updated,
      }];
    });
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

  return records
    .filter((record) => record.user_id === userId)
    .map((record) => inspectionFromRecord(record, seedWord));
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
  return records
    .filter((record) => record.user_id === userId && record.is_deleted)
    .map((record) => inspectionFromRecord(record, seedWord));
}

export async function updateRecordFields(
  recordId: string,
  fields: { comment?: string; baseWord?: string; options?: MessageOptions },
  seedWord: string,
): Promise<void> {
  const user = getCloudUser();
  if (!user) return;
  assertCurrentUser(user.id);
  await assertRecordOwned(recordId, user.id);
  const update: Record<string, unknown> = {};
  if (fields.baseWord !== undefined) {
    update.encrypted_password = encryptCloud(fields.baseWord, seedWord);
    update.symbol = fields.baseWord.charAt(0).toUpperCase();
  }
  if (fields.comment !== undefined) {
    update.encrypted_comment = fields.comment ? encryptCloud(fields.comment, seedWord) : '';
  }
  if (fields.options) {
    update.password_length = fields.options.length;
    update.uppercase = fields.options.uppercase;
    update.lowercase = fields.options.lowercase;
    update.numbers = fields.options.numbers;
    update.symbols = fields.options.symbols;
    update.allowed_symbols = fields.options.allowedSymbols || '';
  }
  assertCurrentUser(user.id);
  await withUserRequest(user.id, (requestKey) =>
    pb.collection(COLLECTION).update(recordId, update, { requestKey }),
  );
  assertCurrentUser(user.id);
}

const DEVICE_ID_KEY = 'pwgen.device_id';
const COLLECTION = 'paraules_paraules';

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

function assertCurrentUser(userId: string): void {
  if (getCloudUser()?.id !== userId) {
    throw new Error('La sessió del compte ha canviat; s’ha aturat la sincronització.');
  }
}

async function assertRecordOwned(recordId: string, userId: string): Promise<void> {
  assertCurrentUser(userId);
  const records = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: `id = "${escapeFilterValue(recordId)}" && user_id = "${escapeFilterValue(userId)}"`,
      requestKey,
    }),
  );
  assertCurrentUser(userId);
  if (!records.some((record) => record.id === recordId && record.user_id === userId)) {
    throw new Error('El registre no pertany al compte autenticat.');
  }
}

async function getOwnedRecord(recordId: string, userId: string): Promise<CloudPasswordRecord> {
  assertCurrentUser(userId);
  const records = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: `id = "${escapeFilterValue(recordId)}" && user_id = "${escapeFilterValue(userId)}"`,
      requestKey,
    }),
  );
  assertCurrentUser(userId);
  const record = records.find((candidate) => candidate.id === recordId && candidate.user_id === userId);
  if (!record) throw new Error('El registre no pertany al compte autenticat o ja no existeix.');
  return record;
}

function inspectionFromRecord(record: CloudPasswordRecord, seedWord: string): CloudInspectionRecord {
  const filename = Array.isArray(record.logo) ? record.logo[0] : record.logo || '';
  return {
    id: record.id,
    userId: record.user_id,
    symbol: record.symbol,
    baseWord: decryptCloud(record.encrypted_password, seedWord),
    comment: record.encrypted_comment ? decryptCloud(record.encrypted_comment, seedWord) : '',
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
    isDeleted: record.is_deleted,
    created: record.created,
    updated: record.updated,
  };
}

const pendingRequestsByUser = new Map<string, Set<string>>();

async function withUserRequest<T>(userId: string, request: (requestKey: string) => Promise<T>): Promise<T> {
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

function encryptCloud(text: string, seedWord: string): string {
  const key = CryptoJS.SHA256(normalizeSeed(seedWord)).toString();
  return CryptoJS.AES.encrypt(text, key).toString();
}

function decryptCloud(encryptedText: string, seedWord: string): string {
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
  return '';
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
  return `user_id = "${escapeFilterValue(userId)}"${deletedClause}`;
}

// Identificació estable: busca un registre existent per paraula base desxifrada,
// independentment del ciphertext. Filtra primer per symbol (primer caràcter,
// determinista) per reduir el nombre de registres a desxifrar.
async function findRecordsByBaseWord(
  baseWord: string,
  seedWord: string,
  userId: string,
): Promise<CloudPasswordRecord[]> {
  assertCurrentUser(userId);
  const symbol = baseWord.charAt(0).toUpperCase();
  const filter = `user_id = "${escapeFilterValue(userId)}" && symbol = "${escapeFilterValue(symbol)}"`;
  const records = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter,
      sort: '-updated',
      requestKey,
    }),
  );
  assertCurrentUser(userId);
  return records.filter((record) =>
    record.user_id === userId && decryptCloud(record.encrypted_password, seedWord) === baseWord,
  );
}

async function resolveRecordForMessage(
  message: ChatMessage,
  seedWord: string,
  userId: string,
): Promise<CloudPasswordRecord | null> {
  assertCurrentUser(userId);
  const recordsById = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: `id = "${escapeFilterValue(message.id)}"`,
      requestKey,
    }),
  );
  assertCurrentUser(userId);
  const idMatch = recordsById.find((record) => record.id === message.id);
  if (idMatch) {
    if (idMatch.user_id !== userId) {
      throw new Error('El registre identificat no pertany al compte autenticat.');
    }
    if (decryptCloud(idMatch.encrypted_password, seedWord) !== message.baseWord) {
      throw new Error('La fitxa del núvol ha canviat de paraula base. No s’ha modificat cap registre.');
    }
    return idMatch;
  }

  const matchingWord = await findRecordsByBaseWord(message.baseWord, seedWord, userId);
  const matchingOptions = matchingWord.filter((record) =>
    messageKey(message.baseWord, optionsFromRecord(record)) === messageKey(message.baseWord, message.options),
  );
  if (matchingOptions.length === 1) return matchingOptions[0];
  if (matchingOptions.length > 1 || matchingWord.length > 1) {
    throw new Error('No es pot identificar inequívocament la fitxa del núvol. No s’ha modificat cap registre.');
  }
  return matchingWord[0] ?? null;
}

function messageFromRecord(record: CloudPasswordRecord, seedWord: string, autoHide: boolean): ChatMessage | null {
  const baseWord = decryptCloud(record.encrypted_password, seedWord);
  if (!baseWord) return null;
  const options = optionsFromRecord(record);
  const logoFilename = Array.isArray(record.logo) ? record.logo[0] : record.logo;
  return {
    id: record.id,
    baseWord,
    password: generatePassword(normalizeSeed(seedWord), baseWord, options),
    autoHide,
    comment: record.encrypted_comment ? decryptCloud(record.encrypted_comment, seedWord) : '',
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
): Promise<ChatMessage[]> {
  assertCurrentUser(userId);

  return withSyncLock(async () => {
    assertCurrentUser(userId);
    const records = await withUserRequest(userId, (requestKey) =>
      pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
        filter: userRecordFilter(userId, false),
        sort: 'created',
        requestKey,
      }),
    );
    assertCurrentUser(userId);
    return records.filter((record) => record.user_id === userId).flatMap((record) => {
      const message = messageFromRecord(record, seedWord, autoHide);
      return message ? [message] : [];
    });
  });
}

export async function upsertMessage(message: ChatMessage, seedWord: string, userId: string): Promise<void> {
  assertCurrentUser(userId);
  await withSyncLock(() => upsertMessageInternal(message, seedWord, userId));
}

export async function saveMessageLogo(
  message: ChatMessage,
  file: File | undefined,
  logoUrl: string | undefined,
  seedWord: string,
  userId: string,
): Promise<string | undefined> {
  assertCurrentUser(userId);

  return withSyncLock(async () => {
    assertCurrentUser(userId);
    const existingRecord = await findRecordForMessage(message, seedWord, userId);
    if (!existingRecord) {
      throw new Error('No s’ha trobat una fitxa existent a PocketBase. Sincronitza la fitxa abans de desar-hi el logo.');
    }
    if (existingRecord.is_deleted) {
      throw new Error('La fitxa és a la paperera. Restaura-la abans de modificar-ne el logo.');
    }
    assertCurrentUser(userId);
    await assertRecordOwned(existingRecord.id, userId);

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
      assertCurrentUser(userId);
      await withUserRequest(userId, (requestKey) =>
        pb.collection(COLLECTION).update(existingRecord.id, { logo: [], logo_url: parsedUrl.href }, { requestKey }),
      );
      return parsedUrl.href;
    }
    if (!file) {
      assertCurrentUser(userId);
      await withUserRequest(userId, (requestKey) =>
        pb.collection(COLLECTION).update(existingRecord.id, { logo: [], logo_url: '' }, { requestKey }),
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
      pb.collection(COLLECTION).update<CloudPasswordRecord>(existingRecord.id, formData, { requestKey }),
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
  const payload: Record<string, unknown> = {
    symbol: message.baseWord.charAt(0).toUpperCase(),
    encrypted_password: encryptCloud(message.baseWord, seedWord),
    encrypted_comment: message.comment ? encryptCloud(message.comment, seedWord) : '',
    password_length: message.options.length,
    uppercase: message.options.uppercase,
    lowercase: message.options.lowercase,
    numbers: message.options.numbers,
    symbols: message.options.symbols,
    allowed_symbols: message.options.allowedSymbols || '',
    device_id: getDeviceId(),
  };

  const existing = await resolveRecordForMessage(message, seedWord, userId);
  assertCurrentUser(userId);
  if (existing) {
    if (existing.is_deleted) {
      throw new Error('La fitxa és a la paperera i no s’ha sincronitzat. Restaura-la explícitament abans de modificar-la.');
    }
    await assertRecordOwned(existing.id, userId);
    assertCurrentUser(userId);
    await withUserRequest(userId, (requestKey) =>
      pb.collection(COLLECTION).update(existing.id, payload, { requestKey }),
    );
  } else {
    assertCurrentUser(userId);
    await withUserRequest(userId, (requestKey) =>
      pb.collection(COLLECTION).create({ ...payload, user_id: userId, is_deleted: false }, { requestKey }),
    );
  }
  assertCurrentUser(userId);
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
  await withSyncLock(async () => {
    const existing = await resolveRecordForMessage(message, seedWord, userId);
    if (!existing) throw new Error('No s’ha trobat la fitxa del núvol. No s’ha eliminat cap registre.');
    if (existing.is_deleted) throw new Error('La fitxa ja és a la paperera.');
    await assertRecordOwned(existing.id, userId);
    assertCurrentUser(userId);
    const updated = await withUserRequest(userId, (requestKey) =>
      pb.collection(COLLECTION).update<CloudPasswordRecord>(existing.id, { is_deleted: true }, { requestKey }),
    );
    assertCurrentUser(userId);
    if (updated && (updated.id !== existing.id || updated.user_id !== userId || !updated.is_deleted)) {
      throw new Error('PocketBase no ha confirmat l’eliminació de la fitxa seleccionada.');
    }
  });
}

export async function restoreDeletedCloudRecord(recordId: string): Promise<void> {
  const user = getCloudUser();
  if (!user) throw new Error('Inicia sessió al núvol per restaurar la fitxa.');
  await withSyncLock(async () => {
    const record = await getOwnedRecord(recordId, user.id);
    if (!record.is_deleted) throw new Error('La fitxa ja no és eliminada i no es pot restaurar des de la paperera.');
    assertCurrentUser(user.id);
    const restored = await withUserRequest(user.id, (requestKey) =>
      pb.collection(COLLECTION).update<CloudPasswordRecord>(recordId, { is_deleted: false }, { requestKey }),
    );
    assertCurrentUser(user.id);
    if (restored && (restored.id !== recordId || restored.user_id !== user.id || restored.is_deleted)) {
      throw new Error('PocketBase no ha confirmat la restauració de la fitxa seleccionada.');
    }
  });
}

export async function permanentlyDeleteCloudRecord(recordId: string): Promise<void> {
  const user = getCloudUser();
  if (!user) throw new Error('Inicia sessió al núvol per eliminar la fitxa permanentment.');
  await withSyncLock(async () => {
    const record = await getOwnedRecord(recordId, user.id);
    if (!record.is_deleted) throw new Error('La fitxa és activa i no es pot eliminar permanentment des de la paperera.');
    assertCurrentUser(user.id);
    const deleted = await withUserRequest(user.id, (requestKey) =>
      pb.collection(COLLECTION).delete(recordId, { requestKey }),
    );
    assertCurrentUser(user.id);
    if (!deleted) throw new Error('PocketBase no ha confirmat l’eliminació permanent de la fitxa.');
  });
}

// Mutex per evitar que sincronitzacions simultànies creïn duplicats.
let syncMutex: Promise<unknown> = Promise.resolve();
function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncMutex.then(fn, fn);
  syncMutex = run.then(() => undefined, () => undefined);
  return run;
}
