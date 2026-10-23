import CryptoJS from 'crypto-js';

export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  allowedSymbols?: string;
}

export const DEFAULT_CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

export function normalizeSeed(text: string): string {
  return text.trim().normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function generatePassword(seedWord: string, baseWord: string, options: PasswordOptions): string {
  const length = Math.max(2, Math.min(100, Math.floor(options.length)));
  const symbolsCharset = options.allowedSymbols && options.allowedSymbols.length > 0
    ? options.allowedSymbols
    : DEFAULT_CHARSETS.symbols;

  const selectedCharsets: Record<string, string> = {};
  if (options.uppercase) selectedCharsets.uppercase = DEFAULT_CHARSETS.uppercase;
  if (options.lowercase) selectedCharsets.lowercase = DEFAULT_CHARSETS.lowercase;
  if (options.numbers) selectedCharsets.numbers = DEFAULT_CHARSETS.numbers;
  if (options.symbols) selectedCharsets.symbols = symbolsCharset;

  if (Object.keys(selectedCharsets).length === 0) {
    selectedCharsets.lowercase = DEFAULT_CHARSETS.lowercase;
  }

  const charsetKeys = Object.keys(selectedCharsets);

  const hash = CryptoJS.SHA256(seedWord + baseWord).toString();
  const hashNumbers = hash.split('').map((c) => parseInt(c, 16));

  let password = '';
  const minLength = Math.min(length, charsetKeys.length);
  for (let i = 0; i < minLength; i++) {
    const charset = selectedCharsets[charsetKeys[i]];
    password += charset[hashNumbers[i % hashNumbers.length] % charset.length];
  }

  const numCharsets = charsetKeys.length;
  while (password.length < length) {
    const charsetIndex = hashNumbers[password.length % hashNumbers.length] % numCharsets;
    const charset = selectedCharsets[charsetKeys[charsetIndex]];
    const charIndex = hashNumbers[(password.length + 1) % hashNumbers.length] % charset.length;
    password += charset[charIndex];
  }

  const array = password.split('');
  for (let i = array.length - 1; i > 0; i--) {
    const j = hashNumbers[i % hashNumbers.length] % (i + 1);
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }

  return array.join('');
}

export function encryptSeed(seedWord: string, pin: string): string {
  const normalized = normalizeSeed(seedWord);
  return CryptoJS.AES.encrypt(normalized, pin).toString();
}

export function decryptSeed(encrypted: string, pin: string): string | null {
  try {
    const decrypted = CryptoJS.AES.decrypt(encrypted, pin).toString(CryptoJS.enc.Utf8);
    return decrypted || null;
  } catch {
    return null;
  }
}

export function estimateStrength(password: string): { score: number; label: string; entropy: number } {
  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;
  const entropy = password.length * Math.log2(poolSize || 26);

  if (entropy < 40) return { score: 1, label: 'Dèbil', entropy };
  if (entropy < 60) return { score: 2, label: 'Acceptable', entropy };
  if (entropy < 80) return { score: 3, label: 'Forta', entropy };
  return { score: 4, label: 'Molt forta', entropy };
}
