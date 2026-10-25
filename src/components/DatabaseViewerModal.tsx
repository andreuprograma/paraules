import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Database, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { CloudInspectionRecord, listCloudInspectionRecords } from '@/lib/cloudSync';

interface DatabaseViewerModalProps {
  open: boolean;
  seedWord: string;
  onClose: () => void;
  onRecordsChanged?: () => void;
}

type SortKey = keyof CloudInspectionRecord;
type SortDir = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey | 'logo'; label: string }> = [
  { key: 'logo', label: 'Logo' },
  { key: 'baseWord', label: 'Paraula base' },
  { key: 'comment', label: 'Comentari' },
  { key: 'id', label: 'ID' },
  { key: 'userId', label: 'user_id' },
  { key: 'symbol', label: 'symbol' },
  { key: 'passwordLength', label: 'password_length' },
  { key: 'uppercase', label: 'uppercase' },
  { key: 'lowercase', label: 'lowercase' },
  { key: 'numbers', label: 'numbers' },
  { key: 'symbols', label: 'symbols' },
  { key: 'allowedSymbols', label: 'allowed_symbols' },
  { key: 'logoFilename', label: 'logo (fitxer)' },
  { key: 'logoExternalUrl', label: 'logo_url' },
  { key: 'deviceId', label: 'device_id' },
  { key: 'isDeleted', label: 'is_deleted' },
  { key: 'created', label: 'created' },
  { key: 'updated', label: 'updated' },
];

function formatCellValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return String(value);
  return value;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sortableValue(record: CloudInspectionRecord, key: SortKey | 'logo'): string | number | boolean {
  if (key === 'logo') return record.logoFilename || record.logoExternalUrl;
  if (key === 'created' || key === 'updated') return new Date(record[key]).getTime() || 0;
  return record[key] ?? '';
}

export default function DatabaseViewerModal({ open, seedWord, onClose }: DatabaseViewerModalProps) {
  const [records, setRecords] = useState<CloudInspectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | 'logo'>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const cloudRecords = await listCloudInspectionRecords(seedWord, showDeleted);
      setRecords(cloudRecords);
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : 'No s’ha pogut carregar la base de dades del núvol.');
    } finally {
      setLoading(false);
    }
  }, [seedWord, showDeleted]);

  useEffect(() => {
    if (open) {
      setQuery('');
      void load();
    }
  }, [load, open]);

  const filtered = useMemo(() => records.filter((record) => {
    const searchText = query.trim().toLocaleLowerCase();
    return !searchText || [
      record.baseWord,
      record.comment,
      record.id,
      record.userId,
      record.symbol,
      record.logoExternalUrl,
      record.deviceId,
    ].some((value) => value.toLocaleLowerCase().includes(searchText));
  }), [query, records]);

  const sorted = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const a = sortableValue(left, sortKey);
      const b = sortableValue(right, sortKey);
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
      if (typeof a === 'boolean' && typeof b === 'boolean') return (Number(a) - Number(b)) * direction;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
  }, [filtered, sortDir, sortKey]);

  function toggleSort(key: SortKey | 'logo'): void {
    if (sortKey === key) {
      setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ column }: { column: SortKey | 'logo' }): JSX.Element {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 inline h-3 w-3" />
      : <ArrowDown className="ml-1 inline h-3 w-3" />;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[6vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Base de dades del núvol</h2>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => void load()} disabled={loading} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Recarrega" title="Recarrega">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Tanca">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca en les dades del núvol…"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-100 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} className="accent-emerald-500" />
            Mostra eliminats
          </label>
        </div>

        {error && (
          <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 dark:text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
              {query.trim() ? 'No s’han trobat coincidències.' : 'No hi ha registres al núvol.'}
            </div>
          ) : (
            <table className="w-max min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  {COLUMNS.map(({ key, label }) => (
                    <th key={key} className="whitespace-nowrap border-b border-r border-slate-200 px-2 py-2 text-left font-semibold last:border-r-0 dark:border-slate-700">
                      <button onClick={() => void toggleSort(key)} className="flex items-center whitespace-nowrap hover:text-slate-900 dark:hover:text-white">
                        {label}<SortIcon column={key} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sorted.map((record) => (
                  <tr key={record.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${record.isDeleted ? 'opacity-50' : ''}`}>
                    {COLUMNS.map(({ key }) => {
                      if (key === 'logo') {
                        return (
                          <td key={key} className="border-r border-slate-200 px-2 py-2 text-center dark:border-slate-800">
                            {record.logoUrl ? (
                              <img
                                src={record.logoUrl}
                                alt=""
                                title={record.logoFilename || record.logoExternalUrl}
                                className="mx-auto h-8 w-8 object-contain"
                                onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
                              />
                            ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                        );
                      }
                      const rawValue = record[key];
                      const displayValue = key === 'created' || key === 'updated'
                        ? formatDate(String(rawValue))
                        : formatCellValue(rawValue);
                      const isLongText = key === 'baseWord' || key === 'comment' || key === 'allowedSymbols' || key === 'logoExternalUrl';
                      return (
                        <td
                          key={key}
                          title={displayValue === '—' ? undefined : displayValue}
                          className={`max-w-64 border-r border-slate-200 px-3 py-2 text-slate-700 dark:border-slate-800 dark:text-slate-300 ${isLongText ? 'truncate' : 'whitespace-nowrap'} ${key === 'id' || key === 'userId' || key === 'deviceId' || key === 'logoFilename' ? 'font-mono text-xs' : ''}`}
                        >
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
          {sorted.length} {sorted.length === 1 ? 'registre' : 'registres'} · Consulta de només lectura a PocketBase
        </div>
      </div>
    </div>
  );
}
