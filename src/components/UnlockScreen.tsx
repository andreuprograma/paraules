import { useState } from 'react';
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import { decryptSeed } from '@/lib/passwordGenerator';
import { getEncryptedSeed, clearSeed } from '@/lib/storage';

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
  onReset: () => void;
}

export default function UnlockScreen({ onUnlock, onReset }: UnlockScreenProps) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  function handleUnlock() {
    setError('');
    const encrypted = getEncryptedSeed();
    if (!encrypted) {
      setError('No s’ha trobat cap paraula mestra. Torna a configurar-la.');
      return;
    }
    const decrypted = decryptSeed(encrypted, pin);
    if (!decrypted) {
      setAttempts((a) => a + 1);
      setError('El PIN no és correcte. Torna-ho a provar.');
      return;
    }
    onUnlock(decrypted);
  }

  function handleReset() {
    if (confirm('Això esborrarà la paraula mestra xifrada. Hauràs de tornar-la a configurar. Vols continuar?')) {
      clearSeed();
      onReset();
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
              Introdueix el PIN per desxifrar la paraula mestra.
            </p>
            <p className="text-slate-400 dark:text-slate-600 text-center mt-3 text-[11px] font-mono">
              {formatBuildTime(__BUILD_TIMESTAMP__)}
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">PIN</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  placeholder="Introdueix el PIN"
                  autoFocus
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

            <button
              onClick={handleUnlock}
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-semibold text-[16px] transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <Lock className="w-5 h-5" />
              Desbloqueja
            </button>

            {attempts >= 3 && (
              <button
                onClick={handleReset}
                className="w-full text-center text-sm text-slate-500 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 underline"
              >
                Has oblidat el PIN? Reinicia la caixa
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
