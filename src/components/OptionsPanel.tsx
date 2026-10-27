import { useState } from 'react';
import { SlidersHorizontal, X, Eye, EyeOff, Trash2, AlertTriangle, Lock, Sun, Moon, Database, ShieldCheck, Mail } from 'lucide-react';
import { SavedSettings } from '@/lib/storage';
import { Theme } from '@/lib/theme';
import { getCloudUser } from '@/lib/pocketbase';
import DatabaseViewerModal from './DatabaseViewerModal';
import RecycleBinModal from './RecycleBinModal';
import CloudReadDiagnosticsModal from './CloudReadDiagnosticsModal';

interface OptionsPanelProps {
  open: boolean;
  settings: SavedSettings;
  messageCount: number;
  onChange: (settings: SavedSettings) => void;
  onClearAll: () => void;
  verifyPin: (pin: string) => Promise<boolean>;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  seedWord: string;
  onRecordsChanged?: () => void;
  cloudActionsEnabled: boolean;
}

export default function OptionsPanel({ open, settings, messageCount, onChange, onClearAll, verifyPin, onClose, theme, onThemeChange, seedWord, onRecordsChanged, cloudActionsEnabled }: OptionsPanelProps) {
  const cloudUser = getCloudUser();
  const [showSymbolsInput, setShowSymbolsInput] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [dbOpen, setDbOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [cloudReadDiagnosticsOpen, setCloudReadDiagnosticsOpen] = useState(false);
  const [checkingPin, setCheckingPin] = useState(false);

  function update<K extends keyof SavedSettings>(key: K, value: SavedSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  async function handleConfirmClear(): Promise<void> {
    if (!pinInput) return;
    setCheckingPin(true);
    try {
      if (!await verifyPin(pinInput)) {
        setPinError('El PIN no és correcte.');
        return;
      }
      onClearAll();
      setClearOpen(false);
      setPinInput('');
      setPinError('');
      onClose();
    } catch {
      setPinError('No s’ha pogut verificar el PIN.');
    } finally {
      setCheckingPin(false);
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-1/2 md:top-1/2 md:bottom-auto z-50 w-full max-w-3xl -translate-x-1/2 bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-3xl border-t border-slate-200 dark:border-slate-700 transition-transform duration-300 max-h-[85dvh] overflow-y-auto ${
          open ? 'translate-y-0 md:-translate-y-1/2' : 'translate-y-full'
        }`}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-900 pt-3 pb-2 px-5 border-b border-slate-200 dark:border-slate-800">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Opcions</h2>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {cloudUser ? 'Sessió iniciada al núvol' : 'No has iniciat sessió al núvol'}
              </p>
              {cloudUser && (
                <p className="mt-0.5 break-all text-sm text-slate-600 dark:text-slate-400">
                  {cloudUser.email || 'Correu electrònic no disponible'}
                </p>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Aquestes són les opcions amb què es generaran les contrasenyes per defecte. Cada vegada que generis una contrasenya, els selectors es restabliran a aquests valors.
          </p>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Llargada</label>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{settings.length}</span>
            </div>
            <input
              type="range"
              min={2}
              max={100}
              value={settings.length}
              onChange={(e) => update('length', Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700 accent-emerald-500"
              style={{ touchAction: 'manipulation' }}
            />
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-500 mt-1">
              <span>2</span>
              <span>100</span>
            </div>
          </div>

          <div className="space-y-1">
            <ToggleRow
              label="Majúscules"
              hint="A–Z"
              checked={settings.uppercase}
              onChange={(v) => update('uppercase', v)}
            />
            <ToggleRow
              label="Minúscules"
              hint="a–z"
              checked={settings.lowercase}
              onChange={(v) => update('lowercase', v)}
            />
            <ToggleRow
              label="Números"
              hint="0–9"
              checked={settings.numbers}
              onChange={(v) => update('numbers', v)}
            />
            <ToggleRow
              label="Símbols"
              hint="!@#$…"
              checked={settings.symbols}
              onChange={(v) => update('symbols', v)}
            />
          </div>

          {settings.symbols && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Símbols personalitzats</label>
                <button
                  onClick={() => setShowSymbolsInput((s) => !s)}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                >
                  {showSymbolsInput ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showSymbolsInput ? 'Amaga' : 'Mostra'}
                </button>
              </div>
              <input
                type={showSymbolsInput ? 'text' : 'password'}
                value={settings.allowedSymbols}
                onChange={(e) => update('allowedSymbols', e.target.value)}
                placeholder="Deixa-ho buit per fer servir els símbols predeterminats"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="w-full h-12 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                Si ho deixes buit, s’utilitza el conjunt predeterminat.
              </p>
            </div>
          )}

          <div>
            <ToggleRow
              label="Amaga la contrasenya"
              hint="Comença amagada"
              checked={settings.autoHide}
              onChange={(v) => update('autoHide', v)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Bloqueig per inactivitat</label>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{settings.autoCollapseSeconds === 0 ? 'Mai' : `${settings.autoCollapseSeconds}s`}</span>
            </div>
            <input
              type="range"
              min={0}
              max={120}
              step={5}
              value={settings.autoCollapseSeconds}
              onChange={(e) => update('autoCollapseSeconds', Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700 accent-emerald-500"
              style={{ touchAction: 'manipulation' }}
            />
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-500 mt-1">
              <span>Mai</span>
              <span>120s</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
              L'aplicació es bloqueja sola i demana el PIN quan passes aquest temps sense fer res. 0 significa que no es bloqueja mai automàticament.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Aparença</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onThemeChange('light')}
                className={`h-12 rounded-xl border flex items-center justify-center gap-2 text-sm font-medium transition-colors ${theme === 'light' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                <Sun className="w-4 h-4" />
                Tema clar
              </button>
              <button
                onClick={() => onThemeChange('dark')}
                className={`h-12 rounded-xl border flex items-center justify-center gap-2 text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                <Moon className="w-4 h-4" />
                Tema fosc
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setCloudReadDiagnosticsOpen(true)}
              className="mb-2 w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-medium text-[15px] transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              Diagnòstic de PocketBase (només lectura)
            </button>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 text-center">
              Consulta paginada independent; no activa la sincronització ni modifica registres.
            </p>
            <button
              onClick={() => setRecycleBinOpen(true)}
              disabled={!getCloudUser() || !cloudActionsEnabled}
              className="mb-2 w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800/40 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-slate-900 dark:text-white font-medium text-[15px] transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Paperera de reciclatge
            </button>
            {(!getCloudUser() || !cloudActionsEnabled) && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-2 text-center">
                {cloudActionsEnabled ? 'Disponible només quan estàs loguejat al núvol.' : 'Sincronització pausada fins a verificar compatibilitat de les dades xifrades.'}
              </p>
            )}
            <button
              onClick={() => setDbOpen(true)}
              disabled={!getCloudUser() || !cloudActionsEnabled}
              className="w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800/40 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-slate-900 dark:text-white font-medium text-[15px] transition-colors flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4" />
              Visualitza la base de dades
            </button>
            {(!getCloudUser() || !cloudActionsEnabled) && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
                {cloudActionsEnabled ? 'Disponible només quan estàs loguejat al núvol.' : 'Sincronització pausada fins a verificar compatibilitat de les dades xifrades.'}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-semibold text-[16px] transition-colors"
          >
            Fet
          </button>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => { setClearOpen(true); setPinInput(''); setPinError(''); }}
              disabled={messageCount === 0}
              className="w-full h-12 rounded-xl bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900 active:bg-red-200 dark:active:bg-red-950 disabled:bg-slate-100 dark:disabled:bg-slate-800/40 disabled:text-slate-400 dark:disabled:text-slate-600 text-red-600 dark:text-red-300 font-medium text-[15px] transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Esborra totes les fitxes{messageCount > 0 ? ` (${messageCount})` : ''}
            </button>
          </div>
        </div>
      </div>

      {clearOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/80" onClick={() => setClearOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-950/70 border border-red-200 dark:border-red-800/60 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Esborra totes les fitxes</h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                S'eliminaran les <span className="text-red-600 dark:text-red-300 font-medium">{messageCount} {messageCount === 1 ? 'fitxa' : 'fitxes'}</span> guardades. La paraula mestra i el PIN es mantenen. Introdueix el PIN per confirmar.
              </p>
              <div className="relative mb-3">
                <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pinInput}
                  onChange={(e) => { setPinInput(e.target.value); setPinError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirmClear(); }}
                  placeholder="PIN"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  inputMode="numeric"
                  className="w-full h-12 pl-10 pr-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pinError && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{pinError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmClear}
                  disabled={!pinInput || checkingPin}
                  className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-400 active:bg-red-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-semibold text-[15px] transition-colors"
                >
                  {checkingPin ? 'Verificant…' : 'Esborra-ho tot'}
                </button>
                <button
                  onClick={() => setClearOpen(false)}
                  className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-medium text-[15px] transition-colors"
                >
                  Cancel·la
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DatabaseViewerModal open={dbOpen} seedWord={seedWord} onClose={() => setDbOpen(false)} onRecordsChanged={onRecordsChanged} />
      <CloudReadDiagnosticsModal
        open={cloudReadDiagnosticsOpen}
        onClose={() => setCloudReadDiagnosticsOpen(false)}
      />
      <RecycleBinModal
        open={recycleBinOpen}
        seedWord={seedWord}
        onClose={() => setRecycleBinOpen(false)}
        onRecordsChanged={onRecordsChanged}
      />
    </>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between py-3 min-h-[52px] text-left"
    >
      <div>
        <div className="text-[15px] text-slate-900 dark:text-white font-medium">{label}</div>
        <div className="text-xs text-slate-500 dark:text-slate-500 font-mono">{hint}</div>
      </div>
      <div
        className={`w-12 h-7 rounded-full transition-colors flex items-center px-0.5 ${
          checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <div
          className={`w-6 h-6 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </button>
  );
}
