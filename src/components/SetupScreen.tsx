import { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { encryptSeed, normalizeSeed } from '@/lib/passwordGenerator';
import { setEncryptedSeed } from '@/lib/storage';

interface SetupScreenProps {
  onComplete: () => void;
}

export default function SetupScreen({ onComplete }: SetupScreenProps) {
  const [seed, setSeed] = useState('');
  const [confirmSeed, setConfirmSeed] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showSeed, setShowSeed] = useState(false);
  const [showConfirmSeed, setShowConfirmSeed] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [error, setError] = useState('');

  const normalizedSeed = normalizeSeed(seed);

  function sanitizeSeed(value: string): string {
    return value.replace(/[^a-z0-9\-_.@]/g, '');
  }

  function handleSave() {
    setError('');
    if (normalizedSeed.length < 4) {
      setError('La paraula mestra ha de contenir com a mínim 4 lletres.');
      return;
    }
    if (normalizeSeed(seed) !== normalizeSeed(confirmSeed)) {
      setError('Les paraules mestres no coincideixen.');
      return;
    }
    if (pin.length < 4) {
      setError('El PIN ha de tenir com a mínim 4 caràcters.');
      return;
    }
    if (pin !== confirmPin) {
      setError('Els PIN no coincideixen.');
      return;
    }
    setEncryptedSeed(encryptSeed(seed, pin));
    onComplete();
  }

  return (
    <div className="h-screen [height:100dvh] bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-900/40">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Configuració</h1>
            <p className="text-slate-500 dark:text-slate-400 text-center mt-2 text-[15px] leading-relaxed">
              Crea una paraula mestra. És l’únic secret que hauràs de recordar: totes les contrasenyes es regeneren a partir d’aquesta paraula.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Paraula mestra</label>
              <div className="relative">
                <input
                  type={showSeed ? 'text' : 'password'}
                  value={seed}
                  onChange={(e) => setSeed(sanitizeSeed(e.target.value))}
                  placeholder="p. ex. la-meva-frase-secreta"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-12 px-4 pr-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowSeed((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {showSeed ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {seed && (
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  Normalitzada: <span className="font-mono text-emerald-600 dark:text-emerald-400">{normalizedSeed || '(empty)'}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Confirma la paraula mestra</label>
              <div className="relative">
                <input
                  type={showConfirmSeed ? 'text' : 'password'}
                  value={confirmSeed}
                  onChange={(e) => setConfirmSeed(sanitizeSeed(e.target.value))}
                  placeholder="Repeteix la paraula mestra"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-12 px-4 pr-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmSeed((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {showConfirmSeed ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-200 dark:bg-slate-800 my-2" />

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">PIN (xifra la paraula al dispositiu)</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Com a mínim 4 caràcters"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  inputMode="numeric"
                  className="w-full h-12 px-4 pr-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
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

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Confirma el PIN</label>
              <div className="relative">
                <input
                  type={showConfirmPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Repeteix el PIN"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  inputMode="numeric"
                  className="w-full h-12 px-4 pr-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPin((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {showConfirmPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-red-600 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 flex gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-500 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                La paraula mestra es xifra amb el PIN i només es desa en aquest dispositiu. No s’envia enlloc. Si l’oblides, les contrasenyes no es poden recuperar.
              </p>
            </div>

            <button
              onClick={handleSave}
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-semibold text-[16px] transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <Lock className="w-5 h-5" />
              Xifra i desa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
