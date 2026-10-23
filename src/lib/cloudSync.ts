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

export async function listUserRecords(seedWord: string, includeDeleted = false): Promise<DecodedRecord[]> {
  const user = getCloudUser();
  if (!user) return [];
  return withSyncLock(async () => {
    await deduplicateUserRecords(seedWord);
    const userFilter = `user_id = "${escapeFilterValue(user.id)}"${includeDeleted ? '' : ' && is_deleted = false'}`;
    const records = await pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: userFilter,
      sort: '-created',
    });
    return records.flatMap((record) => {
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

export async function updateRecordFields(
  recordId: string,
  fields: { comment?: string; baseWord?: string; options?: MessageOptions },
  seedWord: string,
): Promise<void> {
  const user = getCloudUser();
  if (!user) return;
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
  await pb.collection(COLLECTION).update(recordId, update);
}

export async function setRecordDeleted(recordId: string, deleted: boolean): Promise<void> {
  await pb.collection(COLLECTION).update(recordId, { is_deleted: deleted });
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
async function findRecordByBaseWord(
  baseWord: string,
  seedWord: string,
  includeDeleted = false,
): Promise<CloudPasswordRecord | null> {
  const user = getCloudUser();
  if (!user) return null;
  const symbol = baseWord.charAt(0).toUpperCase();
  const filter = `user_id = "${escapeFilterValue(user.id)}" && symbol = "${escapeFilterValue(symbol)}"${includeDeleted ? '' : ' && is_deleted = false'}`;
  const records = await pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
    filter,
    sort: '-updated',
  });
  for (const record of records) {
    const decrypted = decryptCloud(record.encrypted_password, seedWord);
    if (decrypted === baseWord) return record;
  }
  return null;
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
  localMessages: ChatMessage[],
  seedWord: string,
  autoHide: boolean,
): Promise<ChatMessage[]> {
  const user = getCloudUser();
  if (!user) return localMessages;

  return withSyncLock(async () => {
    await deduplicateUserRecords(seedWord);

    const records = await pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
      filter: userRecordFilter(user.id, false),
      sort: 'created',
    });
    const cloudMessages = records.flatMap((record) => {
      const message = messageFromRecord(record, seedWord, autoHide);
      return message ? [message] : [];
    });
    const cloudByKey = new Map(
      cloudMessages.map((message) => [messageKey(message.baseWord, message.options), message]),
    );
    const merged = [...localMessages];

    for (const localMessage of localMessages) {
      const cloudMessage = cloudByKey.get(messageKey(localMessage.baseWord, localMessage.options));
      if (cloudMessage) {
        await upsertMessageInternal(localMessage, seedWord, cloudMessage.id);
        const localIndex = merged.findIndex((message) => message.id === localMessage.id);
        if (localIndex >= 0 && cloudMessage.logoUrl) {
          merged[localIndex] = { ...localMessage, logoUrl: cloudMessage.logoUrl };
        }
        cloudByKey.delete(messageKey(cloudMessage.baseWord, cloudMessage.options));
      } else {
        await upsertMessageInternal(localMessage, seedWord);
      }
    }

    for (const cloudMessage of cloudByKey.values()) merged.push(cloudMessage);
    return merged;
  });
}

export async function upsertMessage(message: ChatMessage, seedWord: string): Promise<void> {
  const user = getCloudUser();
  if (!user) return;
  await withSyncLock(() => upsertMessageInternal(message, seedWord));
}

export async function saveMessageLogo(
  message: ChatMessage,
  file: File | undefined,
  seedWord: string,
): Promise<string | undefined> {
  const user = getCloudUser();
  if (!user) return undefined;

  return withSyncLock(async () => {
    const existingRecord = await findRecordForMessage(message, seedWord);
    if (!existingRecord) {
      throw new Error('No s’ha trobat una fitxa existent a PocketBase. Sincronitza la fitxa abans de desar-hi el logo.');
    }
    if (existingRecord.is_deleted) {
      await pb.collection(COLLECTION).update(existingRecord.id, { is_deleted: false });
    }

    if (!file) {
      await pb.collection(COLLECTION).update(existingRecord.id, { logo: [] });
      return undefined;
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('El fitxer del logotip no té un tipus MIME d’imatge vàlid.');
    }

    const formData = new FormData();
    formData.set('logo', file);
    const updatedRecord = await pb.collection(COLLECTION).update<CloudPasswordRecord>(existingRecord.id, formData);
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
  existingId?: string,
): Promise<void> {
  const payload = {
    user_id: getCloudUser()!.id,
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
    is_deleted: false,
  };

  if (existingId) {
    await pb.collection(COLLECTION).update(existingId, payload);
    return;
  }

  const existing = await findRecordByBaseWord(message.baseWord, seedWord, true);
  if (existing) {
    await pb.collection(COLLECTION).update(existing.id, payload);
  } else {
    await pb.collection(COLLECTION).create(payload);
  }
}

async function findRecordForMessage(
  message: ChatMessage,
  seedWord: string,
): Promise<CloudPasswordRecord | null> {
  const user = getCloudUser();
  if (!user) return null;
  const symbol = message.baseWord.charAt(0).toUpperCase();
  const records = await pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
    filter: `user_id = "${escapeFilterValue(user.id)}" && symbol = "${escapeFilterValue(symbol)}"`,
    sort: '-updated',
  });
  const matchingWord = records.filter((record) => decryptCloud(record.encrypted_password, seedWord) === message.baseWord);
  const matchingOptions = matchingWord.find((record) => !record.is_deleted &&
    messageKey(message.baseWord, optionsFromRecord(record)) === messageKey(message.baseWord, message.options),
  ) ?? matchingWord.find((record) =>
    messageKey(message.baseWord, optionsFromRecord(record)) === messageKey(message.baseWord, message.options),
  );
  return matchingOptions ?? matchingWord.find((record) => !record.is_deleted) ?? matchingWord[0] ?? null;
}

export async function markMessageDeleted(message: ChatMessage, seedWord: string): Promise<void> {
  const user = getCloudUser();
  if (!user) return;
  await withSyncLock(async () => {
    const existing = await findRecordByBaseWord(message.baseWord, seedWord, true);
    if (existing) await pb.collection(COLLECTION).update(existing.id, { is_deleted: true });
  });
}

// Neteja suau de duplicats: identifica registres actius amb la mateixa paraula base
// desxifrada i mateixes opcions, i marca com a eliminats els més antics, conservant
// el més recent (per updated). No esborra registres físicament; és reversible.
async function deduplicateUserRecords(seedWord: string): Promise<void> {
  const user = getCloudUser();
  if (!user) return;
  const records = await pb.collection(COLLECTION).getFullList<CloudPasswordRecord>({
    filter: `user_id = "${escapeFilterValue(user.id)}"`,
    sort: '-updated',
  });
  const seen = new Map<string, CloudPasswordRecord>();
  for (const record of records) {
    const baseWord = decryptCloud(record.encrypted_password, seedWord);
    if (!baseWord) continue;
    const key = `${baseWord}|${record.password_length}|${record.uppercase}|${record.lowercase}|${record.numbers}|${record.symbols}|${record.allowed_symbols || ''}`;
    const prev = seen.get(key);
    if (prev) {
      // Duplicat: marca com a eliminat. El primer vist és el més recent (-updated).
      await pb.collection(COLLECTION).update(record.id, { is_deleted: true });
    } else {
      seen.set(key, record);
    }
  }
}

// Mutex per evitar que sincronitzacions simultànies creïn duplicats.
let syncMutex: Promise<unknown> = Promise.resolve();
function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncMutex.then(fn, fn);
  syncMutex = run.then(() => undefined, () => undefined);
  return run;
}
