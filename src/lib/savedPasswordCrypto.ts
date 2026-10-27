import { decryptExistingPassword, encryptExistingPassword } from '@/lib/passwordEncryption';
import type { PasswordEnvelopeV1 } from '@/lib/passwordEncryption';

type SavedPasswordField = 'name' | 'password';

interface SavedPasswordValue {
  format: 'paraules-saved-password:v1';
  field: SavedPasswordField;
  value: string;
  notes?: string;
  icon?: string;
  logoUrl?: string;
}

export interface SavedPasswordDetails {
  name: string;
  notes: string;
  icon: string;
  logoUrl?: string;
}

export async function encryptSavedPasswordField(
  value: string,
  master: string,
  field: SavedPasswordField,
  details?: Pick<SavedPasswordDetails, 'notes' | 'icon' | 'logoUrl'>,
): Promise<PasswordEnvelopeV1> {
  if (!value) throw new Error('El camp no pot ser buit.');
  if (field !== 'name' && details) throw new Error('Les observacions i la icona només es poden desar amb el nom.');
  const wrapped: SavedPasswordValue = {
    format: 'paraules-saved-password:v1',
    field,
    value,
    ...(details?.notes ? { notes: details.notes } : {}),
    ...(details?.icon ? { icon: details.icon } : {}),
    ...(details?.logoUrl ? { logoUrl: details.logoUrl } : {}),
  };
  return encryptExistingPassword(JSON.stringify(wrapped), master);
}

async function decryptSavedPasswordValue(
  envelope: unknown,
  master: string,
  expectedField: SavedPasswordField,
): Promise<SavedPasswordValue> {
  const plaintext = await decryptExistingPassword(envelope, master);
  let value: unknown;
  try {
    value = JSON.parse(plaintext);
  } catch {
    throw new Error('El contingut xifrat desat no té un format compatible.');
  }
  if (!value || typeof value !== 'object') {
    throw new Error('El contingut xifrat desat no té un format compatible.');
  }
  const decoded = value as Partial<SavedPasswordValue>;
  if (decoded.format !== 'paraules-saved-password:v1' ||
    decoded.field !== expectedField ||
    typeof decoded.value !== 'string' ||
    !decoded.value ||
    (decoded.notes !== undefined && typeof decoded.notes !== 'string') ||
    (decoded.icon !== undefined && typeof decoded.icon !== 'string') ||
    (decoded.logoUrl !== undefined && typeof decoded.logoUrl !== 'string')) {
    throw new Error('El contingut xifrat no correspon al camp esperat.');
  }
  return decoded as SavedPasswordValue;
}

export async function decryptSavedPasswordField(
  envelope: unknown,
  master: string,
  expectedField: SavedPasswordField,
): Promise<string> {
  return (await decryptSavedPasswordValue(envelope, master, expectedField)).value;
}

export async function decryptSavedPasswordDetails(
  envelope: unknown,
  master: string,
): Promise<SavedPasswordDetails> {
  const decoded = await decryptSavedPasswordValue(envelope, master, 'name');
  return {
    name: decoded.value,
    notes: decoded.notes ?? '',
    icon: decoded.icon ?? '🔐',
    ...(decoded.logoUrl ? { logoUrl: decoded.logoUrl } : {}),
  };
}
