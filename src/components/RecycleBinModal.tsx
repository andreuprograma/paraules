import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Image, Loader2, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import {
  CloudInspectionRecord,
  listDeletedCloudRecords,
  permanentlyDeleteCloudRecord,
  restoreDeletedCloudRecord,
} from '@/lib/cloudSync';

interface RecycleBinModalProps {
  open: boolean;
  seedWord: string;
  onClose: () => void;
  onRecordsChanged?: () => void;
}

function formatDate(value: string): string {
  if (!value) return 'Data desconeguda';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('ca-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function RecycleBinModal({ open, seedWord, onClose, onRecordsChanged }: RecycleBinModalProps) {
  const [records, setRecords] = useState<CloudInspectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const deletedRecords = await listDeletedCloudRecords(seedWord);
      if (version === requestVersion.current) setRecords(deletedRecords);
    } catch (loadError) {
      if (version === requestVersion.current) {
        setError(loadError instanceof Error ? loadError.message : 'No s’ha pogut carregar la paperera del núvol.');
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [seedWord]);

  useEffect(() => {
    if (open) void load();
    else requestVersion.current += 1;
  }, [load, open]);

  async function restore(record: CloudInspectionRecord): Promise<void> {
    setBusyId(record.id);
    setError('');
    try {
      await restoreDeletedCloudRecord(record.id);
      onRecordsChanged?.();
      await load();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'No s’ha pogut restaurar la fitxa.');
    } finally {
      setBusyId(null);
    }
  }

  async function permanentlyDelete(record: CloudInspectionRecord): Promise<void> {
    const confirmed = window.confirm(`Eliminar permanentment «${record.baseWord}»? Aquesta acció no es pot desfer.`);
    if (!confirmed) return;
    setBusyId(record.id);
    setError('');
    try {
      await permanentlyDeleteCloudRecord(record.id);
      onRecordsChanged?.();
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No s’ha pogut eliminar permanentment la fitxa.');
    } finally {
      setBusyId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[6vh]" role="dialog" aria-modal="true" aria-labelledby="recycle-bin-title">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <h2 id="recycle-bin-title" className="text-[15px] font-semibold text-slate-900 dark:text-white">Paperera de reciclatge</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || busyId !== null}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Actualitza la paperera"
              title="Actualitza"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Tanca la paperera"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div role="status" className="flex items-center justify-center py-16 text-slate-400 dark:text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="sr-only">Carregant la paperera</span>
            </div>
          ) : records.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
              {error ? 'No s’ha pogut carregar la paperera.' : 'La paperera és buida.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {records.map((record) => (
                <li key={record.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center">
                  {record.logoUrl ? (
                    <img
                      src={record.logoUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-contain p-1 dark:bg-slate-800"
                      onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
                    />
                  ) : (
                    <div aria-label="Sense logo" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600">
                      <Image className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{record.baseWord || 'Paraula no disponible'}</p>
                    {record.comment && <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-400">{record.comment}</p>}
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Modificada: {formatDate(record.updated || record.created)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void restore(record)}
                      disabled={busyId !== null}
                      className="flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-100 px-3 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restaura
                    </button>
                    <button
                      type="button"
                      onClick={() => void permanentlyDelete(record)}
                      disabled={busyId !== null}
                      className="flex h-10 items-center justify-center gap-2 rounded-lg bg-red-100 px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-950/60 dark:text-red-200 dark:hover:bg-red-900"
                    >
                      <Trash2 className="h-4 w-4" />
                      Elimina definitivament
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
          {records.length} {records.length === 1 ? 'fitxa eliminada' : 'fitxes eliminades'} · Dades consultades directament a PocketBase
        </div>
      </div>
    </div>
  );
}
