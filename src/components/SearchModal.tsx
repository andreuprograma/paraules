import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, MessageSquare, Lock } from 'lucide-react';
import { ChatMessage } from '@/lib/storage';

interface SearchModalProps {
  open: boolean;
  messages: ChatMessage[];
  onClose: () => void;
  manualItems?: Array<{ id: string; name: string; notes: string }>;
  onSelect: (id: string, kind: 'A' | 'B') => void;
}

type SearchResult =
  | { kind: 'A'; id: string; message: ChatMessage }
  | { kind: 'B'; id: string; name: string; notes: string };

export default function SearchModal({ open, messages, manualItems = [], onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    const normalized = query.toLowerCase();
    const automatic = messages
      .filter((msg) => !normalized ||
        msg.baseWord.toLowerCase().includes(normalized) ||
        msg.comment.toLowerCase().includes(normalized))
      .map((message): SearchResult => ({ kind: 'A', id: message.id, message }));
    const manual = manualItems
      .filter((item) => !normalized ||
        item.name.toLowerCase().includes(normalized) ||
        item.notes.toLowerCase().includes(normalized))
      .map((item): SearchResult => ({ kind: 'B', id: item.id, name: item.name, notes: item.notes }));
    return [...automatic, ...manual];
  }, [messages, manualItems, query]);

  if (!open) return null;

  function handleSelect(id: string, kind: 'A' | 'B') {
    onSelect(id, kind);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 dark:text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nom o comentari…"
            className="flex-1 bg-transparent text-slate-900 dark:text-white text-[15px] placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Tanca">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
              {query !== '' ? 'No s\'han trobat coincidències.' : 'Encara no hi has generat cap contrasenya.'}
            </div>
          ) : (
            <ul className="py-1">
              {results.map((result) => {
                const isManual = result.kind === 'B';
                const title = isManual ? result.name : result.message.baseWord;
                const comment = isManual ? result.notes : result.message.comment;
                return (
                  <li key={`${result.kind}:${result.id}`}>
                    <button
                      onClick={() => handleSelect(result.id, result.kind)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-3"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isManual ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        {isManual
                          ? <Lock className="w-4 h-4 text-indigo-500 dark:text-indigo-300" />
                          : comment ? <MessageSquare className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> : <span className="font-mono text-sm text-slate-500 dark:text-slate-400">{title.slice(0, 2)}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{title}</div>
                        {comment && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{comment}</div>
                        )}
                        <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">
                          {isManual ? 'Manual' : `Automàtica · ${result.message.options.length} caràcters`}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
