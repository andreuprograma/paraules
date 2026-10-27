import { useEffect, useRef, useState } from 'react';
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import { decryptSeed } from '@/lib/passwordGenerator';
import { getEncryptedSeed, getMasterFormat, getPinOnlySeedVault, resetLocalPasswordData } from '@/lib/storage';
import { unlockSeedVault } from '@/lib/seedVault';
import { clearPinLockout, getPinLockoutStatus, PinLockoutStatus, recordPinFailure } from '@/lib/pinLockout';

interface PinSecurityState {
  status: PinLockoutStatus | null;
  error: string;
}

function readPinSecurityState(): PinSecurityState {
  try {
    return { status: getPinLockoutStatus(), error: '' };
  } catch {
    return { status: null, error: 'No es pot verificar l’estat del bloqueig. No s’ha desbloquejat la caixa.' };
  }
}

function formatRemainingTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min ${seconds} s`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

function formatBuildTime(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
    return `v. ${date} · ${time}`;
  } catch {
    return '';
  }
}

interface UnlockScreenProps {
  onUnlock: (seed: string) => void;
  onResetLocalData: () => void;
  onReconfigurePinOnly: () => void;
}

export default function UnlockScreen({ onUnlock, onResetLocalData, onReconfigurePinOnly }: UnlockScreenProps) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [pinSecurity, setPinSecurity] = useState<PinSecurityState>(readPinSecurityState);
  const persistenceFailureRef = useRef(false);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const canEnterPin = !!pinSecurity.status && pinSecurity.status.remainingMs <= 0;

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!persistenceFailureRef.current) setPinSecurity(readPinSecurityState());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!canEnterPin) return;
    const input = pinInputRef.current;
    if (input?.isConnected && !input.disabled) input.focus({ preventScroll: true });
  }, [canEnterPin]);

  async function handleUnlock(): Promise<void> {
    setError('');
    const currentSecurity = readPinSecurityState();
    setPinSecurity(currentSecurity);
    if (!currentSecurity.status) {
      setError(currentSecurity.error);
      return;
    }
    if (currentSecurity.status.remainingMs > 0) {
      setError(`Caixa bloquejada. Torna-ho a provar d’aquí ${formatRemainingTime(currentSecurity.status.remainingMs)}.`);
      return;
    }

    setBusy(true);
    let decrypted: string | null = null;
    try {
      if (getMasterFormat() === 'pin') {
        const rawVault = getPinOnlySeedVault();
        if (!rawVault) throw new Error('No s’ha trobat el registre local de desbloqueig.');
        decrypted = await unlockSeedVault(JSON.parse(rawVault), pin);
      } else if (getMasterFormat() === 'vault') {
        throw new Error('Cal configurar l’accés només amb PIN.');
      } else {
        const encrypted = getEncryptedSeed();
        if (!encrypted) throw new Error('No s’ha trobat cap paraula mestra. Torna a configurar-la.');
        decrypted = decryptSeed(encrypted, pin);
      }
    } catch {
      decrypted = null;
    }
    if (!decrypted) {
      try {
        const nextSecurity = recordPinFailure();
        setPinSecurity({ status: nextSecurity, error: '' });
        setError(nextSecurity.remainingMs > 0
          ? `No s’ha pogut desbloquejar. Caixa bloquejada durant ${formatRemainingTime(nextSecurity.remainingMs)}.`
          : `PIN incorrecte o dades locals no vàlides. Et queden ${nextSecurity.attemptsRemaining} intents abans del proper bloqueig.`);
      } catch {
        persistenceFailureRef.current = true;
        setPinSecurity({
          status: null,
          error: 'No s’ha pogut desar l’estat de seguretat. No s’ha desbloquejat la caixa.',
        });
        setError('No s’ha pogut desar l’estat de seguretat. No s’ha desbloquejat la caixa.');
      }
      setBusy(false);
      return;
    }
    try {
      clearPinLockout();
      setPinSecurity({ status: getPinLockoutStatus(), error: '' });
    } catch {
      persistenceFailureRef.current = true;
      setPinSecurity({
        status: null,
        error: 'No s’ha pogut actualitzar l’estat de seguretat. No s’ha desbloquejat la caixa.',
      });
      setError('No s’ha pogut actualitzar l’estat de seguretat. No s’ha desbloquejat la caixa.');
      setBusy(false);
      return;
    }
    setBusy(false);
    onUnlock(decrypted);
  }

  function handleResetLocalData() {
    setError('');
    setResetConfirmation('');
    setResetConfirmationOpen(true);
  }

  function confirmResetLocalData() {
    if (resetConfirmation !== 'RESTABLIR') return;
    try {
      resetLocalPasswordData();
      setResetConfirmationOpen(false);
      onResetLocalData();
    } catch (resetError) {
      setResetConfirmationOpen(false);
      setError(resetError instanceof Error ? resetError.message : 'No s’han pogut restablir les dades locals.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-5 py-8">
        <div className="max-w-md mx-auto w-full">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-900/40">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Paraules</h1>
            <p className="text-slate-500 dark:text-slate-400 text-center mt-2 text-[15px]">
              {getMasterFormat() === 'vault'
                ? 'Aquesta configuració antiga encara depèn del secret de recuperació.'
                : 'Introdueix el PIN per desbloquejar Paraules.'}
            </p>
            {getMasterFormat() === 'pin' && (
              <p className="text-slate-500 dark:text-slate-400 text-center mt-2 text-xs">
                La clau mestra està xifrada localment amb el PIN. El bloqueig d’intents no protegeix contra proves fora de l’app.
              </p>
            )}
            <p className="text-slate-400 dark:text-slate-600 text-center mt-3 text-[11px] font-mono">
              {formatBuildTime(__BUILD_TIMESTAMP__)}
            </p>
          </div>

          {getMasterFormat() === 'vault' ? (
            <div className="space-y-4">
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                Per deixar d’utilitzar el secret, configura una vegada l’accés només amb PIN i introdueix la paraula mestra exacta actual. Les fitxes i les contrasenyes desades no s’esborraran; si la paraula mestra és diferent, les dades xifrades existents no es podran obrir.
              </p>
              <button
                type="button"
                onClick={onReconfigurePinOnly}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950"
              >
                Configura l’accés només amb PIN
              </button>
              <button
                type="button"
                onClick={handleResetLocalData}
                className="w-full text-center text-sm text-red-600 underline"
              >
                Restablir contrasenyes
              </button>
            </div>
          ) : (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">PIN</label>
              <div className="relative">
                <input
                  ref={pinInputRef}
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock(); }}
                  placeholder="Introdueix el PIN"
                  disabled={!pinSecurity.status || pinSecurity.status.remainingMs > 0}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  inputMode="numeric"
                  className="w-full h-12 px-4 pr-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-red-600 dark:text-red-300 text-sm">
                {error}
              </div>
            )}
            {pinSecurity.error && (
              <div role="alert" className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-red-600 dark:text-red-300 text-sm">
                {pinSecurity.error}
              </div>
            )}
            {pinSecurity.status && (
              <p aria-live="polite" className="text-center text-sm text-slate-600 dark:text-slate-400">
                {pinSecurity.status.remainingMs > 0
                  ? `Bloqueig actiu: ${formatRemainingTime(pinSecurity.status.remainingMs)} restants.`
                  : `Intents restants abans del proper bloqueig: ${pinSecurity.status.attemptsRemaining}.`}
              </p>
            )}

            <button
              onClick={handleUnlock}
              disabled={busy || !pinSecurity.status || pinSecurity.status.remainingMs > 0}
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold text-[16px] transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <Lock className="w-5 h-5" />
              {busy ? 'Desbloquejant…' : 'Desbloqueja'}
            </button>

            <button
              type="button"
              onClick={handleResetLocalData}
              className="w-full text-center text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline"
            >
              Restablir contrasenyes
            </button>
          </div>
          )}
        </div>
      </div>
      {resetConfirmationOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-local-data-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h2 id="reset-local-data-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Restablir dades locals
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Aquesta acció esborrarà les fitxes locals, la paraula mestra xifrada i la configuració d’aquest navegador. No modificarà les dades del núvol i no es pot desfer.
            </p>
            <label htmlFor="reset-local-data-confirmation" className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Escriu RESTABLIR per confirmar
            </label>
            <input
              id="reset-local-data-confirmation"
              type="text"
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={confirmResetLocalData}
                disabled={resetConfirmation !== 'RESTABLIR'}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Restableix les dades locals
              </button>
              <button
                type="button"
                onClick={() => setResetConfirmationOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel·la
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
