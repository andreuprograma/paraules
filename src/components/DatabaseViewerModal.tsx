import { useEffect, useMemo, useState } from 'react';
import { Database, X, Eye, Pencil, Trash2, RefreshCw, Check, AlertCircle, Loader2, Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { DecodedRecord, listUserRecords, setRecordDeleted, updateRecordFields } from '@/lib/cloudSync';
import { MessageOptions, DEFAULT_SETTINGS } from '@/lib/storage';

interface DatabaseViewerModalProps {
  open: boolean;
  seedWord: string;
  onClose: () => void;
  onRecordsChanged?: () => void;
}

type View = 'list' | 'view' | 'edit';
type SortKey = 'baseWord' | 'options' | 'comment' | 'created' | 'status';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function optionsSummary(options: MessageOptions): string {
  const parts: string[] = [`${options.length}c`];
  if (options.uppercase) parts.push('AA');
  if (options.lowercase) parts.push('aa');
  if (options.numbers) parts.push('09');
  if (options.symbols) parts.push('@#');
  return parts.join(' ');
}

export default function DatabaseViewerModal({ open, seedWord, onClose, onRecordsChanged }: DatabaseViewerModalProps) {
  const [records, setRecords] = useState<DecodedRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<DecodedRecord | null>(null);
  const [query, setQuery] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [editBaseWord, setEditBaseWord] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editOptions, setEditOptions] = useState<MessageOptions>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DecodedRecord | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  async function load(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const list = await listUserRecords(seedWord, showDeleted);
      setRecords(list);
    } catch {
      setError('No s\'ha pogut carregar la base de dades.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      setView('list');
      setSelected(null);
      setQuery('');
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showDeleted]);

  function openView(record: DecodedRecord): void {
    setSelected(record);
    setView('view');
  }

  function openEdit(record: DecodedRecord): void {
    setSelected(record);
    setEditBaseWord(record.baseWord);
    setEditComment(record.comment);
    setEditOptions(record.options);
    setView('edit');
  }

  async function saveEdit(): Promise<void> {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const baseWord = editBaseWord.trim();
      if (!baseWord) {
        setError('La paraula base no pot ser buida.');
        setSaving(false);
        return;
      }
      await updateRecordFields(selected.id, {
        baseWord,
        comment: editComment.trim(),
        options: editOptions,
      }, seedWord);
      onRecordsChanged?.();
      await load();
      setView('list');
      setSelected(null);
    } catch {
      setError('No s\'ha pogut desar el registre.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDelete(record: DecodedRecord): Promise<void> {
    setError('');
    try {
      await setRecordDeleted(record.id, !record.isDeleted);
      onRecordsChanged?.();
      await load();
      setConfirmDelete(null);
    } catch {
      setError('No s\'ha pogut canviar l\'estat del registre.');
    }
  }

  const filtered = records.filter((record) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return record.baseWord.toLowerCase().includes(q) || record.comment.toLowerCase().includes(q);
  });

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dirFactor = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'baseWord':
          return a.baseWord.localeCompare(b.baseWord) * dirFactor;
        case 'comment':
          return (a.comment || '').localeCompare(b.comment || '') * dirFactor;
        case 'options':
          return (a.options.length - b.options.length) * dirFactor;
        case 'status':
          return ((a.isDeleted ? 1 : 0) - (b.isDeleted ? 1 : 0)) * dirFactor;
        case 'created':
        default:
          return ((new Date(a.created).getTime()) - (new Date(b.created).getTime())) * dirFactor;
      }
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((dir) => dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ column }: { column: SortKey }): JSX.Element {
    if (sortKey !== column) return <ArrowUpDown className="w-3 h-3 opacity-40 inline ml-1" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[6vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Base de dades del núvol</h2>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => void load()} disabled={loading} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40" aria-label="Recarrega" title="Recarrega">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Tanca">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {view === 'list' && (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca per paraula base o comentari…"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="accent-emerald-500" />
                Mostra eliminats
              </label>
            </div>

            {error && (
              <div className="mx-4 mt-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-red-600 dark:text-red-300 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="py-16 flex items-center justify-center text-slate-400 dark:text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm">
                  {query.trim() ? 'No s\'han trobat coincidències.' : 'No hi ha registres al núvol.'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wide">
                    <tr>
                      <th>
                        <button onClick={() => toggleSort('baseWord')} className="flex items-center px-4 py-2 font-semibold hover:text-slate-900 dark:hover:text-white text-left w-full">
                          Paraula base<SortIcon column="baseWord" />
                        </button>
                      </th>
                      <th className="hidden sm:table-cell">
                        <button onClick={() => toggleSort('options')} className="flex items-center px-4 py-2 font-semibold hover:text-slate-900 dark:hover:text-white text-left w-full">
                          Opcions<SortIcon column="options" />
                        </button>
                      </th>
                      <th className="hidden md:table-cell">
                        <button onClick={() => toggleSort('comment')} className="flex items-center px-4 py-2 font-semibold hover:text-slate-900 dark:hover:text-white text-left w-full">
                          Comentari<SortIcon column="comment" />
                        </button>
                      </th>
                      <th className="hidden lg:table-cell">
                        <button onClick={() => toggleSort('created')} className="flex items-center px-4 py-2 font-semibold hover:text-slate-900 dark:hover:text-white text-left w-full">
                          Creat<SortIcon column="created" />
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleSort('status')} className="flex items-center px-4 py-2 font-semibold hover:text-slate-900 dark:hover:text-white text-left w-full">
                          Estat<SortIcon column="status" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-2 font-semibold">Accions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {sorted.map((record) => (
                      <tr key={record.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${record.isDeleted ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{record.baseWord}</td>
                        <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-slate-500 dark:text-slate-400">{optionsSummary(record.options)}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-slate-600 dark:text-slate-400 max-w-xs truncate">{record.comment || '—'}</td>
                        <td className="px-4 py-3 hidden lg:table-cell text-slate-500 dark:text-slate-500 text-xs">{formatDate(record.created)}</td>
                        <td className="px-4 py-3">
                          {record.isDeleted ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">Eliminat</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">Actiu</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openView(record)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Visualitza" title="Visualitza">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => openEdit(record)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Edita" title="Edita">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setConfirmDelete(record)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={record.isDeleted ? 'Restaura' : 'Esborra'} title={record.isDeleted ? 'Restaura' : 'Esborra'}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0 text-xs text-slate-500 dark:text-slate-500">
              {sorted.length} {sorted.length === 1 ? 'registre' : 'registres'}
            </div>
          </>
        )}

        {view === 'view' && selected && (
          <div className="flex-1 overflow-auto px-5 py-5">
            <button onClick={() => setView('list')} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4">
              ← Torna a la llista
            </button>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Detall del registre</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Paraula base" value={selected.baseWord} mono />
              <Field label="Comentari" value={selected.comment || '—'} />
              <Field label="Llargada" value={String(selected.options.length)} />
              <Field label="Majúscules" value={selected.options.uppercase ? 'Sí' : 'No'} />
              <Field label="Minúscules" value={selected.options.lowercase ? 'Sí' : 'No'} />
              <Field label="Números" value={selected.options.numbers ? 'Sí' : 'No'} />
              <Field label="Símbols" value={selected.options.symbols ? 'Sí' : 'No'} />
              <Field label="Símbols permesos" value={selected.options.allowedSymbols || 'Per defecte'} mono />
              <Field label="Estat" value={selected.isDeleted ? 'Eliminat' : 'Actiu'} />
              <Field label="Creat" value={formatDate(selected.created)} />
              <Field label="Actualitzat" value={formatDate(selected.updated)} />
              <Field label="ID" value={selected.id} mono />
            </dl>
            <div className="mt-6 flex gap-2">
              <button onClick={() => openEdit(selected)} className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center gap-2">
                <Pencil className="w-4 h-4" /> Edita
              </button>
              <button onClick={() => setConfirmDelete(selected)} className="h-10 px-4 rounded-lg bg-red-100 dark:bg-red-950/60 hover:bg-red-200 dark:hover:bg-red-900 text-red-600 dark:text-red-300 text-sm font-medium flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> {selected.isDeleted ? 'Restaura' : 'Esborra'}
              </button>
            </div>
          </div>
        )}

        {view === 'edit' && selected && (
          <div className="flex-1 overflow-auto px-5 py-5">
            <button onClick={() => setView('list')} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4">
              ← Torna a la llista
            </button>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Edita el registre</h3>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-red-600 dark:text-red-300 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Paraula base</label>
                <input
                  type="text"
                  value={editBaseWord}
                  onChange={(e) => setEditBaseWord(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  className="w-full h-11 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Comentari</label>
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Llargada</label>
                  <input
                    type="number"
                    min={2}
                    max={100}
                    value={editOptions.length}
                    onChange={(e) => setEditOptions((o) => ({ ...o, length: Math.max(2, Math.min(100, Number(e.target.value) || 2)) }))}
                    className="w-full h-10 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                {(['uppercase', 'lowercase', 'numbers', 'symbols'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editOptions[key]}
                      onChange={(e) => setEditOptions((o) => ({ ...o, [key]: e.target.checked }))}
                      className="accent-emerald-500"
                    />
                    {key === 'uppercase' ? 'Majúscules' : key === 'lowercase' ? 'Minúscules' : key === 'numbers' ? 'Números' : 'Símbols'}
                  </label>
                ))}
              </div>
              {editOptions.symbols && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Símbols permesos</label>
                  <input
                    type="text"
                    value={editOptions.allowedSymbols}
                    onChange={(e) => setEditOptions((o) => ({ ...o, allowedSymbols: e.target.value }))}
                    placeholder="Buit = per defecte"
                    className="w-full h-11 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => void saveEdit()} disabled={saving} className="h-11 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-slate-950 text-sm font-semibold flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Desa
                </button>
                <button onClick={() => setView('list')} className="h-11 px-5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-medium">
                  Cancel·la
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-950/70 border border-red-200 dark:border-red-800/60 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                {confirmDelete.isDeleted ? 'Restaura registre' : 'Esborra registre'}
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              {confirmDelete.isDeleted
                ? `Vols restaurar el registre «${confirmDelete.baseWord}»? Tornarà a estar actiu.`
                : `Vols esborrar el registre «${confirmDelete.baseWord}»? S'eliminarà lògicament i es podrà restaurar.`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => void toggleDelete(confirmDelete)} className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-sm">
                Confirma
              </button>
              <button onClick={() => setConfirmDelete(null)} className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-medium text-sm">
                Cancel·la
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 dark:text-white break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
