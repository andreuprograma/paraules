import { useEffect, useRef, useState } from 'react';
import { Upload, Download, X, FileText, ClipboardPaste, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { ChatMessage, MessageOptions, SavedPasswordRecord } from '@/lib/storage';
import { parseImportData, downloadExportFile, downloadTextFile, EXPORT_HEADERS } from '@/lib/importExport';
import {
  collectAutomaticEntries,
  collectManualEntries,
  createBackupFile,
  looksLikeBackup,
  readBackupFile,
} from '@/lib/backup';
import type { BackupAutomaticEntry, BackupManualEntry } from '@/lib/backup';
import { decryptSavedPasswordDetails } from '@/lib/savedPasswordCrypto';

export interface ImportSelection {
  automatic: BackupAutomaticEntry[];
  manual: Array<{ entry: BackupManualEntry; replaceId?: string }>;
}

interface ImportExportModalProps {
  open: boolean;
  messages: ChatMessage[];
  manualRecords: SavedPasswordRecord[];
  seedWord: string;
  onImport: (selection: ImportSelection) => Promise<void> | void;
  onClose: () => void;
}

type ExportScope = 'A' | 'B' | 'AB';

interface IncomingItem {
  id: string;
  part: 'A' | 'B';
  label: string;
  duplicate: boolean;
  automatic?: BackupAutomaticEntry;
  manual?: BackupManualEntry;
  replaceId?: string;
}

type Decision = 'replace' | 'skip';

const PART_LABEL = { A: 'Automàtica', B: 'Manual' } as const;

function optionsSummary(options: MessageOptions): string {
  return `${options.length}c · ${[
    options.uppercase && 'AA',
    options.lowercase && 'aa',
    options.numbers && '09',
    options.symbols && '@#',
  ].filter(Boolean).join(' ')}`;
}

export default function ImportExportModal({ open, messages, manualRecords, seedWord, onImport, onClose }: ImportExportModalProps) {
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [pasteText, setPasteText] = useState('');
  const [incoming, setIncoming] = useState<IncomingItem[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [scope, setScope] = useState<ExportScope>('A');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisRef = useRef(0);

  const manualCount = manualRecords.filter((record) => !record.deleted).length;
  const exportCount = scope === 'A' ? messages.length : scope === 'B' ? manualCount : messages.length + manualCount;

  useEffect(() => {
    if (open) {
      analysisRef.current += 1;
      setTab('import');
      setPasteText('');
      setIncoming(null);
      setDecisions({});
      setScope('A');
      setBusy(false);
      setError('');
      setSuccess('');
    }
  }, [open]);

  if (!open) return null;

  async function existingManualIdsByName(): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    for (const record of manualRecords.filter((item) => !item.deleted)) {
      try {
        const details = await decryptSavedPasswordDetails(record.encryptedName, seedWord);
        if (!byName.has(details.name)) byName.set(details.name, record.id);
      } catch {
        // Una fitxa il·legible no es pot comparar: no compta com a duplicat.
      }
    }
    return byName;
  }

  async function analyze(raw: string): Promise<void> {
    const run = ++analysisRef.current;
    setSuccess('');
    if (raw.trim() === '') {
      setIncoming(null);
      setError('');
      return;
    }
    try {
      let automatic: BackupAutomaticEntry[];
      let manual: BackupManualEntry[] = [];
      if (looksLikeBackup(raw)) {
        const payload = await readBackupFile(raw, seedWord);
        automatic = payload.automatic;
        manual = payload.manual;
      } else {
        automatic = parseImportData(raw).map(({ baseWord, options, comment }) => ({ baseWord, options, comment }));
      }
      if (run !== analysisRef.current) return;
      if (automatic.length === 0 && manual.length === 0) {
        setIncoming(null);
        setError('No s\'han trobat files vàlides. Comprova que la primera columna sigui la paraula base.');
        return;
      }
      const existingAutomatic = new Set(messages.map((message) => message.baseWord));
      const existingManual = manual.length > 0 ? await existingManualIdsByName() : new Map<string, string>();
      if (run !== analysisRef.current) return;
      const items: IncomingItem[] = [
        ...automatic.map((entry, index): IncomingItem => ({
          id: `A:${index}`,
          part: 'A',
          label: entry.baseWord,
          duplicate: existingAutomatic.has(entry.baseWord),
          automatic: entry,
        })),
        ...manual.map((entry, index): IncomingItem => ({
          id: `B:${index}`,
          part: 'B',
          label: entry.name,
          duplicate: existingManual.has(entry.name),
          manual: entry,
          replaceId: existingManual.get(entry.name),
        })),
      ];
      setError('');
      setIncoming(items);
      setDecisions(Object.fromEntries(items.filter((item) => item.duplicate).map((item) => [item.id, 'skip' as Decision])));
    } catch (analysisError) {
      if (run !== analysisRef.current) return;
      setIncoming(null);
      setError(analysisError instanceof Error ? analysisError.message : 'No s\'ha pogut llegir les dades. Comprova el format.');
    }
  }

  function handlePasteChange(value: string) {
    setPasteText(value);
    void analyze(value);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setPasteText(text);
      void analyze(text);
    };
    reader.onerror = () => setError('No s\'ha pogut llegir el fitxer.');
    reader.readAsText(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  const selected = (incoming ?? []).filter((item) => !item.duplicate || decisions[item.id] === 'replace');
  const duplicates = (incoming ?? []).filter((item) => item.duplicate);

  async function handleConfirmImport() {
    if (selected.length === 0) {
      setError('No hi ha res per importar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onImport({
        automatic: selected.flatMap((item) => (item.automatic ? [item.automatic] : [])),
        manual: selected.flatMap((item) => (item.manual ? [{ entry: item.manual, replaceId: item.replaceId }] : [])),
      });
      setSuccess(`S'han importat ${selected.length} ${selected.length === 1 ? 'fitxa' : 'fitxes'}.`);
      setPasteText('');
      setIncoming(null);
      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 900);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'No s\'ha pogut importar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (exportCount === 0) {
      setError('No hi ha fitxes per exportar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const date = new Date().toISOString().slice(0, 10);
      if (scope === 'A') {
        downloadExportFile(messages);
      } else {
        const payload = {
          automatic: collectAutomaticEntries(messages),
          manual: await collectManualEntries(manualRecords, seedWord),
        };
        const file = await createBackupFile(payload, scope === 'AB' ? 'all' : 'manual', seedWord);
        downloadTextFile(file, `${scope === 'AB' ? 'copia-completa' : 'copia-manuals'}-${date}.json`, 'application/json');
      }
      setSuccess('S\'ha descarregat el fitxer.');
      setTimeout(() => setSuccess(''), 1500);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'No s\'ha pogut exportar.');
    } finally {
      setBusy(false);
    }
  }

  const scopeOptions: Array<{ value: ExportScope; title: string; detail: string; count: number }> = [
    { value: 'A', title: 'Automàtiques', detail: 'Text amb tabuladors (Excel). Sense contrasenyes.', count: messages.length },
    { value: 'B', title: 'Manuals', detail: 'Còpia xifrada (.json), amb contrasenyes.', count: manualCount },
    { value: 'AB', title: 'Automàtiques + manuals', detail: 'Una sola còpia xifrada (.json).', count: messages.length + manualCount },
  ];

  const messageBoxes = (
    <>
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-red-700 dark:text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-emerald-700 dark:text-emerald-300 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[84vh] flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Importa / Exporta</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Tanca">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
          <button
            onClick={() => { setTab('import'); setSuccess(''); setError(''); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'import' ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500 bg-emerald-50 dark:bg-slate-800/40' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            Importa
          </button>
          <button
            onClick={() => { setTab('export'); setSuccess(''); setError(''); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'export' ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500 bg-emerald-50 dark:bg-slate-800/40' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            Exporta
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          {tab === 'import' ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Admet dos formats: text amb 8 columnes separades per tabuladors (fitxes automàtiques, com quan copies d'Excel) o una còpia xifrada (.json) exportada des d'aquesta app amb la mateixa paraula mestra.
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {EXPORT_HEADERS.map((h, i) => (
                    <span key={h} className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {i + 1}. {h}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Tria un fitxer
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv,.json,text/csv,text/plain,application/json"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.readText().then((text) => {
                      handlePasteChange(text);
                    }).catch(() => setError('No s\'ha pogut accedir al porta-retalls. Enganxa manualment.'));
                  }}
                  className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                  <ClipboardPaste className="w-4 h-4" />
                  Enganxa del porta-retalls
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">O enganxa les dades aquí</label>
                <textarea
                  value={pasteText}
                  onChange={(e) => handlePasteChange(e.target.value)}
                  placeholder={'Paraula base\tCaràcters\tMajúscules\tMinúscules\tNúmeros\tSímbols\tSímbols permesos\tComentaris\ngmail\t16\tsí\tsí\tsí\tno\t\tCorreu principal\nnetflix\t20\tsí\tsí\tsí\tsí\t@#$!\tStreaming'}
                  rows={5}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-y"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>

              {messageBoxes}

              {incoming && incoming.length > 0 && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 font-medium">
                    Previsualització · {incoming.length} {incoming.length === 1 ? 'fitxa' : 'fitxes'}
                    {' '}({incoming.filter((item) => item.part === 'A').length} automàtiques, {incoming.filter((item) => item.part === 'B').length} manuals)
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {incoming.slice(0, 100).map((item) => (
                      <div key={item.id} className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex items-center gap-2">
                            <span className="shrink-0 rounded bg-slate-200 px-1.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{PART_LABEL[item.part]}</span>
                            <span className="text-sm text-slate-900 dark:text-white font-medium truncate">{item.label}</span>
                          </span>
                          {item.automatic && (
                            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono shrink-0">{optionsSummary(item.automatic.options)}</span>
                          )}
                        </div>
                        {item.duplicate && (
                          <fieldset className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-amber-700 dark:text-amber-300" disabled={busy}>
                            <legend className="sr-only">Ja existeix: {item.label}</legend>
                            <span className="font-medium">Ja existeix:</span>
                            <label className="flex items-center gap-1.5">
                              <input type="radio" name={`dup-${item.id}`} checked={decisions[item.id] !== 'replace'} onChange={() => setDecisions((current) => ({ ...current, [item.id]: 'skip' }))} />
                              Conserva l'actual
                            </label>
                            <label className="flex items-center gap-1.5">
                              <input type="radio" name={`dup-${item.id}`} checked={decisions[item.id] === 'replace'} onChange={() => setDecisions((current) => ({ ...current, [item.id]: 'replace' }))} />
                              Substitueix-la
                            </label>
                          </fieldset>
                        )}
                      </div>
                    ))}
                    {incoming.length > 100 && (
                      <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-500 text-center">
                        i {incoming.length - 100} més…
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => { void handleConfirmImport(); }}
                disabled={busy || selected.length === 0}
                className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-500 text-slate-950 font-semibold text-[16px] transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-5 h-5" />
                {busy ? 'Important…' : `Importa ${selected.length} ${selected.length === 1 ? 'fitxa' : 'fitxes'}`}
              </button>
              {duplicates.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  Les fitxes que ja existeixen no es toquen si no tries «Substitueix-la».
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="sr-only">Què vols exportar</legend>
                {scopeOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${scope === option.value ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}`}
                  >
                    <input
                      type="radio"
                      name="export-scope"
                      className="mt-1"
                      checked={scope === option.value}
                      onChange={() => { setScope(option.value); setError(''); setSuccess(''); }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{option.title}</span>
                        <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400 font-semibold">{option.count}</span>
                      </span>
                      <span className="block text-xs text-slate-600 dark:text-slate-400">{option.detail}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {scope === 'A' ? (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-4 py-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Per seguretat, <strong>mai</strong> s'exporta la contrasenya generada. Només s'exporten la paraula base i les opcions de generació, <strong>sense xifrar</strong>.</span>
                  </p>
                  <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-200/80">Columnes: {EXPORT_HEADERS.join(', ')}.</p>
                </div>
              ) : (
                <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 px-4 py-3">
                  <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed flex items-start gap-2">
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>La còpia va <strong>xifrada amb la teva paraula mestra</strong> i no conté cap contrasenya en clar. Només es podrà importar amb la mateixa paraula mestra. Guarda-la en un lloc segur.</span>
                  </p>
                </div>
              )}

              {messageBoxes}

              <button
                onClick={() => { void handleExport(); }}
                disabled={busy || exportCount === 0}
                className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-500 text-slate-950 font-semibold text-[16px] transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                {busy ? 'Exportant…' : `Exporta ${exportCount} ${exportCount === 1 ? 'fitxa' : 'fitxes'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
