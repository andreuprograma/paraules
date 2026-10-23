import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, MessageSquare } from 'lucide-react';
import { ChatMessage } from '@/lib/storage';

interface SearchModalProps {
  open: boolean;
  messages: ChatMessage[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function SearchModal({ open, messages, onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return messages;
    return messages.filter((msg) =>
      msg.baseWord.toLowerCase().includes(normalized) ||
      msg.comment.toLowerCase().includes(normalized)
    );
  }, [messages, query]);

  if (!open) return null;

  function handleSelect(id: string) {
    onSelect(id);
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
            placeholder="Cerca per paraula base o comentari…"
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
              {query.trim() ? 'No s\'han trobat coincidències.' : 'Encara no hi has generat cap contrasenya.'}
            </div>
          ) : (
            <ul className="py-1">
              {results.map((msg) => (
                <li key={msg.id}>
                  <button
                    onClick={() => handleSelect(msg.id)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {msg.comment ? <MessageSquare className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> : <span className="font-mono text-sm text-slate-500 dark:text-slate-400">{msg.baseWord.slice(0, 2)}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{msg.baseWord}</div>
                      {msg.comment && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{msg.comment}</div>
                      )}
                      <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">
                        {msg.options.length} caràcters
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
