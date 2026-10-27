import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, SlidersHorizontal, KeyRound, LockKeyhole, LogOut, Sparkles, Minus, Plus, RotateCcw, Search, ChevronsDownUp, ChevronsUpDown, ArrowUpDown, CloudOff, Cloud, ArrowUpAZ, ArrowDownAZ, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { getCloudUser } from '@/lib/pocketbase';
import type { PasswordEnvelopeV1 } from '@/lib/passwordEncryption';
import { decryptSavedPasswordDetails } from '@/lib/savedPasswordCrypto';
import { syncSavedPassword, synchronizeSavedPasswords } from '@/lib/savedPasswords';
import { Theme } from '@/lib/theme';
import {
  ChatMessage,
  MessageOptions,
  SavedPasswordRecord,
  SavedSettings,
  getChatMessages,
  getSavedPasswordRecords,
  setChatMessages,
  setSavedPasswordRecords,
  setDefaultSettings as persistDefaultSettings,
} from '@/lib/storage';
import PasswordBubble from './PasswordBubble';
import type { PasswordBubbleChanges } from './PasswordBubble';
import OptionsPanel from './OptionsPanel';
import SearchModal from './SearchModal';
import ImportExportModal from './ImportExportModal';
import SavedPasswordCards from './SavedPasswordCards';

interface ChatScreenProps {
  seedWord: string;
  defaultSettings: SavedSettings;
  onDefaultSettingsChange: (s: SavedSettings) => void;
  verifyPin: (pin: string) => Promise<boolean>;
  onLock: () => void;
  cloudStatus: 'offline' | 'syncing' | 'synced' | 'error';
  onInitialSync?: (messages: ChatMessage[]) => Promise<ChatMessage[]>;
  onCloudMessageChange?: (message: ChatMessage) => void;
  onCloudMessageDelete?: (message: ChatMessage) => Promise<void>;
  onCloudLogoChange?: (message: ChatMessage, file: File | undefined, logoUrl: string | undefined) => Promise<string | undefined>;
  cloudUserId: string | null;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => void;
  onSignIn: () => void;
  focusBaseWordOnMount: boolean;
  onInitialFocusComplete: () => void;
  cloudActionsEnabled: boolean;
}

type SortMode = 'created' | 'alpha';
type TypeFilter = 'all' | 'A' | 'B';

function reloadLocalMessages(): void {
  window.dispatchEvent(new CustomEvent('paraules:reload-local'));
}

function highlightMessage(id: string, setHighlight: (id: string | null) => void) {
  setHighlight(id);
  window.setTimeout(() => setHighlight(null), 2200);
}

export default function ChatScreen({ seedWord, defaultSettings, onDefaultSettingsChange, verifyPin, onLock, cloudStatus, onInitialSync, onCloudMessageChange, onCloudMessageDelete, onCloudLogoChange, cloudUserId, theme, onThemeChange, onSignOut, onSignIn, focusBaseWordOnMount, onInitialFocusComplete, cloudActionsEnabled }: ChatScreenProps) {
  const [baseWord, setBaseWord] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => getChatMessages(cloudUserId ?? undefined));
  const [cloudOperationError, setCloudOperationError] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newSavedPasswordDraft, setNewSavedPasswordDraft] = useState<{ id: string; password: string } | null>(null);
  const [savedPasswordRecords, setSavedPasswordRecordsState] = useState<SavedPasswordRecord[]>([]);
  const [savedPasswordRecordsLoaded, setSavedPasswordRecordsLoaded] = useState(false);
  const [savedPasswordRecordsAvailable, setSavedPasswordRecordsAvailable] = useState(false);
  const [savedPasswordError, setSavedPasswordError] = useState('');
  const [savedPasswordSyncState, setSavedPasswordSyncState] = useState<'offline' | 'syncing' | 'synced' | 'error' | 'conflict'>('offline');
  const [currentSettings, setCurrentSettings] = useState<SavedSettings>(defaultSettings);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [expandAllSignal, setExpandAllSignal] = useState(0);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const hasExpandedMessages = messages.some((message) => expandedMessageIds.has(message.id)) ||
    savedPasswordRecords.some((record) => !record.deleted && expandedMessageIds.has(record.id));
  const allCollapsed = !hasExpandedMessages;
  const [expandOneId, setExpandOneId] = useState<string | null>(null);
  const [expandOneSignal, setExpandOneSignal] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const [globalControlsVisible, setGlobalControlsVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialSyncStartedRef = useRef(false);
  const savedPasswordSyncStartedRef = useRef(false);
  const sessionUserIdRef = useRef(cloudUserId);

  useEffect(() => {
    if (!focusBaseWordOnMount) return;
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input?.isConnected && !input.disabled) input.focus({ preventScroll: true });
      onInitialFocusComplete();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusBaseWordOnMount, onInitialFocusComplete]);

  useEffect(() => {
    setSavedPasswordRecordsAvailable(false);
    try {
      setSavedPasswordRecordsState(getSavedPasswordRecords(cloudUserId ?? undefined));
      setSavedPasswordRecordsAvailable(true);
    } catch {
      setSavedPasswordError('No s’han pogut llegir les contrasenyes xifrades locals. Les dades no s’han sobreescrit.');
    } finally {
      setSavedPasswordRecordsLoaded(true);
    }
  }, [cloudUserId]);

  useEffect(() => {
    if (!savedPasswordRecordsLoaded || !savedPasswordRecordsAvailable) return;
    try {
      setSavedPasswordRecords(savedPasswordRecords, cloudUserId ?? undefined);
    } catch {
      setSavedPasswordError('No s’han pogut desar les contrasenyes xifrades locals. No es considera completat el canvi.');
    }
  }, [cloudUserId, savedPasswordRecords, savedPasswordRecordsAvailable, savedPasswordRecordsLoaded]);

  useEffect(() => {
    if (!savedPasswordRecordsLoaded || !savedPasswordRecordsAvailable || !cloudActionsEnabled || !cloudUserId || savedPasswordSyncStartedRef.current) return;
    savedPasswordSyncStartedRef.current = true;
    setSavedPasswordSyncState('syncing');
    synchronizeSavedPasswords(savedPasswordRecords, cloudUserId).then((records) => {
      if (sessionUserIdRef.current !== cloudUserId || getCloudUser()?.id !== cloudUserId) return;
      setSavedPasswordRecordsState(records);
      setSavedPasswordSyncState(records.some((record) => record.syncState === 'conflict')
        ? 'conflict'
        : records.some((record) => record.syncState === 'pending') ? 'error' : 'synced');
      setSavedPasswordError(records.some((record) => record.syncState === 'conflict')
        ? 'Hi ha conflictes entre dispositius. Les còpies s’han conservat i no s’han sobreescrit automàticament.'
        : '');
    }).catch(() => {
      if (sessionUserIdRef.current !== cloudUserId) return;
      setSavedPasswordSyncState('error');
      setSavedPasswordError(getCloudUser()?.id === cloudUserId
        ? 'No s’han pogut sincronitzar les contrasenyes desades. Les còpies locals s’han conservat.'
        : 'La sessió del núvol ha caducat o ha canviat. Les còpies locals s’han conservat.');
    });
  }, [cloudActionsEnabled, cloudUserId, savedPasswordRecords, savedPasswordRecordsAvailable, savedPasswordRecordsLoaded]);

  useEffect(() => {
    savedPasswordSyncStartedRef.current = false;
  }, [cloudUserId]);

  function updateSavedPasswordRecord(id: string, update: Partial<SavedPasswordRecord>): void {
    setSavedPasswordRecordsState((current) => current.map((record) =>
      record.id === id ? { ...record, ...update } : record,
    ));
  }

  async function synchronizeOneSavedPassword(record: SavedPasswordRecord): Promise<void> {
    if (!cloudActionsEnabled || !cloudUserId) return;
    setSavedPasswordSyncState('syncing');
    try {
      const { cloudUpdatedAt, cloudSnapshot } = await syncSavedPassword(record, cloudUserId);
      if (getCloudUser()?.id !== cloudUserId) return;
      updateSavedPasswordRecord(record.id, { cloudUpdatedAt, cloudSnapshot, syncState: 'synced' });
      setSavedPasswordSyncState('synced');
      setSavedPasswordError('');
    } catch {
      if (sessionUserIdRef.current !== cloudUserId) return;
      updateSavedPasswordRecord(record.id, { syncState: 'pending' });
      setSavedPasswordSyncState('error');
      setSavedPasswordError(getCloudUser()?.id === cloudUserId
        ? 'La contrasenya xifrada s’ha conservat en aquest dispositiu, però encara no s’ha sincronitzat.'
        : 'La sessió del núvol ha caducat o ha canviat. La contrasenya xifrada s’ha conservat localment.');
    }
  }

  async function handleSavePassword(name: PasswordEnvelopeV1, password: PasswordEnvelopeV1): Promise<void> {
    if (!savedPasswordRecordsAvailable) {
      throw new Error('No s’han pogut llegir les dades locals anteriors; no s’hi ha desat cap contrasenya nova.');
    }
    const now = new Date().toISOString();
    const record: SavedPasswordRecord = {
      id: crypto.randomUUID(),
      encryptedName: name,
      encryptedPassword: password,
      createdAt: now,
      updatedAt: now,
      syncState: cloudUserId ? 'pending' : 'local',
      deleted: false,
    };
    setSavedPasswordRecordsState((current) => [...current, record]);
    setSavedPasswordError('');
    await synchronizeOneSavedPassword(record);
  }

  async function handleUpdateSavedPassword(id: string, name: PasswordEnvelopeV1, password: PasswordEnvelopeV1): Promise<void> {
    const old = savedPasswordRecords.find((record) => record.id === id);
    if (!old) return;
    const updated: SavedPasswordRecord = {
      ...old,
      encryptedName: name,
      encryptedPassword: password,
      updatedAt: new Date().toISOString(),
      syncState: cloudUserId ? 'pending' : 'local',
    };
    setSavedPasswordRecordsState((current) => current.map((record) => record.id === id ? updated : record));
    await synchronizeOneSavedPassword(updated);
  }

  async function handleDeleteSavedPassword(id: string): Promise<void> {
    const old = savedPasswordRecords.find((record) => record.id === id);
    if (!old) return;
    const deleted: SavedPasswordRecord = {
      ...old,
      deleted: true,
      updatedAt: new Date().toISOString(),
      syncState: cloudUserId ? 'pending' : 'local',
    };
    setSavedPasswordRecordsState((current) => current.map((record) => record.id === id ? deleted : record));
    await synchronizeOneSavedPassword(deleted);
  }

  async function handleConvertSavedPasswordToPartA(
    id: string,
    details: { name: string; notes: string; icon: string; logoUrl?: string },
    options: MessageOptions,
  ): Promise<void> {
    const record = savedPasswordRecords.find((item) => item.id === id && !item.deleted);
    if (!record || !savedPasswordRecordsAvailable) {
      throw new Error('No s’ha pogut trobar la contrasenya desada. No s’ha fet cap conversió.');
    }

    const now = new Date().toISOString();
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      baseWord: details.name,
      autoHide: currentSettings.autoHide,
      comment: details.notes,
      ...(details.logoUrl ? { logoUrl: details.logoUrl } : {}),
      ...(details.icon ? { icon: details.icon } : {}),
      options,
      createdAt: record.createdAt,
      updatedAt: now,
    };
    const deleted: SavedPasswordRecord = {
      ...record,
      deleted: true,
      updatedAt: now,
      syncState: cloudUserId ? 'pending' : 'local',
    };

    setMessages((current) => [...current, message]);
    setSavedPasswordRecordsState((current) => current.map((item) => item.id === id ? deleted : item));
    setExpandedMessageIds((current) => new Set(current).add(message.id));
    setExpandOneId(message.id);
    setExpandOneSignal((current) => current + 1);
    setSavedPasswordError('');
    scrollToMessage(message.id, true);
    onCloudMessageChange?.(message);
  }

  function scrollToMessage(id: string, center = false) {
    window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      const message = Array.from(container?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])
        .find((element) => element.dataset.messageId === id);
      if (!container || !message) return;

      const containerRect = container.getBoundingClientRect();
      const messageRect = message.getBoundingClientRect();
      const visibleTop = containerRect.top + 8;
      const visibleBottom = containerRect.bottom - 8;
      const visibleHeight = visibleBottom - visibleTop;
      let scrollDelta = 0;

      if (center && messageRect.height <= visibleHeight) {
        scrollDelta = messageRect.top + messageRect.height / 2 - (visibleTop + visibleHeight / 2);
      } else if (messageRect.top < visibleTop) {
        scrollDelta = messageRect.top - visibleTop;
      } else if (messageRect.top >= visibleBottom) {
        scrollDelta = messageRect.top - visibleTop;
      } else if (messageRect.height <= visibleHeight && messageRect.bottom > visibleBottom) {
        scrollDelta = messageRect.bottom - visibleBottom;
      }

      if (scrollDelta !== 0) container.scrollBy({ top: scrollDelta, behavior: 'smooth' });
    });
  }

  useEffect(() => {
    if (!onInitialSync || initialSyncStartedRef.current) return;
    initialSyncStartedRef.current = true;
    onInitialSync(messages).then((syncedMessages) => {
      if (sessionUserIdRef.current === cloudUserId && (!cloudUserId || getCloudUser()?.id === cloudUserId)) {
        setMessages(syncedMessages);
        setCloudOperationError('');
      }
    }).catch((error: unknown) => {
      if (sessionUserIdRef.current !== cloudUserId || (cloudUserId && getCloudUser()?.id !== cloudUserId)) return;
      setCloudOperationError(error instanceof Error
        ? `No s’ha pogut llegir ni fusionar les dades del núvol. Les fitxes locals s’han conservat. Detall: ${error.message}`
        : 'No s’ha pogut llegir ni fusionar les dades del núvol. Les fitxes locals s’han conservat.');
    });
  }, [cloudUserId, messages, onInitialSync]);

  useEffect(() => {
    if (!cloudUserId || getCloudUser()?.id === cloudUserId) {
      setChatMessages(messages, cloudUserId ?? undefined);
    }
  }, [messages, cloudUserId]);

  useEffect(() => {
    function onReload() {
      if (onInitialSync) {
        onInitialSync(getChatMessages(cloudUserId ?? undefined)).then((syncedMessages) => {
          if (sessionUserIdRef.current === cloudUserId && (!cloudUserId || getCloudUser()?.id === cloudUserId)) {
            setMessages(syncedMessages);
            setCloudOperationError('');
          }
        }).catch((error: unknown) => {
          if (sessionUserIdRef.current !== cloudUserId || (cloudUserId && getCloudUser()?.id !== cloudUserId)) return;
          setCloudOperationError(error instanceof Error
            ? `No s’ha pogut llegir ni fusionar les dades del núvol. Les fitxes locals s’han conservat. Detall: ${error.message}`
            : 'No s’ha pogut llegir ni fusionar les dades del núvol. Les fitxes locals s’han conservat.');
        });
      }
    }
    window.addEventListener('paraules:reload-local', onReload);
    return () => window.removeEventListener('paraules:reload-local', onReload);
  }, [cloudUserId, onInitialSync]);

  function optionsToMessageOptions(s: SavedSettings): MessageOptions {
    return {
      length: s.length,
      uppercase: s.uppercase,
      lowercase: s.lowercase,
      numbers: s.numbers,
      symbols: s.symbols,
      allowedSymbols: s.allowedSymbols,
    };
  }

  function handleGenerate() {
    if (baseWord === '') {
      inputRef.current?.focus();
      return;
    }
    const existing = messages.find((message) => message.baseWord === baseWord);
    setTypeFilter('all');
    if (existing) {
      setExpandOneId(existing.id);
      setExpandOneSignal((n) => n + 1);
      setExpandedMessageIds((current) => new Set(current).add(existing.id));
      scrollToMessage(existing.id, true);
      highlightMessage(existing.id, setHighlightId);
      setBaseWord('');
      return;
    }
    const generatedOptions = optionsToMessageOptions(currentSettings);
    const now = new Date().toISOString();
    const msg: ChatMessage = {
      id: `${Date.now()}-${messages.length}`,
      baseWord,
      autoHide: currentSettings.autoHide,
      comment: '',
      options: generatedOptions,
      createdAt: now,
      updatedAt: now,
    };
    setMessages((current) => [...current, msg]);
    setExpandOneId(msg.id);
    setExpandOneSignal((n) => n + 1);
    setExpandedMessageIds((current) => new Set(current).add(msg.id));
    scrollToMessage(msg.id, true);
    onCloudMessageChange?.(msg);
    setBaseWord('');
    setCurrentSettings(defaultSettings);
  }

  async function handleDelete(id: string): Promise<void> {
    const message = messages.find((item) => item.id === id);
    setCloudOperationError('');
    try {
      if (message) await onCloudMessageDelete?.(message);
    } catch (deleteError) {
      setCloudOperationError(deleteError instanceof Error
        ? deleteError.message
        : 'No s’ha pogut eliminar la fitxa del núvol. La fitxa continua a la llista.');
      return;
    }
    setMessages((current) => current.filter((item) => item.id !== id));
    setExpandedMessageIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setHighlightId((current) => current === id ? null : current);
  }

  async function handleSaveMessageChanges(id: string, changes: PasswordBubbleChanges): Promise<void> {
    const message = messages.find((item) => item.id === id);
    if (!message || message.password !== undefined) {
      throw new Error('No s’ha pogut actualitzar aquesta fitxa de la Part A.');
    }
    const updatedMessage: ChatMessage = {
      ...message,
      comment: changes.comment,
      ...(changes.options ? { options: changes.options } : {}),
      ...(changes.logoChange ? { logoUrl: changes.logoChange.logoUrl } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (changes.logoChange) {
      updatedMessage.logoUrl = onCloudLogoChange
        ? await onCloudLogoChange(
          updatedMessage,
          changes.logoChange.file,
          changes.logoChange.file ? undefined : changes.logoChange.logoUrl,
        )
        : changes.logoChange.file ? undefined : changes.logoChange.logoUrl;
    }
    setMessages((current) => current.map((item) => item.id === id ? updatedMessage : item));
    onCloudMessageChange?.(updatedMessage);
  }

  function handleDefaultSettingsChange(nextSettings: SavedSettings) {
    onDefaultSettingsChange(nextSettings);
    persistDefaultSettings(nextSettings);
    setCurrentSettings(nextSettings);
  }

  function changeLength(amount: number) {
    setCurrentSettings((s) => ({
      ...s,
      length: Math.max(2, Math.min(100, s.length + amount)),
    }));
  }

  function toggleCharset(key: 'uppercase' | 'lowercase' | 'numbers' | 'symbols') {
    setCurrentSettings((s) => ({ ...s, [key]: !s[key] }));
  }

  function handleSearchSelect(id: string) {
    setExpandOneId(id);
    setExpandOneSignal((n) => n + 1);
    setExpandedMessageIds((current) => new Set(current).add(id));
    scrollToMessage(id);
    highlightMessage(id, setHighlightId);
  }

  function handleExpandedChange(id: string, expanded: boolean) {
    const container = scrollRef.current;
    const messageElement = Array.from(container?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])
      .find((element) => element.dataset.messageId === id);
    const previousTop = messageElement?.getBoundingClientRect().top;
    setExpandedMessageIds((current) => {
      if (current.has(id) === expanded) return current;
      const next = new Set(current);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
    if (expanded) scrollToMessage(id);
    else if (container && messageElement && previousTop !== undefined) {
      window.requestAnimationFrame(() => {
        const nextTop = messageElement.getBoundingClientRect().top;
        container.scrollBy({ top: nextTop - previousTop, behavior: 'auto' });
      });
    }
  }

  function handleImport(rows: { baseWord: string; options: MessageOptions; comment: string }[]) {
    setMessages((current) => {
      const next = [...current];
      for (const row of rows) {
        const idx = next.findIndex((m) => m.baseWord === row.baseWord);
        const now = new Date().toISOString();
        const msg: ChatMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          baseWord: row.baseWord,
          autoHide: currentSettings.autoHide,
          comment: row.comment,
          options: row.options,
          createdAt: now,
          updatedAt: now,
        };
        if (idx >= 0) {
          const updatedMessage = { ...next[idx], ...msg, id: next[idx].id };
          next[idx] = updatedMessage;
          onCloudMessageChange?.(updatedMessage);
        } else {
          next.push(msg);
          onCloudMessageChange?.(msg);
        }
      }
      return next;
    });
  }

  const charsetButtons = [
    { key: 'uppercase' as const, label: 'ABC' },
    { key: 'lowercase' as const, label: 'abc' },
    { key: 'numbers' as const, label: '123' },
    { key: 'symbols' as const, label: '@#!' },
  ];

  const usingDefaults =
    currentSettings.length === defaultSettings.length &&
    currentSettings.uppercase === defaultSettings.uppercase &&
    currentSettings.lowercase === defaultSettings.lowercase &&
    currentSettings.numbers === defaultSettings.numbers &&
    currentSettings.symbols === defaultSettings.symbols &&
    currentSettings.allowedSymbols === defaultSettings.allowedSymbols;

  const sortedMessages = useMemo(() => {
    if (sortMode === 'alpha') {
      return [...messages].sort((a, b) => a.baseWord.localeCompare(b.baseWord));
    }
    return messages;
  }, [messages, sortMode]);

  const [savedPasswordNames, setSavedPasswordNames] = useState<Record<string, string>>({});
  const [savedExpandId, setSavedExpandId] = useState<string | null>(null);
  const [savedExpandSignal, setSavedExpandSignal] = useState(0);
  useEffect(() => {
    let active = true;
    const activeRecords = savedPasswordRecords.filter((record) => !record.deleted);
    Promise.all(activeRecords.map(async (record) => {
      try {
        return [record.id, (await decryptSavedPasswordDetails(record.encryptedName, seedWord)).name] as const;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (!active) return;
      setSavedPasswordNames(Object.fromEntries(entries.filter((entry) => entry !== null)));
    });
    return () => { active = false; };
  }, [savedPasswordRecords, seedWord]);

  const displayItems = useMemo(() => {
    const items: Array<{ kind: 'A'; id: string; label: string; createdAt: string; message: ChatMessage } |
      { kind: 'B'; id: string; label: string; createdAt: string; record: SavedPasswordRecord }> = [];
    if (typeFilter !== 'B') {
      for (const message of messages) {
        items.push({ kind: 'A', id: message.id, label: message.baseWord, createdAt: message.createdAt ?? '', message });
      }
    }
    if (typeFilter !== 'A') {
      for (const record of savedPasswordRecords) {
        if (record.deleted) continue;
        items.push({ kind: 'B', id: record.id, label: savedPasswordNames[record.id] ?? '', createdAt: record.createdAt, record });
      }
    }
    return items.sort((left, right) => sortMode === 'alpha'
      ? left.label.localeCompare(right.label)
      : left.createdAt.localeCompare(right.createdAt));
  }, [messages, savedPasswordRecords, savedPasswordNames, typeFilter, sortMode]);
  const showDraft = !!newSavedPasswordDraft && typeFilter !== 'A';
  const visibleRecordCount = displayItems.length + (showDraft ? 1 : 0);

  const suggestions = useMemo(() => {
    const q = baseWord.toLowerCase();
    if (!q) return [];
    const partA = sortedMessages
      .filter((m) => m.baseWord.toLowerCase().startsWith(q) && m.baseWord !== baseWord)
      .map((m) => ({ id: m.id, baseWord: m.baseWord, kind: 'A' as const }));
    const partB = savedPasswordRecords
      .filter((record) => !record.deleted)
      .map((record) => ({ id: record.id, baseWord: savedPasswordNames[record.id] ?? '', kind: 'B' as const }))
      .filter((item) => item.baseWord.toLowerCase().startsWith(q) && item.baseWord !== baseWord);
    return [...partA, ...partB].slice(0, 6);
  }, [sortedMessages, savedPasswordRecords, savedPasswordNames, baseWord]);
  const exactMatch = useMemo(
    () => messages.find((message) => message.baseWord === baseWord),
    [messages, baseWord],
  );
  const showGlobalControls = globalControlsVisible && baseWord !== '' && !exactMatch;

  useEffect(() => {
    setGlobalControlsVisible(false);
    if (baseWord === '' || exactMatch) return;
    const timeout = window.setTimeout(() => setGlobalControlsVisible(true), 350);
    return () => window.clearTimeout(timeout);
  }, [baseWord, exactMatch]);

  function selectSuggestion(idx: number) {
    const s = suggestions[idx];
    if (!s) return;
    highlightMessage(s.id, setHighlightId);
    if (s.kind === 'B') {
      setSavedExpandId(s.id);
      setSavedExpandSignal((n) => n + 1);
    } else {
      setExpandOneId(s.id);
      setExpandOneSignal((n) => n + 1);
      setExpandedMessageIds((current) => new Set(current).add(s.id));
    }
    scrollToMessage(s.id, true);
    setBaseWord('');
    setActiveSuggestionIdx(-1);
  }

  useEffect(() => {
    setActiveSuggestionIdx(-1);
  }, [baseWord]);

  const isCloudUser = !!getCloudUser();
  const hasSavedPasswords = savedPasswordRecords.some((record) => !record.deleted);
  const combinedSync = (() => {
    if (!cloudUserId || !cloudActionsEnabled) return null;
    const states = [cloudStatus, ...(hasSavedPasswords ? [savedPasswordSyncState] : [])];
    if (states.includes('error') || states.includes('conflict')) {
      return { Icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', label: 'Error de sincronització', spin: false };
    }
    if (states.includes('syncing')) {
      return { Icon: RefreshCw, color: 'text-amber-600 dark:text-amber-300', label: 'Sincronitzant…', spin: true };
    }
    if (states.every((state) => state === 'synced')) {
      return { Icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', label: 'Sincronitzat', spin: false };
    }
    return { Icon: Cloud, color: 'text-slate-500', label: 'Sincronització pendent', spin: false };
  })();

  return (
    <div className="flex flex-col h-screen [height:100dvh] bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      <header className="flex-shrink-0 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 h-14 flex items-center justify-between z-20">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-tight">Paraules</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-tight" aria-live="polite">
              {visibleRecordCount} {visibleRecordCount === 1 ? 'registre mostrat' : 'registres mostrats'}
            </p>
          </div>
          {combinedSync && (
            <span
              role="status"
              title={combinedSync.label}
              aria-label={combinedSync.label}
              className={`flex shrink-0 items-center gap-1 text-[10px] ${combinedSync.color}`}
            >
              <combinedSync.Icon className={`h-4 w-4 ${combinedSync.spin ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{combinedSync.label}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto shrink min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (allCollapsed) {
                  setExpandAllSignal((n) => n + 1);
                  setExpandedMessageIds(new Set([
                    ...messages.map((message) => message.id),
                    ...savedPasswordRecords.filter((record) => !record.deleted).map((record) => record.id),
                  ]));
                } else {
                  setCollapseAllSignal((n) => n + 1);
                  setExpandedMessageIds(new Set());
                }
              }}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              aria-label={allCollapsed ? 'Desplega-ho tot' : 'Replega-ho tot'}
              title={allCollapsed ? 'Desplega totes les fitxes' : 'Replega totes les fitxes'}
            >
              {allCollapsed ? <ChevronsUpDown className="w-5 h-5" /> : <ChevronsDownUp className="w-5 h-5" />}
            </button>
          )}
          {(messages.length > 0 || savedPasswordRecords.some((record) => !record.deleted)) && (
            <div className="relative shrink-0">
              <button
                onClick={() => setViewMenuOpen((open) => !open)}
                className={`w-10 h-10 flex items-center justify-center rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ${typeFilter !== 'all' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}
                aria-label="Filtra i ordena les fitxes"
                title="Filtra i ordena les fitxes"
                aria-expanded={viewMenuOpen}
              >
                {sortMode === 'created' ? <ArrowDownAZ className="w-5 h-5" /> : <ArrowUpAZ className="w-5 h-5" />}
              </button>
              {viewMenuOpen && (
                <div className="fixed right-2 top-14 z-40 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <p className="px-2 pb-1 text-xs font-semibold uppercase text-slate-400">Mostra</p>
                  {([['all', 'Totes'], ['A', 'Només Part A'], ['B', 'Només Part B']] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setTypeFilter(value)} aria-pressed={typeFilter === value} className={`w-full rounded-lg px-2 py-2 text-left text-sm ${typeFilter === value ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>{label}</button>
                  ))}
                  <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase text-slate-400">Ordena</p>
                  {([['alpha', 'Per ordre alfabètic'], ['created', 'Per entrada (data de creació)']] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setSortMode(value)} aria-pressed={sortMode === value} className={`w-full rounded-lg px-2 py-2 text-left text-sm ${sortMode === value ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>{label}</button>
                  ))}
                  <button type="button" onClick={() => setViewMenuOpen(false)} className="mt-1 w-full rounded-lg bg-slate-100 px-2 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Tanca</button>
                </div>
              )}
            </div>
          )}
          <button onClick={() => setSearchOpen(true)} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" aria-label="Cerca">
            <Search className="w-5 h-5" />
          </button>
          <button onClick={() => setImportOpen(true)} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" aria-label="Importa o exporta" title="Importa / exporta">
            <ArrowUpDown className="w-5 h-5" />
          </button>
          <button onClick={() => setOptionsOpen(true)} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" aria-label="Més opcions">
            <SlidersHorizontal className="w-5 h-5" />
          </button>
          {isCloudUser ? (
            <button onClick={onSignOut} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" aria-label="Tanca la sessió" title="Tanca la sessió">
              <CloudOff className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={onSignIn} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" aria-label="Inicia sessió" title="Inicia sessió">
              <Cloud className="w-5 h-5" />
            </button>
          )}
          <button onClick={onLock} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" aria-label="Bloqueja la caixa" title="Bloqueja la caixa">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 overscroll-contain">
        {!cloudActionsEnabled && cloudUserId && (
          <div role="status" className="mx-auto mb-4 max-w-2xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            La sincronització i les eines del núvol estan pausades. La clau antiga de PocketBase deriva la paraula mestra normalitzada; s’han pausat les operacions per evitar sobreescriure dades o crear duplicats.
          </div>
        )}
        {savedPasswordError && (
          <div role="alert" className="mx-auto mb-4 flex max-w-2xl items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            <span>{savedPasswordError}</span>
            <button type="button" onClick={() => setSavedPasswordError('')} className="ml-auto shrink-0 underline" aria-label="Tanca l’error de contrasenyes desades">Tanca</button>
          </div>
        )}
        {cloudOperationError && (
          <div role="alert" className="mx-auto mb-4 flex max-w-2xl items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            <span>{cloudOperationError}</span>
            <button
              type="button"
              onClick={() => setCloudOperationError('')}
              className="ml-auto shrink-0 underline"
              aria-label="Tanca l’error"
            >
              Tanca
            </button>
          </div>
        )}
        {messages.length === 0 && !savedPasswordRecords.some((record) => !record.deleted) && !newSavedPasswordDraft ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Genera una contrasenya</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-xs">Escriu el nom d’un servei a sota, com ara «gmail» o «netflix», i prem la fletxa.</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto">
            {showDraft && (
              <SavedPasswordCards
                records={[]}
                seedWord={seedWord}
                defaultOptions={optionsToMessageOptions(currentSettings)}
                draft={newSavedPasswordDraft}
                onSave={handleSavePassword}
                onUpdate={handleUpdateSavedPassword}
                onDelete={handleDeleteSavedPassword}
                onConvertToPartA={handleConvertSavedPasswordToPartA}
                onCancelDraft={() => setNewSavedPasswordDraft(null)}
                autoHide={currentSettings.autoHide}
              />
            )}
            {displayItems.map((item) => item.kind === 'A' ? (
              <div key={item.id} data-message-id={item.message.id} className={`rounded-2xl transition-all animate-[fadeIn_0.2s_ease-out] ${highlightId === item.message.id ? 'ring-2 ring-amber-400/80 ring-offset-4 ring-offset-slate-50 dark:ring-offset-slate-950' : ''}`}>
                <PasswordBubble
                  messageId={item.message.id}
                  baseWord={item.message.baseWord}
                  seedWord={seedWord}
                  password={item.message.password}
                  initiallyExpanded={expandedMessageIds.has(item.message.id)}
                  autoHide={item.message.autoHide}
                  comment={item.message.comment}
                  logoUrl={item.message.logoUrl}
                  icon={item.message.icon}
                  options={item.message.options}
                  collapseAllSignal={collapseAllSignal}
                  expandAllSignal={expandAllSignal}
                  expandOneId={expandOneId}
                  expandOneSignal={expandOneSignal}
                  onExpandedChange={handleExpandedChange}
                  createdAt={item.message.createdAt}
                  updatedAt={item.message.updatedAt}
                  onSaveChanges={(changes) => handleSaveMessageChanges(item.message.id, changes)}
                  onDelete={() => { void handleDelete(item.message.id); }}
                  onHighlight={() => highlightMessage(item.message.id, setHighlightId)}
                />
              </div>
            ) : (
              <SavedPasswordCards
                key={item.id}
                records={[item.record]}
                seedWord={seedWord}
                defaultOptions={optionsToMessageOptions(currentSettings)}
                draft={null}
                onSave={handleSavePassword}
                onUpdate={handleUpdateSavedPassword}
                onDelete={handleDeleteSavedPassword}
                onConvertToPartA={handleConvertSavedPasswordToPartA}
                onCancelDraft={() => setNewSavedPasswordDraft(null)}
                autoHide={currentSettings.autoHide}
                collapseAllSignal={collapseAllSignal}
                expandAllSignal={expandAllSignal}
                onExpandedChange={handleExpandedChange}
                highlightId={highlightId}
                expandId={savedExpandId}
                expandSignal={savedExpandSignal}
              />
            ))}
            {displayItems.length === 0 && !showDraft && (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No hi ha fitxes d’aquest tipus.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div
          className={`max-w-2xl mx-auto overflow-hidden transition-[max-height,opacity,transform,margin] duration-300 ease-out ${showGlobalControls ? 'mb-3 max-h-36 opacity-100 translate-y-0' : 'mb-0 max-h-0 opacity-0 -translate-y-2 pointer-events-none'}`}
          aria-hidden={!showGlobalControls}
        >
          {showGlobalControls && (
            <div className="flex flex-wrap items-center justify-center gap-2 pb-1">
              <div className="h-11 shrink-0 rounded-full bg-slate-900 dark:bg-slate-100 flex items-center px-1 text-slate-50 dark:text-slate-950">
                <button onClick={() => changeLength(-1)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-800 dark:hover:bg-slate-200" aria-label="Redueix la llargada"><Minus className="w-5 h-5" /></button>
                <span className="w-10 text-center font-semibold text-[17px]">{currentSettings.length}</span>
                <button onClick={() => changeLength(1)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-800 dark:hover:bg-slate-200" aria-label="Augmenta la llargada"><Plus className="w-5 h-5" /></button>
              </div>
              {charsetButtons.map(({ key, label }) => (
                <button key={key} onClick={() => toggleCharset(key)} aria-pressed={currentSettings[key]} className={`shrink-0 w-11 h-11 rounded-full font-semibold text-[14px] transition-colors ${currentSettings[key] ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-500 border border-slate-300 dark:border-slate-700'}`}>
                  {label}
                </button>
              ))}
              {!usingDefaults && (
                <button onClick={() => setCurrentSettings(defaultSettings)} className="shrink-0 w-11 h-11 rounded-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors" aria-label="Restableix les opcions per defecte">
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 max-w-2xl mx-auto relative">
          <div className="relative min-w-0 flex-1">
            <input ref={inputRef} type="text" value={baseWord} onChange={(e) => setBaseWord(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (activeSuggestionIdx >= 0) { selectSuggestion(activeSuggestionIdx); }
                else { handleGenerate(); }
              } else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestionIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestionIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Escape') { setActiveSuggestionIdx(-1); }
            }} placeholder="Paraula base o contrasenya externa…"
              maxLength={100}
              inputMode="text" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} className="w-full h-12 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            {suggestions.length > 0 && baseWord && (
              <ul className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-30">
                {suggestions.map((s, i) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => selectSuggestion(i)} onMouseEnter={() => setActiveSuggestionIdx(i)} className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3 transition-colors ${i === activeSuggestionIdx ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                      <span className="font-medium truncate">{s.baseWord}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{s.kind === 'B' ? 'Obre fitxa B' : 'Obre fitxa'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={handleGenerate} disabled={baseWord === ''} className="w-12 h-12 flex-shrink-0 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-slate-950 flex items-center justify-center transition-colors" aria-label={exactMatch ? 'Obre la fitxa existent' : 'Genera'} title={exactMatch ? 'Obre la fitxa existent' : 'Genera una contrasenya'}>
            {exactMatch ? <Search className="w-5 h-5" /> : <Send className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setTypeFilter('all');
              setNewSavedPasswordDraft({ id: crypto.randomUUID(), password: baseWord });
            }}
            className="w-12 h-12 flex-shrink-0 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 flex items-center justify-center transition-colors"
            aria-label="Desa a la Part B"
            title="Desa una contrasenya manualment a la Part B"
          >
            <LockKeyhole className="w-5 h-5" />
          </button>
        </div>
      </div>

      <OptionsPanel
        open={optionsOpen}
        settings={defaultSettings}
        messageCount={messages.length}
        onChange={handleDefaultSettingsChange}
        onClearAll={() => {
          setMessages([]);
          setExpandedMessageIds(new Set());
        }}
        verifyPin={verifyPin}
        cloudActionsEnabled={cloudActionsEnabled}
        onClose={() => setOptionsOpen(false)}
        theme={theme}
        onThemeChange={onThemeChange}
        seedWord={seedWord}
        onRecordsChanged={reloadLocalMessages}
      />
      <SearchModal open={searchOpen} messages={messages} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} />
      <ImportExportModal open={importOpen} messages={messages} onImport={handleImport} onClose={() => setImportOpen(false)} />
    </div>
  );
}
