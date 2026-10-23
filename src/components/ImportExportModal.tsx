import { useEffect, useRef, useState } from 'react';
import { Upload, Download, X, FileText, ClipboardPaste, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ChatMessage, MessageOptions } from '@/lib/storage';
import { parseImportData, downloadExportFile, EXPORT_HEADERS, ParsedRow } from '@/lib/importExport';

interface ImportExportModalProps {
  open: boolean;
  messages: ChatMessage[];
  onImport: (rows: { baseWord: string; options: MessageOptions; comment: string }[]) => void;
  onClose: () => void;
}

export default function ImportExportModal({ open, messages, onImport, onClose }: ImportExportModalProps) {
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTab('import');
      setPasteText('');
      setPreview(null);
      setError('');
      setSuccess('');
    }
  }, [open]);

  if (!open) return null;

  function handleParse(raw: string): ParsedRow[] | null {
    try {
      const rows = parseImportData(raw);
      if (rows.length === 0) {
        setError('No s\'han trobat files vàlides. Comprova que la primera columna sigui la paraula base.');
        return null;
      }
      setError('');
      return rows;
    } catch {
      setError('No s\'ha pogut llegir les dades. Comprova el format.');
      return null;
    }
  }

  function handlePasteChange(value: string) {
    setPasteText(value);
    setSuccess('');
    if (value.trim() === '') {
      setPreview(null);
      setError('');
      return;
    }
    const rows = handleParse(value);
    setPreview(rows);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setPasteText(text);
      const rows = handleParse(text);
      setPreview(rows);
    };
    reader.onerror = () => setError('No s\'ha pogut llegir el fitxer.');
    reader.readAsText(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleConfirmImport() {
    const rows = preview ?? handleParse(pasteText);
    if (!rows || rows.length === 0) {
      setError('No hi ha res per importar.');
      return;
    }
    onImport(rows);
    setSuccess(`S'han importat ${rows.length} ${rows.length === 1 ? 'fitxa' : 'fitxes'}.`);
    setPasteText('');
    setPreview(null);
    setTimeout(() => {
      setSuccess('');
      onClose();
    }, 900);
  }

  function handleExport() {
    if (messages.length === 0) {
      setError('No hi ha fitxes per exportar.');
      return;
    }
    downloadExportFile(messages);
    setSuccess('S\'ha descarregat el fitxer.');
    setError('');
    setTimeout(() => setSuccess(''), 1500);
  }

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
                  Format: 8 columnes separades per tabuladors (com quan copies d\'Excel). La primera fila pot ser la capçalera i es saltarà.
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
                  accept=".csv,.txt,.tsv,text/csv,text/plain"
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

              {preview && preview.length > 0 && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 font-medium">
                    Previsualització · {preview.length} {preview.length === 1 ? 'fitxa' : 'fitxes'}
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {preview.slice(0, 50).map((row, i) => (
                      <div key={i} className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0 flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-900 dark:text-white font-medium truncate">{row.baseWord}</span>
                        <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono shrink-0">
                          {row.options.length}c · {[
                            row.options.uppercase && 'AA',
                            row.options.lowercase && 'aa',
                            row.options.numbers && '09',
                            row.options.symbols && '@#',
                          ].filter(Boolean).join(' ')}
                        </span>
                      </div>
                    ))}
                    {preview.length > 50 && (
                      <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-500 text-center">
                        i {preview.length - 50} més…
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleConfirmImport}
                disabled={!preview || preview.length === 0}
                className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-500 text-slate-950 font-semibold text-[16px] transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-5 h-5" />
                Importa {preview ? preview.length : 0} {preview && preview.length === 1 ? 'fitxa' : 'fitxes'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-4 py-3">
                <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Per seguretat, <strong>mai</strong> s\'exporta la contrasenya generada. Només s\'exporten la paraula base i les opcions de generació.</span>
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
                  El fitxer inclou aquestes {EXPORT_HEADERS.length} columnes separades per tabuladors:
                </p>
                <div className="flex flex-wrap gap-1">
                  {EXPORT_HEADERS.map((h, i) => (
                    <span key={h} className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {i + 1}. {h}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Fitxes disponibles</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{messages.length}</span>
                </div>
              </div>

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

              <button
                onClick={handleExport}
                disabled={messages.length === 0}
                className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-500 text-slate-950 font-semibold text-[16px] transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Exporta {messages.length} {messages.length === 1 ? 'fitxa' : 'fitxes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
