import { decryptExistingPassword, encryptExistingPassword } from '@/lib/passwordEncryption';
import type { PasswordEnvelopeV1 } from '@/lib/passwordEncryption';
import { decryptSavedPasswordDetails, decryptSavedPasswordField } from '@/lib/savedPasswordCrypto';
import type { ChatMessage, MessageOptions, SavedPasswordRecord } from '@/lib/storage';

export const BACKUP_FORMAT = 'paraules-backup:v1';

export interface BackupAutomaticEntry {
  baseWord: string;
  options: MessageOptions;
  comment: string;
  icon?: string;
  logoUrl?: string;
}

export interface BackupManualEntry {
  name: string;
  password: string;
  notes: string;
  icon: string;
  logoUrl?: string;
  createdAt?: string;
}

export interface BackupPayload {
  automatic: BackupAutomaticEntry[];
  manual: BackupManualEntry[];
}

export type BackupScope = 'manual' | 'all';

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  contents: BackupScope;
  createdAt: string;
  data: PasswordEnvelopeV1;
}

export async function collectManualEntries(records: SavedPasswordRecord[], master: string): Promise<BackupManualEntry[]> {
  const entries: BackupManualEntry[] = [];
  for (const record of records.filter((item) => !item.deleted)) {
    try {
      const [details, password] = await Promise.all([
        decryptSavedPasswordDetails(record.encryptedName, master),
        decryptSavedPasswordField(record.encryptedPassword, master, 'password'),
      ]);
      entries.push({
        name: details.name,
        password,
        notes: details.notes,
        icon: details.icon,
        ...(details.logoUrl ? { logoUrl: details.logoUrl } : {}),
        createdAt: record.createdAt,
      });
    } catch {
      throw new Error('Alguna fitxa manual no s’ha pogut desxifrar amb la paraula mestra actual. No s’ha creat cap fitxer.');
    }
  }
  return entries;
}

export function collectAutomaticEntries(messages: ChatMessage[]): BackupAutomaticEntry[] {
  return messages.map((message) => ({
    baseWord: message.baseWord,
    options: message.options,
    comment: message.comment,
    ...(message.icon ? { icon: message.icon } : {}),
    ...(message.logoUrl ? { logoUrl: message.logoUrl } : {}),
  }));
}

export async function createBackupFile(payload: BackupPayload, scope: BackupScope, master: string): Promise<string> {
  const content: BackupPayload = {
    automatic: scope === 'all' ? payload.automatic : [],
    manual: payload.manual,
  };
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    contents: scope,
    createdAt: new Date().toISOString(),
    data: await encryptExistingPassword(JSON.stringify(content), master),
  };
  return JSON.stringify(file);
}

export function looksLikeBackup(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return !!parsed && typeof parsed === 'object' && (parsed as { format?: unknown }).format === BACKUP_FORMAT;
  } catch {
    return false;
  }
}

function isOptions(value: unknown): value is MessageOptions {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.length === 'number' && Number.isFinite(o.length) &&
    typeof o.uppercase === 'boolean' && typeof o.lowercase === 'boolean' &&
    typeof o.numbers === 'boolean' && typeof o.symbols === 'boolean' &&
    (o.allowedSymbols === undefined || typeof o.allowedSymbols === 'string');
}

const optionalString = (value: unknown) => value === undefined || typeof value === 'string';

function validatePayload(value: unknown): BackupPayload {
  const invalid = new Error('El fitxer de còpia no té un format compatible.');
  if (!value || typeof value !== 'object') throw invalid;
  const { automatic, manual } = value as { automatic?: unknown; manual?: unknown };
  if (!Array.isArray(automatic) || !Array.isArray(manual)) throw invalid;

  const automaticEntries = automatic.map((item): BackupAutomaticEntry => {
    const entry = item as Partial<BackupAutomaticEntry> | null;
    if (!entry || typeof entry.baseWord !== 'string' || !entry.baseWord || typeof entry.comment !== 'string' ||
      !isOptions(entry.options) || !optionalString(entry.icon) || !optionalString(entry.logoUrl)) throw invalid;
    return {
      baseWord: entry.baseWord,
      options: { ...entry.options, allowedSymbols: entry.options.allowedSymbols ?? '' },
      comment: entry.comment,
      ...(entry.icon ? { icon: entry.icon } : {}),
      ...(entry.logoUrl ? { logoUrl: entry.logoUrl } : {}),
    };
  });
  const manualEntries = manual.map((item): BackupManualEntry => {
    const entry = item as Partial<BackupManualEntry> | null;
    if (!entry || typeof entry.name !== 'string' || !entry.name || typeof entry.password !== 'string' || !entry.password ||
      typeof entry.notes !== 'string' || typeof entry.icon !== 'string' || !optionalString(entry.logoUrl) ||
      !optionalString(entry.createdAt)) throw invalid;
    return {
      name: entry.name,
      password: entry.password,
      notes: entry.notes,
      icon: entry.icon,
      ...(entry.logoUrl ? { logoUrl: entry.logoUrl } : {}),
      ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
    };
  });
  return { automatic: automaticEntries, manual: manualEntries };
}

export async function readBackupFile(text: string, master: string): Promise<BackupPayload> {
  let file: Partial<BackupFile>;
  try {
    file = JSON.parse(text.trim()) as Partial<BackupFile>;
  } catch {
    throw new Error('El fitxer de còpia no és vàlid.');
  }
  if (!file || file.format !== BACKUP_FORMAT || !file.data) throw new Error('El fitxer de còpia no és vàlid.');
  let plaintext: string;
  try {
    plaintext = await decryptExistingPassword(file.data, master);
  } catch {
    throw new Error('No s’ha pogut desxifrar la còpia. Comprova que la paraula mestra sigui la mateixa amb què es va exportar.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new Error('El fitxer de còpia no té un format compatible.');
  }
  return validatePayload(parsed);
}
