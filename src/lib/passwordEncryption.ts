export interface PasswordEnvelopeV1 {
  version: 1;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-HMAC-SHA-256';
  iterations: 600_000;
  salt: string;
  nonce: string;
  ciphertext: string;
}

const ENVELOPE_VERSION = 1 as const;
const AES_ALGORITHM = 'AES-256-GCM' as const;
const KDF_ALGORITHM = 'PBKDF2-HMAC-SHA-256' as const;
const PBKDF2_ITERATIONS = 600_000 as const;
const SALT_LENGTH_BYTES = 16;
const NONCE_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BITS = 128;
const ENVELOPE_AAD = new TextEncoder().encode('paraules-password-envelope:v1');
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class PasswordEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordEnvelopeError';
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string, expectedLength?: number): Uint8Array {
  if (!BASE64_PATTERN.test(value)) throw new PasswordEnvelopeError('L’envelope de contrasenya no és vàlid.');
  const decoded = atob(value);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new PasswordEnvelopeError('L’envelope de contrasenya no és vàlid.');
  }
  return bytes;
}

function validateEnvelope(value: unknown): PasswordEnvelopeV1 {
  if (!value || typeof value !== 'object') {
    throw new PasswordEnvelopeError('L’envelope de contrasenya no és vàlid o no és compatible.');
  }

  const envelope = value as Partial<PasswordEnvelopeV1>;
  if (envelope.version !== ENVELOPE_VERSION ||
      envelope.algorithm !== AES_ALGORITHM ||
      envelope.kdf !== KDF_ALGORITHM ||
      envelope.iterations !== PBKDF2_ITERATIONS ||
      typeof envelope.salt !== 'string' ||
      typeof envelope.nonce !== 'string' ||
      typeof envelope.ciphertext !== 'string') {
    throw new PasswordEnvelopeError('L’envelope de contrasenya no és vàlid o no és compatible.');
  }

  decodeBase64(envelope.salt, SALT_LENGTH_BYTES);
  decodeBase64(envelope.nonce, NONCE_LENGTH_BYTES);
  const ciphertext = decodeBase64(envelope.ciphertext);
  if (ciphertext.length <= AUTH_TAG_LENGTH_BITS / 8) {
    throw new PasswordEnvelopeError('L’envelope de contrasenya no és vàlid.');
  }

  return envelope as PasswordEnvelopeV1;
}

async function deriveKey(master: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(master),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptExistingPassword(
  password: string,
  master: string,
): Promise<PasswordEnvelopeV1> {
  if (!password) throw new PasswordEnvelopeError('La contrasenya no pot ser buida.');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH_BYTES));
  const key = await deriveKey(master, salt);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: ENVELOPE_AAD,
      tagLength: AUTH_TAG_LENGTH_BITS,
    },
    key,
    new TextEncoder().encode(password),
  );

  return {
    version: ENVELOPE_VERSION,
    algorithm: AES_ALGORITHM,
    kdf: KDF_ALGORITHM,
    iterations: PBKDF2_ITERATIONS,
    salt: encodeBase64(salt),
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptExistingPassword(
  envelopeValue: unknown,
  master: string,
): Promise<string> {
  const envelope = validateEnvelope(envelopeValue);
  const salt = decodeBase64(envelope.salt, SALT_LENGTH_BYTES);
  const nonce = decodeBase64(envelope.nonce, NONCE_LENGTH_BYTES);
  const ciphertext = decodeBase64(envelope.ciphertext);
  const key = await deriveKey(master, salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: ENVELOPE_AAD,
        tagLength: AUTH_TAG_LENGTH_BITS,
      },
      key,
      ciphertext,
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    throw new PasswordEnvelopeError('No s’ha pogut desxifrar la contrasenya. Comprova la paraula mestra o la integritat de les dades.');
  }
}
