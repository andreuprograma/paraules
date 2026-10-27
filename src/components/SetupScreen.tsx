import { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { createSeedVault } from '@/lib/seedVault';
import { estimateStrength } from '@/lib/passwordGenerator';
import { savePinOnlySeedVault } from '@/lib/storage';

interface SetupScreenProps {
  onComplete: () => void;
  onCancel?: () => void;
  isUpgrade?: boolean;
}

function looksPredictable(value: string): boolean {
  return value.length < 12 ||
    /(.)\1{2,}/u.test(value) ||
    /(?:password|contrasenya|qwerty|123456|abcdef|letmein)/iu.test(value) ||
    /(?:0123|1234|abcd|qwer|asdf)/iu.test(value);
}

export default function SetupScreen({ onComplete, onCancel, isUpgrade = false }: SetupScreenProps) {
  const [seed, setSeed] = useState('');
  const [confirmSeed, setConfirmSeed] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [acceptPinRisk, setAcceptPinRisk] = useState(false);
  const [acceptWeakness, setAcceptWeakness] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const strength = estimateStrength(seed);
  const weakOrPredictable = strength.score <= 2 || looksPredictable(seed);

  async function configurePinOnlyUnlock(): Promise<void> {
    setError('');
    if (seed !== confirmSeed) {
      setError('Les paraules mestres han de coincidir exactament.');
      return;
    }
    if (pin.length < 4 || pin !== confirmPin) {
      setError(pin.length < 4 ? 'El PIN ha de tenir com a mínim 4 caràcters.' : 'Els PIN no coincideixen.');
      return;
    }
    if (!acceptRisk || !acceptPinRisk || (weakOrPredictable && !acceptWeakness)) {
      setError(!acceptRisk
        ? 'Confirma que entens els riscos de canviar el comportament de les contrasenyes i del núvol.'
        : !acceptPinRisk
          ? 'Confirma que entens el risc de protegir les dades locals només amb el PIN.'
          : 'Confirma que entens el risc d’utilitzar una paraula mestra feble o previsible.');
      return;
    }

    setBusy(true);
    try {
      const { vault } = await createSeedVault(seed, pin);
      savePinOnlySeedVault(JSON.stringify(vault));
      onComplete();
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'No s’ha pogut configurar el desbloqueig només amb PIN.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] h-screen [height:100dvh] overflow-x-hidden overflow-y-auto overscroll-contain bg-slate-50 dark:bg-slate-950">
      <div className="min-h-full flex items-start justify-center px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:items-center">
        <div className="max-w-md w-full">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-900/40">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {isUpgrade ? 'Configura l’accés només amb PIN' : 'Configuració segura'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-center mt-2 text-[15px] leading-relaxed">
              Introdueix la paraula mestra exactament. No es retallarà ni normalitzarà.
            </p>
          </div>

          <div className="space-y-5">
            {isUpgrade && (
              <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Per conservar l’accés a les dades xifrades existents, introdueix exactament la mateixa paraula mestra. No s’esborraran ni es migraran registres.
              </p>
            )}
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Paraula mestra
              <input
                type="password"
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="new-password"
                spellCheck={false}
                className="mt-2 w-full h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirma la paraula mestra
              <input
                type="password"
                value={confirmSeed}
                onChange={(event) => setConfirmSeed(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="new-password"
                spellCheck={false}
                className="mt-2 w-full h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Estimació local orientativa: {strength.label}{weakOrPredictable ? ' — pot ser feble o previsible.' : '.'}
            </p>
            {weakOrPredictable && (
              <label className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={acceptWeakness}
                  onChange={(event) => setAcceptWeakness(event.target.checked)}
                  className="mt-0.5"
                />
                <span>Entenc que la paraula mestra sembla feble i accepto continuar amb aquest risc.</span>
              </label>
            )}
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              PIN per desbloquejar l’aplicació
              <input
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                autoComplete="new-password"
                inputMode="numeric"
                className="mt-2 w-full h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirma el PIN
              <input
                type="password"
                value={confirmPin}
                onChange={(event) => setConfirmPin(event.target.value)}
                autoComplete="new-password"
                inputMode="numeric"
                className="mt-2 w-full h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </label>
            <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
              La clau mestra quedarà xifrada localment sota el PIN. Qui copiï les dades d’aquest navegador podrà provar PINs fora de l’app; el bloqueig d’intents no ho impedeix. Si perds el PIN, només podràs recuperar les dades si recordes la clau mestra. No hi ha secret de recuperació.
            </p>
            <label className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={acceptPinRisk}
                onChange={(event) => setAcceptPinRisk(event.target.checked)}
                className="mt-0.5"
              />
              <span>Entenc i accepto que un atacant amb una còpia de les dades locals pot provar el PIN fora de l’app.</span>
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={acceptRisk}
                onChange={(event) => setAcceptRisk(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                Entenc que les contrasenyes regenerades poden canviar, que les dades antigues del núvol poden deixar de desxifrar-se i que els caràcters eliminats anteriorment no es poden recuperar.
              </span>
            </label>
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
            <button
              type="button"
              onClick={() => void configurePinOnlyUnlock()}
              disabled={busy}
              className="w-full h-12 rounded-xl bg-emerald-500 text-slate-950 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Lock className="w-5 h-5" />
              {busy ? 'Desant…' : 'Desa i activa el PIN'}
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel} className="w-full text-sm text-slate-500 underline">
                Cancel·la i torna a desbloquejar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
