export interface SeedVault {
  format: 2;
  master: {
    nonce: string;
    ciphertext: string;
  };
  wrappedKey: {
    salt: string;
    iterations: number;
    nonce: string;
    ciphertext: string;
  };
}

export interface CreatedSeedVault {
  vault: SeedVault;
}

const FORMAT = 2 as const;
const AES_NONCE_LENGTH = 12;
const PIN_SALT_LENGTH = 16;
const PIN_ITERATIONS = 600_000;
const MASTER_AAD = new TextEncoder().encode('paraules-master:v2');
const KEY_AAD = new TextEncoder().encode('paraules-pin-wrapped-key:v2');

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff || Number.isNaN(nextCodeUnit)) {
        throw new Error('La paraula mestra conté una seqüència Unicode no vàlida.');
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error('La paraula mestra conté una seqüència Unicode no vàlida.');
    }
  }
}

async function derivePinWrappingKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function assertVaultShape(value: unknown): asserts value is SeedVault {
  if (!value || typeof value !== 'object') throw new Error('El registre local de desbloqueig no té un format vàlid.');
  const candidate = value as Partial<SeedVault>;
  if (candidate.format !== FORMAT ||
    !candidate.master || typeof candidate.master.nonce !== 'string' ||
    typeof candidate.master.ciphertext !== 'string' ||
    !candidate.wrappedKey || typeof candidate.wrappedKey.salt !== 'string' ||
    candidate.wrappedKey.iterations !== PIN_ITERATIONS ||
    typeof candidate.wrappedKey.nonce !== 'string' ||
    typeof candidate.wrappedKey.ciphertext !== 'string') {
    throw new Error('El registre local no és compatible amb el desbloqueig només amb PIN.');
  }
}

async function unwrapDataKey(vault: SeedVault, pin: string): Promise<Uint8Array> {
  const wrappingKey = await derivePinWrappingKey(pin, decodeBase64(vault.wrappedKey.salt));
  const rawKey = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decodeBase64(vault.wrappedKey.nonce),
      additionalData: KEY_AAD,
      tagLength: 128,
    },
    wrappingKey,
    decodeBase64(vault.wrappedKey.ciphertext),
  );
  return new Uint8Array(rawKey);
}

export async function createSeedVault(master: string, pin: string): Promise<CreatedSeedVault> {
  assertWellFormedUnicode(master);
  if (master.length === 0) throw new Error('La paraula mestra no pot ser buida.');
  if (pin.length < 4) throw new Error('El PIN ha de tenir com a mínim 4 caràcters.');

  const dataKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const dataKey = await crypto.subtle.importKey('raw', dataKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const masterNonce = crypto.getRandomValues(new Uint8Array(AES_NONCE_LENGTH));
  const masterCiphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: masterNonce, additionalData: MASTER_AAD, tagLength: 128 },
    dataKey,
    new TextEncoder().encode(master),
  );

  const pinSalt = crypto.getRandomValues(new Uint8Array(PIN_SALT_LENGTH));
  const pinNonce = crypto.getRandomValues(new Uint8Array(AES_NONCE_LENGTH));
  const pinWrappingKey = await derivePinWrappingKey(pin, pinSalt);
  const wrappedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: pinNonce, additionalData: KEY_AAD, tagLength: 128 },
    pinWrappingKey,
    dataKeyBytes,
  );

  return {
    vault: {
      format: FORMAT,
      master: { nonce: encodeBase64(masterNonce), ciphertext: encodeBase64(new Uint8Array(masterCiphertext)) },
      wrappedKey: {
        salt: encodeBase64(pinSalt),
        iterations: PIN_ITERATIONS,
        nonce: encodeBase64(pinNonce),
        ciphertext: encodeBase64(new Uint8Array(wrappedKey)),
      },
    },
  };
}

export async function unlockSeedVault(vaultValue: unknown, pin: string): Promise<string> {
  assertVaultShape(vaultValue);
  const vault = vaultValue;

  try {
    const dataKeyBytes = await unwrapDataKey(vault, pin);
    const dataKey = await crypto.subtle.importKey('raw', dataKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBase64(vault.master.nonce),
        additionalData: MASTER_AAD,
        tagLength: 128,
      },
      dataKey,
      decodeBase64(vault.master.ciphertext),
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    throw new Error('No s’ha pogut desbloquejar. Comprova el PIN o la integritat de les dades locals.');
  }
}

export async function verifySeedVaultPin(vaultValue: unknown, pin: string): Promise<boolean> {
  try {
    assertVaultShape(vaultValue);
    await unwrapDataKey(vaultValue, pin);
    return true;
  } catch {
    return false;
  }
}
