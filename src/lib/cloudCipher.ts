export type CloudCipherField = 'base' | 'comment';

const PREFIX = 'paraules:v2:';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 128;
const HKDF_SALT = new TextEncoder().encode('paraules-cloud-v2-hkdf-salt');
const encoder = new TextEncoder();

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff || Number.isNaN(nextCodeUnit)) {
        throw new Error('El text del núvol conté una seqüència Unicode no vàlida.');
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error('El text del núvol conté una seqüència Unicode no vàlida.');
    }
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('El ciphertext del núvol té un format no vàlid.');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveCloudKey(seedWord: string, userId: string, field: CloudCipherField): Promise<CryptoKey> {
  assertWellFormedUnicode(seedWord);
  if (!seedWord) throw new Error('La paraula mestra no pot ser buida per xifrar al núvol.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(seedWord), 'HKDF', false, ['deriveKey']);
  const info = encoder.encode(JSON.stringify(['paraules-cloud-v2', userId, field]));
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isVersionedCloudCiphertext(value: string): boolean {
  return value.startsWith(PREFIX);
}

export async function encryptCloudValue(
  value: string,
  seedWord: string,
  userId: string,
  field: CloudCipherField,
): Promise<string> {
  assertWellFormedUnicode(value);
  const key = await deriveCloudKey(seedWord, userId, field);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const aad = encoder.encode(JSON.stringify(['paraules-cloud-v2', userId, field]));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: TAG_LENGTH },
    key,
    encoder.encode(value),
  );
  const envelope = new Uint8Array(nonce.length + ciphertext.byteLength);
  envelope.set(nonce);
  envelope.set(new Uint8Array(ciphertext), nonce.length);
  return PREFIX + encodeBase64Url(envelope);
}

export async function decryptCloudValue(
  encryptedValue: string,
  seedWord: string,
  userId: string,
  field: CloudCipherField,
): Promise<string> {
  if (!isVersionedCloudCiphertext(encryptedValue)) {
    throw new Error('El ciphertext no és del format actual del núvol.');
  }
  const envelope = decodeBase64Url(encryptedValue.slice(PREFIX.length));
  if (envelope.length < NONCE_LENGTH + TAG_LENGTH / 8) {
    throw new Error('El ciphertext del núvol és incomplet.');
  }
  const nonce = envelope.slice(0, NONCE_LENGTH);
  const ciphertext = envelope.slice(NONCE_LENGTH);
  const aad = encoder.encode(JSON.stringify(['paraules-cloud-v2', userId, field]));
  const key = await deriveCloudKey(seedWord, userId, field);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: TAG_LENGTH },
      key,
      ciphertext,
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    throw new Error('No s’ha pogut autenticar ni desxifrar el ciphertext del núvol.');
  }
}
