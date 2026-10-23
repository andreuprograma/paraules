const SEED_KEY = 'pwgen.seed';
const SETTINGS_KEY = 'pwgen.settings';
const AUTOHIDE_KEY = 'pwgen.autohide';
const CHAT_KEY = 'pwgen.chat';

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

export function getChatMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
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

export function setChatMessages(messages: ChatMessage[]): void {
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

export function getAutoHide(): boolean {
  return localStorage.getItem(AUTOHIDE_KEY) !== 'false';
}

export function setAutoHide(enabled: boolean): void {
  localStorage.setItem(AUTOHIDE_KEY, String(enabled));
}
