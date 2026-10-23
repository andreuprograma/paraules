const SEED_KEY = 'pwgen.seed';
const SETTINGS_KEY = 'pwgen.settings';
const AUTOHIDE_KEY = 'pwgen.autohide';
const CHAT_KEY = 'pwgen.chat';
const PIN_LOCKOUT_KEY = 'pwgen.pin_lockout';

export interface MessageOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  allowedSymbols: string;
}

export interface ChatMessage {
  id: string;
  baseWord: string;
  password: string;
  autoHide: boolean;
  comment: string;
  logoUrl?: string;
  options: MessageOptions;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedSettings {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  allowedSymbols: string;
  autoHide: boolean;
  autoCollapseSeconds: number;
}

export const DEFAULT_SETTINGS: SavedSettings = {
  length: 10,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  allowedSymbols: '',
  autoHide: true,
  autoCollapseSeconds: 15,
};

export function getEncryptedSeed(): string | null {
  return localStorage.getItem(SEED_KEY);
}

export function setEncryptedSeed(encrypted: string): void {
  localStorage.setItem(SEED_KEY, encrypted);
}

export function clearSeed(): void {
  localStorage.removeItem(SEED_KEY);
  localStorage.removeItem(CHAT_KEY);
}

export function resetLocalPasswordData(): void {
  const keysToRemove = new Set<string>([
    SEED_KEY,
    SETTINGS_KEY,
    AUTOHIDE_KEY,
    PIN_LOCKOUT_KEY,
  ]);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key === CHAT_KEY || key?.startsWith(`${CHAT_KEY}.`)) keysToRemove.add(key);
  }

  const snapshot = new Map<string, string | null>();
  for (const key of keysToRemove) snapshot.set(key, localStorage.getItem(key));

  try {
    for (const key of keysToRemove) localStorage.removeItem(key);
    for (const key of keysToRemove) {
      if (localStorage.getItem(key) !== null) {
        throw new Error('No s’han pogut esborrar totes les dades locals.');
      }
    }
  } catch {
    try {
      for (const [key, value] of snapshot) {
        if (value !== null) localStorage.setItem(key, value);
      }
    } catch {
      throw new Error('El restabliment ha fallat i no s’ha pogut restaurar completament l’estat local. No tanquis aquesta pestanya; demana assistència abans de continuar.');
    }
    throw new Error('No s’han pogut esborrar les dades locals. S’ha restaurat l’estat anterior.');
  }
}

export function getDefaultSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setDefaultSettings(settings: SavedSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function chatStorageKey(userId?: string): string {
  return userId ? `${CHAT_KEY}.${userId}` : CHAT_KEY;
}

export function getChatMessages(userId?: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatStorageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((message): ChatMessage[] => {
      if (!message || typeof message !== 'object') return [];
      const item = message as Record<string, unknown>;
      if (typeof item.id !== 'string' || typeof item.baseWord !== 'string' ||
        typeof item.password !== 'string' || typeof item.autoHide !== 'boolean') return [];
      const rawOptions = item.options;
      const options = rawOptions && typeof rawOptions === 'object' ? rawOptions as Record<string, unknown> : null;
      return [{
        id: item.id,
        baseWord: item.baseWord,
        password: item.password,
        autoHide: item.autoHide,
        comment: typeof item.comment === 'string' ? item.comment : '',
        logoUrl: typeof item.logoUrl === 'string'
          ? item.logoUrl
          : typeof item.logo_url === 'string' ? item.logo_url : undefined,
        options: {
          length: typeof options?.length === 'number' ? options.length : item.password.length,
          uppercase: typeof options?.uppercase === 'boolean' ? options.uppercase : /[A-Z]/.test(item.password),
          lowercase: typeof options?.lowercase === 'boolean' ? options.lowercase : /[a-z]/.test(item.password),
          numbers: typeof options?.numbers === 'boolean' ? options.numbers : /[0-9]/.test(item.password),
          symbols: typeof options?.symbols === 'boolean' ? options.symbols : /[^a-zA-Z0-9]/.test(item.password),
          allowedSymbols: typeof options?.allowedSymbols === 'string' ? options.allowedSymbols : '',
        },
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
      }];
    });
  } catch {
    return [];
  }
}

export function setChatMessages(messages: ChatMessage[], userId?: string): void {
  localStorage.setItem(chatStorageKey(userId), JSON.stringify(messages));
}

export function getAutoHide(): boolean {
  return localStorage.getItem(AUTOHIDE_KEY) !== 'false';
}

export function setAutoHide(enabled: boolean): void {
  localStorage.setItem(AUTOHIDE_KEY, String(enabled));
}
