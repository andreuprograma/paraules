import { FormEvent, useState } from 'react';
import { Cloud, Eye, EyeOff, LogIn, UserPlus, ArrowLeft } from 'lucide-react';
import { signIn, signUp } from '@/lib/pocketbase';

interface CloudAuthScreenProps {
  onAuthenticated: () => void;
  onContinueLocal?: () => void;
  onCancel?: () => void;
}

export default function CloudAuthScreen({ onAuthenticated, onContinueLocal, onCancel }: CloudAuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
      onAuthenticated();
    } catch {
      setError(mode === 'login' ? 'El correu o la contrasenya no són correctes.' : 'No s’ha pogut crear el compte. Comprova el correu i la contrasenya.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-screen [height:100dvh] bg-slate-50 dark:bg-slate-950 flex flex-col overflow-y-auto">
      <div className="flex-1 flex items-center px-5 py-8">
        <div className="max-w-md mx-auto w-full">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-900/40">
              <Cloud className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Paraules</h1>
            <p className="text-slate-500 dark:text-slate-400 text-center mt-2 text-[15px] leading-relaxed">
              Inicia sessió per sincronitzar les teves fitxes entre dispositius.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Correu electrònic</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@exemple.com"
                autoComplete="email"
                required
                className="w-full h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Contrasenya del compte</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="La contrasenya del compte"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                  className="w-full h-12 px-4 pr-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" aria-label={showPassword ? 'Amaga la contrasenya' : 'Mostra la contrasenya'}>
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-red-600 dark:text-red-300 text-sm">{error}</div>}

            <button type="submit" disabled={busy} className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-slate-950 font-semibold text-[16px] transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30">
              {mode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              {busy ? 'Connectant…' : mode === 'login' ? 'Inicia sessió' : 'Crea el compte'}
            </button>
          </form>

          <button onClick={() => { setMode((current) => current === 'login' ? 'register' : 'login'); setError(''); }} className="w-full mt-5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            {mode === 'login' ? 'Encara no tens compte? Crea’n un' : 'Ja tens compte? Inicia sessió'}
          </button>
          {onContinueLocal && (
            <button onClick={onContinueLocal} className="w-full mt-4 text-sm text-slate-500 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 underline transition-colors">
              Continua sense sincronització
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} className="w-full mt-4 text-sm text-slate-500 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors flex items-center justify-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              Torna a la caixa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
