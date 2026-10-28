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
  options: { force?: boolean } = {},
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
      if (!options.force && !sameCloudSnapshot(current, local)) {
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

    if (local.cloudUpdatedAt && !options.force) {
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

export type SavedPasswordChangeKind = 'create' | 'push' | 'pull' | 'conflict' | 'missing-cloud';
export type SavedPasswordChoice = 'local' | 'cloud' | 'skip';

export interface SavedPasswordSyncChange {
  id: string;
  kind: SavedPasswordChangeKind;
  local?: SavedPasswordRecord;
  cloud?: SavedPasswordRecord;
  defaultChoice: SavedPasswordChoice;
}

export interface SavedPasswordSyncPlan {
  records: SavedPasswordRecord[];
  changes: SavedPasswordSyncChange[];
}

function localDiffersFromSnapshot(local: SavedPasswordRecord): boolean {
  const snapshot = local.cloudSnapshot;
  if (!snapshot) return true;
  return JSON.stringify(local.encryptedName) !== JSON.stringify(snapshot.encryptedName) ||
    JSON.stringify(local.encryptedPassword) !== JSON.stringify(snapshot.encryptedPassword) ||
    local.deleted !== snapshot.deleted;
}

export async function planSavedPasswordSync(
  localRecords: SavedPasswordRecord[],
  userId: string,
): Promise<SavedPasswordSyncPlan> {
  const cloudRecords = await listCloudSavedPasswords(userId);
  const cloudByClientId = new Map<string, CloudSavedPasswordRecord>();
  for (const record of cloudRecords) {
    const clientId = parsePartBPayload(record.encrypted_password).clientId;
    if (cloudByClientId.has(clientId)) {
      throw new Error('El núvol conté identificadors de contrasenya repetits.');
    }
    cloudByClientId.set(clientId, record);
  }

  const records: SavedPasswordRecord[] = [];
  const changes: SavedPasswordSyncChange[] = [];
  const localIds = new Set<string>();
  for (const local of localRecords) {
    localIds.add(local.id);
    const cloud = cloudByClientId.get(local.id);
    if (!cloud) {
      if (local.cloudUpdatedAt) {
        changes.push({ id: local.id, kind: 'missing-cloud', local, defaultChoice: 'skip' });
        records.push({ ...local, syncState: 'conflict' });
      } else if (local.syncState === 'local' || local.syncState === 'pending') {
        changes.push({ id: local.id, kind: 'create', local, defaultChoice: 'local' });
        records.push(local);
      } else {
        records.push(local);
      }
      continue;
    }

    const remote = recordToLocal(cloud);
    if (sameCiphertext(cloud, local)) {
      records.push(remote);
      continue;
    }
    if (!local.cloudSnapshot) {
      changes.push({ id: local.id, kind: 'conflict', local, cloud: remote, defaultChoice: 'skip' });
      records.push({ ...local, syncState: 'conflict' });
      continue;
    }

    const localChanged = localDiffersFromSnapshot(local);
    const cloudChanged = !sameCloudSnapshot(cloud, local);
    if (localChanged && !cloudChanged) {
      changes.push({ id: local.id, kind: 'push', local, cloud: remote, defaultChoice: 'local' });
      records.push({ ...local, syncState: 'pending' });
    } else if (!localChanged && cloudChanged) {
      changes.push({ id: local.id, kind: 'pull', local, cloud: remote, defaultChoice: 'cloud' });
      records.push(local);
    } else if (localChanged && cloudChanged) {
      changes.push({ id: local.id, kind: 'conflict', local, cloud: remote, defaultChoice: 'skip' });
      records.push({ ...local, syncState: 'conflict' });
    } else {
      records.push(remote);
    }
  }

  for (const cloud of cloudRecords) {
    const remote = recordToLocal(cloud);
    if (!localIds.has(remote.id)) records.push(remote);
  }
  return { records, changes };
}

export async function applySavedPasswordChoices(
  plan: SavedPasswordSyncPlan,
  choices: Record<string, SavedPasswordChoice>,
  userId: string,
): Promise<{ records: SavedPasswordRecord[]; unresolved: SavedPasswordSyncChange[] }> {
  const cloudRecords = await listCloudSavedPasswords(userId);
  const cloudByClientId = new Map(cloudRecords.map((record) => [parsePartBPayload(record.encrypted_password).clientId, record]));
  let records = plan.records.slice();
  const unresolved: SavedPasswordSyncChange[] = [];

  for (const change of plan.changes) {
    const choice = choices[change.id] ?? 'skip';
    if (choice === 'skip' || !change.local) {
      unresolved.push(change);
      continue;
    }
    try {
      if (choice === 'local') {
        const result = await syncSavedPassword(change.local, userId, { force: true });
        records = records.map((record) => record.id === change.id
          ? { ...change.local!, cloudUpdatedAt: result.cloudUpdatedAt, cloudSnapshot: result.cloudSnapshot, syncState: 'synced' }
          : record);
      } else {
        const cloud = cloudByClientId.get(change.id);
        records = cloud
          ? records.map((record) => record.id === change.id ? recordToLocal(cloud) : record)
          : records.filter((record) => record.id !== change.id);
      }
    } catch {
      unresolved.push(change);
    }
  }
  return { records, unresolved };
}

export async function synchronizeSavedPasswords(
  localRecords: SavedPasswordRecord[],
  userId: string,
): Promise<SavedPasswordRecord[]> {
  const plan = await planSavedPasswordSync(localRecords, userId);
  const choices: Record<string, SavedPasswordChoice> = {};
  for (const change of plan.changes) {
    if (change.kind === 'create' || change.kind === 'push') choices[change.id] = 'local';
  }
  return (await applySavedPasswordChoices(plan, choices, userId)).records;
}
