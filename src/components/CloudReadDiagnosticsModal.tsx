import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  CloudReadDiagnosticError,
  CloudReadDiagnosticResult,
  runCloudReadDiagnostic,
} from '@/lib/cloudSync';

interface CloudReadDiagnosticsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CloudReadDiagnosticsModal({ open, onClose }: CloudReadDiagnosticsModalProps) {
  const [adminCount, setAdminCount] = useState('');
  const [readRulesReviewed, setReadRulesReviewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CloudReadDiagnosticResult | null>(null);

  function close(): void {
    if (loading) return;
    setAdminCount('');
    setReadRulesReviewed(false);
    setError('');
    setResult(null);
    onClose();
  }

  async function runDiagnostic(): Promise<void> {
    setError('');
    setResult(null);
    setLoading(true);
    try {
      setResult(await runCloudReadDiagnostic());
    } catch (diagnosticError) {
      setError(diagnosticError instanceof CloudReadDiagnosticError
        ? diagnosticError.message
        : 'El diagnòstic no s’ha pogut completar. No s’ha considerat el resultat com una llista buida.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const parsedAdminCount = adminCount === '' ? null : Number(adminCount);
  const validAdminCount = parsedAdminCount !== null &&
    Number.isSafeInteger(parsedAdminCount) &&
    parsedAdminCount >= 0;
  const adminCountMatches = !!result && validAdminCount && result.recordCount === parsedAdminCount;
  const completenessConfirmed = adminCountMatches && readRulesReviewed;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 py-[6vh]" role="dialog" aria-modal="true" aria-labelledby="cloud-read-diagnostics-title">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={close} aria-label="Tanca el diagnòstic" />
      <section className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="cloud-read-diagnostics-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Diagnòstic de lectura de PocketBase
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Només GET; no sincronitza ni modifica registres.</p>
          </div>
          <button type="button" onClick={close} disabled={loading} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800" aria-label="Tanca">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            El diagnòstic llegeix només id, user_id, updated i is_deleted, fa dues lectures paginades i mostra únicament recomptes.
          </p>

          <label className="block">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
              Recompte de registres del compte de prova al panell d’administració
            </span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={adminCount}
              onChange={(event) => {
                setAdminCount(event.target.value);
                setResult(null);
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              placeholder="Introdueix només el recompte"
            />
          </label>

          <label className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={readRulesReviewed}
              onChange={(event) => {
                setReadRulesReviewed(event.target.checked);
                setResult(null);
              }}
              className="mt-1"
            />
            <span>He revisat per una via autoritzada que la regla de lectura restringeix les dades al propietari i no n’omet cap.</span>
          </label>

          <p className="text-xs text-amber-800 dark:text-amber-300">
            L’aplicació no inspecciona les API Rules. La confirmació és manual; si no s’han verificat, no es podrà indicar que la lectura és completa.
          </p>

          <button
            type="button"
            onClick={() => void runDiagnostic()}
            disabled={loading || (adminCount !== '' && !validAdminCount)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Llegint pàgines…' : 'Executa diagnòstic de només lectura'}
          </button>

          {adminCount !== '' && !validAdminCount && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">Introdueix un recompte enter igual o superior a zero.</p>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
              <div className="mb-2 flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Lectures completades i estables
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                <dt>Registres per lectura</dt><dd>{result.recordCount}</dd>
                <dt>IDs únics validats</dt><dd>{result.uniqueRecordCount}</dd>
                <dt>Pàgines (1a / 2a lectura)</dt><dd>{result.firstReadPages} / {result.secondReadPages}</dd>
                <dt>Recompte del panell</dt>
                <dd>{validAdminCount ? `${parsedAdminCount} — ${adminCountMatches ? 'coincideix' : 'no coincideix'}` : 'no comparat'}</dd>
              </dl>
              {adminCount !== '' && !adminCountMatches && (
                <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">
                  El recompte no coincideix. Atura’t i no activis la sincronització.
                </p>
              )}
              {completenessConfirmed ? (
                <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  El recompte coincideix i s’ha confirmat la revisió manual de les regles. Aquesta comprovació no és una auditoria independent de les API Rules.
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  Lectura validada, però no es pot afirmar que sigui completa: cal comparar el recompte i confirmar la revisió autoritzada de les regles.
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
