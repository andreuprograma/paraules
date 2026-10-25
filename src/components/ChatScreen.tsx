import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, SlidersHorizontal, KeyRound, LogOut, Sparkles, Minus, Plus, RotateCcw, Search, ChevronsDownUp, ChevronsUpDown, ArrowUpDown, CloudOff, Cloud, ArrowUpAZ, ArrowDownAZ } from 'lucide-react';
import { generatePassword } from '@/lib/passwordGenerator';
import { getCloudUser } from '@/lib/pocketbase';
import { Theme } from '@/lib/theme';
import {
  ChatMessage,
  MessageOptions,
  SavedSettings,
  getChatMessages,
  setChatMessages,
  setDefaultSettings as persistDefaultSettings,
} from '@/lib/storage';
import PasswordBubble from './PasswordBubble';
import OptionsPanel from './OptionsPanel';
import SearchModal from './SearchModal';
import ImportExportModal from './ImportExportModal';

interface ChatScreenProps {
  seedWord: string;
  defaultSettings: SavedSettings;
  onDefaultSettingsChange: (s: SavedSettings) => void;
  verifyPin: (pin: string) => boolean;
  onLock: () => void;
  cloudStatus: 'offline' | 'syncing' | 'synced' | 'error';
  onInitialSync?: (messages: ChatMessage[]) => Promise<ChatMessage[]>;
  onCloudMessageChange?: (message: ChatMessage) => void;
  onCloudMessageDelete?: (message: ChatMessage) => void;
  onCloudLogoChange?: (message: ChatMessage, file: File | undefined, logoUrl: string | undefined) => Promise<string | undefined>;
  cloudUserId: string | null;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => void;
  onSignIn: () => void;
  focusBaseWordOnMount: boolean;
  onInitialFocusComplete: () => void;
}

type SortMode = 'created' | 'alpha';

function reloadLocalMessages(): void {
  window.dispatchEvent(new CustomEvent('paraules:reload-local'));
}

function highlightMessage(id: string, setHighlight: (id: string | null) => void) {
  setHighlight(id);
  window.setTimeout(() => setHighlight(null), 2200);
}

export default function ChatScreen({ seedWord, defaultSettings, onDefaultSettingsChange, verifyPin, onLock, cloudStatus, onInitialSync, onCloudMessageChange, onCloudMessageDelete, onCloudLogoChange, cloudUserId, theme, onThemeChange, onSignOut, onSignIn, focusBaseWordOnMount, onInitialFocusComplete }: ChatScreenProps) {
  const [baseWord, setBaseWord] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => getChatMessages(cloudUserId ?? undefined));
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [currentSettings, setCurrentSettings] = useState<SavedSettings>(defaultSettings);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [expandAllSignal, setExpandAllSignal] = useState(0);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const hasExpandedMessages = messages.some((message) => expandedMessageIds.has(message.id));
  const allCollapsed = !hasExpandedMessages;
  const [expandOneId, setExpandOneId] = useState<string | null>(null);
  const [expandOneSignal, setExpandOneSignal] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const [globalControlsVisible, setGlobalControlsVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialSyncStartedRef = useRef(false);
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
      }
    }).catch(() => undefined);
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
          }
        }).catch(() => undefined);
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
    const trimmed = baseWord.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    const existing = messages.find((message) => message.baseWord.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
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
    const password = generatePassword(seedWord, trimmed, generatedOptions);
    const now = new Date().toISOString();
    const msg: ChatMessage = {
      id: `${Date.now()}-${messages.length}`,
      baseWord: trimmed,
      password,
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

  function handleRegenerate(id: string, generatedOptions: MessageOptions) {
    const message = messages.find((item) => item.id === id);
    if (!message) return;
    const updatedMessage = {
      ...message,
      password: generatePassword(seedWord, message.baseWord, generatedOptions),
      options: generatedOptions,
      updatedAt: new Date().toISOString(),
    };
    setMessages((current) => current.map((item) => item.id === id ? updatedMessage : item));
    onCloudMessageChange?.(updatedMessage);
  }

  function handleDelete(id: string) {
    const message = messages.find((item) => item.id === id);
    if (message) onCloudMessageDelete?.(message);
    setMessages((current) => current.filter((item) => item.id !== id));
    setExpandedMessageIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setHighlightId((current) => current === id ? null : current);
  }

  function handleSaveComment(id: string, comment: string) {
    const message = messages.find((item) => item.id === id);
    if (!message) return;
    const updatedMessage = { ...message, comment, updatedAt: new Date().toISOString() };
    setMessages((current) => current.map((item) => item.id === id ? updatedMessage : item));
    onCloudMessageChange?.(updatedMessage);
  }

  async function handleSaveLogo(id: string, sourceUrl: string | undefined, file?: File): Promise<void> {
    const message = messages.find((item) => item.id === id);
    if (!message) return;
    const updatedMessage = {
      ...message,
      logoUrl: sourceUrl,
      updatedAt: new Date().toISOString(),
    };
    const savedLogoUrl = onCloudLogoChange
      ? await onCloudLogoChange(updatedMessage, file, file ? undefined : sourceUrl)
      : file
        ? undefined
        : sourceUrl;
    setMessages((current) => current.map((item) =>
      item.id === id ? { ...updatedMessage, logoUrl: savedLogoUrl } : item,
    ));
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
        const idx = next.findIndex((m) => m.baseWord.toLocaleLowerCase() === row.baseWord.toLocaleLowerCase());
        const password = generatePassword(seedWord, row.baseWord, row.options);
        const now = new Date().toISOString();
        const msg: ChatMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          baseWord: row.baseWord,
          password,
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

  const suggestions = useMemo(() => {
    const q = baseWord.trim().toLowerCase();
    if (!q) return [];
    return sortedMessages
      .filter((m) => m.baseWord.toLowerCase().startsWith(q) && m.baseWord.toLowerCase() !== q)
      .slice(0, 6);
  }, [sortedMessages, baseWord]);
  const exactMatch = useMemo(
    () => messages.find((message) => message.baseWord.toLocaleLowerCase() === baseWord.trim().toLocaleLowerCase()),
    [messages, baseWord],
  );
  const showGlobalControls = globalControlsVisible && !!baseWord.trim() && !exactMatch;

  useEffect(() => {
    setGlobalControlsVisible(false);
    if (!baseWord.trim() || exactMatch) return;
    const timeout = window.setTimeout(() => setGlobalControlsVisible(true), 350);
    return () => window.clearTimeout(timeout);
  }, [baseWord, exactMatch]);

  function selectSuggestion(idx: number) {
    const s = suggestions[idx];
    if (!s) return;
    highlightMessage(s.id, setHighlightId);
    setExpandOneId(s.id);
    setExpandOneSignal((n) => n + 1);
    setExpandedMessageIds((current) => new Set(current).add(s.id));
    scrollToMessage(s.id, true);
    setBaseWord('');
    setActiveSuggestionIdx(-1);
  }

  useEffect(() => {
    setActiveSuggestionIdx(-1);
  }, [baseWord]);

  const isCloudUser = !!getCloudUser();

  return (
    <div className="flex flex-col h-screen [height:100dvh] bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      <header className="flex-shrink-0 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 h-14 flex items-center justify-between z-20">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-tight">Paraules</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-tight">{messages.length} generades</p>
          </div>
          {cloudStatus !== 'offline' && (
            <span className={`text-[10px] ${cloudStatus === 'error' ? 'text-red-600 dark:text-red-400' : cloudStatus === 'syncing' ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {cloudStatus === 'error' ? 'Error de sync' : cloudStatus === 'syncing' ? 'Sync…' : 'Sincronitzat'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto shrink min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (allCollapsed) {
                  setExpandAllSignal((n) => n + 1);
                  setExpandedMessageIds(new Set(messages.map((message) => message.id)));
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
          {messages.length > 0 && (
            <button
              onClick={() => setSortMode((mode) => mode === 'created' ? 'alpha' : 'created')}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              aria-label={sortMode === 'created' ? 'Ordena alfabèticament' : 'Ordena per creació'}
              title={sortMode === 'created' ? 'Ordena alfabèticament' : 'Ordena per creació'}
            >
              {sortMode === 'created' ? <ArrowDownAZ className="w-5 h-5" /> : <ArrowUpAZ className="w-5 h-5" />}
            </button>
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
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Genera una contrasenya</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-xs">Escriu el nom d’un servei a sota, com ara «gmail» o «netflix», i prem la fletxa.</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto">
            {sortedMessages.map((msg) => (
              <div key={msg.id} data-message-id={msg.id} className={`rounded-2xl transition-all animate-[fadeIn_0.2s_ease-out] ${highlightId === msg.id ? 'ring-2 ring-amber-400/80 ring-offset-4 ring-offset-slate-50 dark:ring-offset-slate-950' : ''}`}>
                <PasswordBubble
                  messageId={msg.id}
                  baseWord={msg.baseWord}
                  initiallyExpanded={expandedMessageIds.has(msg.id)}
                  password={msg.password}
                  autoHide={msg.autoHide}
                  comment={msg.comment}
                  logoUrl={msg.logoUrl}
                  options={msg.options}
                  collapseAllSignal={collapseAllSignal}
                  expandAllSignal={expandAllSignal}
                  expandOneId={expandOneId}
                  expandOneSignal={expandOneSignal}
                  onExpandedChange={handleExpandedChange}
                  createdAt={msg.createdAt}
                  updatedAt={msg.updatedAt}
                  onRegenerate={(options) => handleRegenerate(msg.id, options)}
                  onDelete={() => handleDelete(msg.id)}
                  onSaveComment={(comment) => handleSaveComment(msg.id, comment)}
                  onSaveLogo={(logoUrl, file) => handleSaveLogo(msg.id, logoUrl, file)}
                  onHighlight={() => highlightMessage(msg.id, setHighlightId)}
                />
              </div>
            ))}
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
          <div className="flex-1 relative">
            <input ref={inputRef} type="text" value={baseWord} onChange={(e) => setBaseWord(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (activeSuggestionIdx >= 0) { selectSuggestion(activeSuggestionIdx); }
                else { handleGenerate(); }
              } else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestionIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestionIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Escape') { setActiveSuggestionIdx(-1); }
            }} placeholder="Paraula base…"
              maxLength={100}
              inputMode="text" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} className="w-full h-12 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            {suggestions.length > 0 && baseWord && (
              <ul className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-30">
                {suggestions.map((s, i) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => selectSuggestion(i)} onMouseEnter={() => setActiveSuggestionIdx(i)} className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3 transition-colors ${i === activeSuggestionIdx ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                      <span className="font-medium truncate">{s.baseWord}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">Obre fitxa</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={handleGenerate} disabled={!baseWord.trim()} className="w-12 h-12 flex-shrink-0 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-slate-950 flex items-center justify-center transition-colors" aria-label={exactMatch ? 'Obre la fitxa existent' : 'Genera'} title={exactMatch ? 'Obre la fitxa existent' : 'Genera una contrasenya'}>
            {exactMatch ? <Search className="w-5 h-5" /> : <Send className="w-5 h-5" />}
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
