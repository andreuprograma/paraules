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
import { getCloudUser, pb, signOut } from '@/lib/pocketbase';
import { cancelCloudSyncRequests, markMessageDeleted, mergeLocalWithCloud, saveMessageLogo, upsertMessage } from '@/lib/cloudSync';
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
  const [cloudUserId, setCloudUserId] = useState<string | null>(() => getCloudUser()?.id ?? null);
  const cloudUserIdRef = useRef(cloudUserId);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => pb.authStore.onChange(() => {
    const nextUserId = getCloudUser()?.id ?? null;
    if (cloudUserIdRef.current === nextUserId) return;

    cancelCloudSyncRequests(cloudUserIdRef.current);
    cloudUserIdRef.current = nextUserId;
    setCloudUserId(nextUserId);
    setSeedWord('');
    setCloudStatus('offline');
    setState(nextUserId ? (getEncryptedSeed() ? 'locked' : 'setup') : 'auth');
  }), []);

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
    setSeedWord('');
    setCloudStatus('synced');
    continueToApp();
  }

  async function syncInitialMessages(localMessages: ChatMessage[]): Promise<ChatMessage[]> {
    const userId = cloudUserId;
    if (!userId) return localMessages;
    if (getCloudUser()?.id !== userId) throw new Error('La sessió del compte ha canviat.');
    setCloudStatus('syncing');
    try {
      const merged = await mergeLocalWithCloud(seedWord, defaultSettings.autoHide, userId);
      if (getCloudUser()?.id !== userId) throw new Error('La sessió del compte ha canviat.');
      setCloudStatus('synced');
      return merged;
    } catch (error) {
      if (getCloudUser()?.id === userId) setCloudStatus('error');
      throw error;
    }
  }

  function syncMessage(message: ChatMessage): void {
    const userId = cloudUserId;
    if (!userId || getCloudUser()?.id !== userId) return;
    upsertMessage(message, seedWord, userId)
      .then(() => { if (getCloudUser()?.id === userId) setCloudStatus('synced'); })
      .catch(() => { if (getCloudUser()?.id === userId) setCloudStatus('error'); });
  }

  function deleteCloudMessage(message: ChatMessage): void {
    const userId = cloudUserId;
    if (!userId || getCloudUser()?.id !== userId) return;
    markMessageDeleted(message, seedWord, userId)
      .then(() => { if (getCloudUser()?.id === userId) setCloudStatus('synced'); })
      .catch(() => { if (getCloudUser()?.id === userId) setCloudStatus('error'); });
  }

  async function saveCloudMessageLogo(message: ChatMessage, file: File | undefined): Promise<string | undefined> {
    const userId = cloudUserId;
    if (!userId || getCloudUser()?.id !== userId) {
      throw new Error('Inicia sessió al núvol per desar o eliminar el fitxer del logo a PocketBase.');
    }
    setCloudStatus('syncing');
    try {
      const logoUrl = await saveMessageLogo(message, file, seedWord, userId);
      if (getCloudUser()?.id === userId) setCloudStatus('synced');
      return logoUrl;
    } catch (error) {
      if (getCloudUser()?.id === userId) setCloudStatus('error');
      const detail = error instanceof Error ? error.message : 'Error desconegut.';
      throw new Error(`No s’ha pogut actualitzar el logo a PocketBase. Comprova la connexió i els permisos de la col·lecció. Detall: ${detail}`);
    }
  }

  function handleSignOut(): void {
    signOut();
    setCloudStatus('offline');
    setSeedWord('');
    setDefaultSettings(getDefaultSettings());
    setState('auth');
  }

  function handleSignIn(): void {
    setSeedWord('');
    setState('auth');
  }

  function handleSignInCancel(): void {
    setSeedWord('');
    continueToApp();
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
          setSeedWord(seed);
          setState('unlocked');
        }}
        onResetLocalData={() => {
          setSeedWord('');
          setDefaultSettings(getDefaultSettings());
          setState('setup');
        }}
      />
    );
  }

  return (
    <ChatScreen
      key={cloudUserId ?? 'local'}
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
      cloudUserId={cloudUserId}
      theme={theme}
      onThemeChange={handleThemeChange}
      onSignOut={handleSignOut}
      onSignIn={handleSignIn}
    />
  );
}
