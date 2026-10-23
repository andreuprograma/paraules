import { useEffect, useRef, useState } from 'react';
import SetupScreen from '@/components/SetupScreen';
import UnlockScreen from '@/components/UnlockScreen';
import CloudAuthScreen from '@/components/CloudAuthScreen';
import ChatScreen from '@/components/ChatScreen';
import {
  ChatMessage,
  getEncryptedSeed,
  getDefaultSettings,
  SavedSettings,
} from '@/lib/storage';
import { decryptSeed } from '@/lib/passwordGenerator';
import { getCloudUser, signOut } from '@/lib/pocketbase';
import { markMessageDeleted, mergeLocalWithCloud, saveMessageLogo, upsertMessage } from '@/lib/cloudSync';
import { applyTheme, getTheme, setTheme, Theme } from '@/lib/theme';

type AppState = 'loading' | 'auth' | 'setup' | 'locked' | 'unlocked';
type CloudStatus = 'offline' | 'syncing' | 'synced' | 'error';

function verifyPin(pin: string): boolean {
  const encrypted = getEncryptedSeed();
  if (!encrypted) return false;
  return decryptSeed(encrypted, pin) !== null;
}

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [seedWord, setSeedWord] = useState('');
  const [defaultSettings, setDefaultSettings] = useState<SavedSettings>(getDefaultSettings());
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('offline');
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function handleThemeChange(next: Theme): void {
    setTheme(next);
    setThemeState(next);
  }

  useEffect(() => {
    const hasSeed = getEncryptedSeed() !== null;
    setState(getCloudUser() ? (hasSeed ? 'locked' : 'setup') : 'auth');
  }, []);

  useEffect(() => {
    if (state !== 'unlocked') return;
    const lockSeconds = defaultSettings.autoCollapseSeconds;
    if (!lockSeconds || lockSeconds <= 0) return;

    lastActivityRef.current = Date.now();

    function resetTimer() {
      lastActivityRef.current = Date.now();
    }

    const userEvents = [
      'mousedown',
      'mouseup',
      'click',
      'touchstart',
      'touchend',
      'keydown',
      'keyup',
      'wheel',
      'scroll',
      'pointerdown',
      'pointerup',
      'input',
    ];

    userEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    function checkInterval() {
      if (Date.now() - lastActivityRef.current >= lockSeconds * 1000) {
        setState('locked');
      }
    }
    const intervalId = window.setInterval(checkInterval, 1000);

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastActivityRef.current >= lockSeconds * 1000) {
          setState('locked');
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      userEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [state, defaultSettings.autoCollapseSeconds]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  function continueToApp(): void {
    setState(getEncryptedSeed() ? 'locked' : 'setup');
  }

  function handleCloudAuthenticated(): void {
    setCloudStatus('synced');
    if (seedWord && getEncryptedSeed()) {
      setState('unlocked');
    } else {
      continueToApp();
    }
  }

  async function syncInitialMessages(localMessages: ChatMessage[]): Promise<ChatMessage[]> {
    if (!getCloudUser()) return localMessages;
    setCloudStatus('syncing');
    try {
      const merged = await mergeLocalWithCloud(localMessages, seedWord, defaultSettings.autoHide);
      setCloudStatus('synced');
      return merged;
    } catch {
      setCloudStatus('error');
      throw new Error('No s’ha pogut sincronitzar amb el núvol.');
    }
  }

  function syncMessage(message: ChatMessage): void {
    if (!getCloudUser()) return;
    upsertMessage(message, seedWord).then(() => setCloudStatus('synced')).catch(() => setCloudStatus('error'));
  }

  function deleteCloudMessage(message: ChatMessage): void {
    if (!getCloudUser()) return;
    markMessageDeleted(message, seedWord).then(() => setCloudStatus('synced')).catch(() => setCloudStatus('error'));
  }

  async function saveCloudMessageLogo(message: ChatMessage, file: File | undefined): Promise<string | undefined> {
    if (!getCloudUser()) {
      throw new Error('Inicia sessió al núvol per desar o eliminar el fitxer del logo a PocketBase.');
    }
    setCloudStatus('syncing');
    try {
      const logoUrl = await saveMessageLogo(message, file, seedWord);
      setCloudStatus('synced');
      return logoUrl;
    } catch (error) {
      setCloudStatus('error');
      const detail = error instanceof Error ? error.message : 'Error desconegut.';
      throw new Error(`No s’ha pogut actualitzar el logo a PocketBase. Comprova la connexió i els permisos de la col·lecció. Detall: ${detail}`);
    }
  }

  function handleSignOut(): void {
    signOut();
    setCloudStatus('offline');
    setSeedWord('');
    setState('auth');
  }

  function handleSignIn(): void {
    setState('auth');
  }

  function handleSignInCancel(): void {
    if (seedWord && getEncryptedSeed()) {
      setState('unlocked');
    } else {
      continueToApp();
    }
  }

  if (state === 'auth') {
    return (
      <CloudAuthScreen
        onAuthenticated={handleCloudAuthenticated}
        onContinueLocal={seedWord ? undefined : continueToApp}
        onCancel={seedWord ? handleSignInCancel : undefined}
      />
    );
  }

  if (state === 'setup') {
    return <SetupScreen onComplete={() => setState('locked')} />;
  }

  if (state === 'locked') {
    return (
      <UnlockScreen
        onUnlock={(seed) => {
          if (!seedWord) setSeedWord(seed);
          setState('unlocked');
        }}
        onReset={() => {
          setSeedWord('');
          setState('setup');
        }}
      />
    );
  }

  return (
    <ChatScreen
      seedWord={seedWord}
      defaultSettings={defaultSettings}
      onDefaultSettingsChange={setDefaultSettings}
      verifyPin={verifyPin}
      onLock={() => {
        setSeedWord('');
        setState('locked');
      }}
      cloudStatus={cloudStatus}
      onInitialSync={syncInitialMessages}
      onCloudMessageChange={syncMessage}
      onCloudMessageDelete={deleteCloudMessage}
      onCloudLogoChange={saveCloudMessageLogo}
      theme={theme}
      onThemeChange={handleThemeChange}
      onSignOut={handleSignOut}
      onSignIn={handleSignIn}
    />
  );
}
