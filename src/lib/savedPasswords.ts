import type { PasswordEnvelopeV1 } from '@/lib/passwordEncryption';
import { assertCurrentUser, withCloudSyncLock, withUserRequest } from '@/lib/cloudSync';
import { pb } from '@/lib/pocketbase';
import { SavedPasswordRecord } from '@/lib/storage';

const COLLECTION = 'paraules_paraules';
const PART_B_TYPE = 'B' as const;
const PART_B_FORMAT = 'paraules-saved-password:v1' as const;

export interface CloudSavedPasswordRecord {
  id: string;
  type: 'A' | 'B';
  user_id: string;
  encrypted_password: string;
  is_deleted: boolean;
  created: string;
  updated: string;
}

interface PartBPayload {
  format: typeof PART_B_FORMAT;
  clientId: string;
  encryptedName: PasswordEnvelopeV1;
  encryptedPassword: PasswordEnvelopeV1;
}

interface SavedPasswordSyncResult {
  cloudUpdatedAt: string;
  cloudSnapshot: NonNullable<SavedPasswordRecord['cloudSnapshot']>;
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function payloadForLocal(local: SavedPasswordRecord): PartBPayload {
  return {
    format: PART_B_FORMAT,
    clientId: local.id,
    encryptedName: local.encryptedName,
    encryptedPassword: local.encryptedPassword,
  };
}

function serializePayload(local: SavedPasswordRecord): string {
  return JSON.stringify(payloadForLocal(local));
}

function parsePartBPayload(value: string): PartBPayload {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object') throw new Error('El registre B del núvol no és vàlid.');
  const payload = parsed as Partial<PartBPayload>;
  if (payload.format !== PART_B_FORMAT || typeof payload.clientId !== 'string' || !payload.clientId ||
    !isPasswordEnvelope(payload.encryptedName) || !isPasswordEnvelope(payload.encryptedPassword)) {
    throw new Error('El registre B del núvol no és compatible o és incomplet.');
  }
  return payload as PartBPayload;
}

function isPasswordEnvelope(value: unknown): value is PasswordEnvelopeV1 {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<PasswordEnvelopeV1>;
  return envelope.version === 1 &&
    envelope.algorithm === 'AES-256-GCM' &&
    envelope.kdf === 'PBKDF2-HMAC-SHA-256' &&
    envelope.iterations === 600_000 &&
    typeof envelope.salt === 'string' &&
    typeof envelope.nonce === 'string' &&
    typeof envelope.ciphertext === 'string';
}

function sameCiphertext(record: CloudSavedPasswordRecord, local: SavedPasswordRecord): boolean {
  return record.type === PART_B_TYPE &&
    record.encrypted_password === serializePayload(local) &&
    record.is_deleted === local.deleted;
}

function sameCloudSnapshot(record: CloudSavedPasswordRecord, local: SavedPasswordRecord): boolean {
  const snapshot = local.cloudSnapshot;
  if (!snapshot) return false;
  const payload = parsePartBPayload(record.encrypted_password);
  return JSON.stringify(payload.encryptedName) === JSON.stringify(snapshot.encryptedName) &&
    JSON.stringify(payload.encryptedPassword) === JSON.stringify(snapshot.encryptedPassword) &&
    record.is_deleted === snapshot.deleted;
}

function snapshotFromCloud(record: CloudSavedPasswordRecord): NonNullable<SavedPasswordRecord['cloudSnapshot']> {
  const payload = parsePartBPayload(record.encrypted_password);
  return {
    encryptedName: payload.encryptedName,
    encryptedPassword: payload.encryptedPassword,
    deleted: record.is_deleted,
  };
}

export async function listCloudSavedPasswords(userId: string): Promise<CloudSavedPasswordRecord[]> {
  assertCurrentUser(userId);
  const records = await withUserRequest(userId, (requestKey) =>
    pb.collection(COLLECTION).getFullList<CloudSavedPasswordRecord>({
      filter: `user_id = "${escapeFilterValue(userId)}" && type = "${PART_B_TYPE}"`,
      sort: 'created',
      requestKey,
    }),
  );
  assertCurrentUser(userId);
  const owned = records.filter((record) => record.user_id === userId && record.type === PART_B_TYPE);
  if (owned.length !== records.length) throw new Error('La consulta de contrasenyes desades ha retornat registres que no són fitxes B del compte.');
  return owned;
}

export async function syncSavedPassword(
  local: SavedPasswordRecord,
  userId: string,
): Promise<SavedPasswordSyncResult> {
  assertCurrentUser(userId);
  return withCloudSyncLock(async () => {
    const records = await listCloudSavedPasswords(userId);
    const matches = records.filter((record) => parsePartBPayload(record.encrypted_password).clientId === local.id);
    if (matches.length > 1) {
      throw new Error('Hi ha més d’un registre B al núvol amb aquest identificador local. No s’ha modificat cap dada.');
    }

    if (matches.length === 1) {
      const current = matches[0];
      if (sameCiphertext(current, local)) {
        return { cloudUpdatedAt: current.updated, cloudSnapshot: snapshotFromCloud(current) };
      }
      if (!sameCloudSnapshot(current, local)) {
        throw new Error('La contrasenya desada ha canviat en un altre dispositiu. S’ha conservat la còpia local; resol el conflicte abans de sincronitzar.');
      }

      const updated = await withUserRequest(userId, (requestKey) =>
        pb.collection(COLLECTION).update<CloudSavedPasswordRecord>(current.id, {
          type: PART_B_TYPE,
          encrypted_password: serializePayload(local),
          is_deleted: local.deleted,
        }, { requestKey }),
      );
      assertCurrentUser(userId);
      if (updated.user_id !== userId || updated.type !== PART_B_TYPE ||
        parsePartBPayload(updated.encrypted_password).clientId !== local.id) {
        throw new Error('PocketBase ha retornat un registre que no correspon a aquesta sessió.');
      }
      return { cloudUpdatedAt: updated.updated, cloudSnapshot: snapshotFromCloud(updated) };
    }

    if (local.cloudUpdatedAt) {
      throw new Error('El registre sincronitzat ja no és al núvol. S’ha conservat la còpia local i no s’ha recreat.');
    }
    const created = await withUserRequest(userId, (requestKey) =>
      pb.collection(COLLECTION).create<CloudSavedPasswordRecord>({
        type: PART_B_TYPE,
        user_id: userId,
        symbol: 'B',
        encrypted_password: serializePayload(local),
        encrypted_comment: '',
        password_length: 10,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        allowed_symbols: '',
        device_id: '',
        is_deleted: local.deleted,
      }, { requestKey }),
    );
    assertCurrentUser(userId);
    if (created.user_id !== userId || created.type !== PART_B_TYPE ||
      parsePartBPayload(created.encrypted_password).clientId !== local.id) {
      throw new Error('PocketBase ha retornat un registre que no correspon a aquesta sessió.');
    }
    return { cloudUpdatedAt: created.updated, cloudSnapshot: snapshotFromCloud(created) };
  });
}

export function parseCloudEnvelope(value: string): PasswordEnvelopeV1 {
  const parsed: unknown = JSON.parse(value);
  if (!isPasswordEnvelope(parsed)) throw new Error('L’envelope xifrat del núvol no és vàlid.');
  return parsed;
}

function recordToLocal(record: CloudSavedPasswordRecord): SavedPasswordRecord {
  const payload = parsePartBPayload(record.encrypted_password);
  return {
    id: payload.clientId,
    encryptedName: payload.encryptedName,
    encryptedPassword: payload.encryptedPassword,
    createdAt: record.created,
    updatedAt: record.updated,
    cloudUpdatedAt: record.updated,
    cloudSnapshot: snapshotFromCloud(record),
    syncState: 'synced',
    deleted: record.is_deleted,
  };
}

export async function synchronizeSavedPasswords(
  localRecords: SavedPasswordRecord[],
  userId: string,
): Promise<SavedPasswordRecord[]> {
  const cloudRecords = await listCloudSavedPasswords(userId);
  const cloudByClientId = new Map<string, CloudSavedPasswordRecord>();
  for (const record of cloudRecords) {
    const clientId = parsePartBPayload(record.encrypted_password).clientId;
    if (cloudByClientId.has(clientId)) {
      throw new Error('El núvol conté identificadors de contrasenya repetits.');
    }
    cloudByClientId.set(clientId, record);
  }

  const merged: SavedPasswordRecord[] = [];
  const localIds = new Set<string>();
  for (const local of localRecords) {
    localIds.add(local.id);
    const cloud = cloudByClientId.get(local.id);
    if (!cloud) {
      if (local.cloudUpdatedAt) {
        merged.push({ ...local, syncState: 'conflict' });
        continue;
      }
      if (local.syncState === 'local' || local.syncState === 'pending') {
        const result = await syncSavedPassword(local, userId);
        merged.push({ ...local, cloudUpdatedAt: result.cloudUpdatedAt, cloudSnapshot: result.cloudSnapshot, syncState: 'synced' });
        continue;
      }
      merged.push(local);
      continue;
    }

    const remote = recordToLocal(cloud);
    if (sameCiphertext(cloud, local)) {
      merged.push(remote);
    } else if (sameCloudSnapshot(cloud, local)) {
      const result = await syncSavedPassword(local, userId);
      merged.push({ ...local, cloudUpdatedAt: result.cloudUpdatedAt, cloudSnapshot: result.cloudSnapshot, syncState: 'synced' });
    } else {
      merged.push({ ...local, syncState: 'conflict' });
    }
  }

  for (const cloud of cloudRecords) {
    const remote = recordToLocal(cloud);
    if (localIds.has(remote.id)) continue;
    merged.push(remote);
  }
  return merged;
}
