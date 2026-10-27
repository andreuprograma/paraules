import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import SetupScreen from '@/components/SetupScreen';
import UnlockScreen from '@/components/UnlockScreen';
import CloudAuthScreen from '@/components/CloudAuthScreen';
import ChatScreen from '@/components/ChatScreen';
import {
  ChatMessage,
  getEncryptedSeed,
  getMasterFormat,
  getPinOnlySeedVault,
  hasConfiguredMaster,
  getDefaultSettings,
  MasterFormat,
  SavedSettings,
} from '@/lib/storage';
import { decryptSeed } from '@/lib/passwordGenerator';
import { verifySeedVaultPin } from '@/lib/seedVault';
import { getCloudUser, pb, signOut } from '@/lib/pocketbase';
import { cancelCloudSyncRequests, markMessageDeleted, mergeLocalWithCloud, saveMessageLogo, upsertMessage } from '@/lib/cloudSync';
import { applyTheme, getTheme, setTheme, Theme } from '@/lib/theme';

type AppState = 'loading' | 'auth' | 'setup' | 'locked' | 'unlocked';
type CloudStatus = 'offline' | 'syncing' | 'synced' | 'error';

interface FocusSnapshot {
  element: HTMLElement;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'forward' | 'backward' | 'none' | null;
}

function captureFocusedElement(container: HTMLElement | null): FocusSnapshot | null {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement) || !container?.contains(element)) return null;

  if (element instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'password'].includes(element.type)) {
    return {
      element,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
      selectionDirection: element.selectionDirection,
    };
  }
  if (element instanceof HTMLTextAreaElement) {
    return {
      element,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
      selectionDirection: element.selectionDirection,
    };
  }
  return { element, selectionStart: null, selectionEnd: null, selectionDirection: null };
}

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [, setMasterFormat] = useState<MasterFormat>(() => getMasterFormat());
  const [upgradingMaster, setUpgradingMaster] = useState(false);
  const [seedWord, setSeedWord] = useState('');
  const [chatSessionMounted, setChatSessionMounted] = useState(false);
  const [focusBaseWordOnMount, setFocusBaseWordOnMount] = useState(false);
  const [defaultSettings, setDefaultSettings] = useState<SavedSettings>(getDefaultSettings());
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('offline');
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const lastActivityRef = useRef<number>(Date.now());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const focusSnapshotRef = useRef<FocusSnapshot | null>(null);
  const hasOpenedChatRef = useRef(false);
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
    setChatSessionMounted(false);
    setFocusBaseWordOnMount(false);
    hasOpenedChatRef.current = false;
    focusSnapshotRef.current = null;
    setCloudStatus('offline');
    const hasMaster = hasConfiguredMaster();
    setMasterFormat(getMasterFormat());
    setState(nextUserId ? (hasMaster ? 'locked' : 'setup') : 'auth');
  }), []);

  function handleThemeChange(next: Theme): void {
    setTheme(next);
    setThemeState(next);
  }

  useEffect(() => {
    const hasSeed = hasConfiguredMaster();
    setMasterFormat(getMasterFormat());
    setState(getCloudUser() ? (hasSeed ? 'locked' : 'setup') : 'auth');
  }, []);

  const cloudActionsEnabled = true;

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    if (getMasterFormat() === 'pin') {
      const rawVault = getPinOnlySeedVault();
      if (!rawVault) return false;
      try {
        return await verifySeedVaultPin(JSON.parse(rawVault), pin);
      } catch {
        return false;
      }
    }
    const encrypted = getEncryptedSeed();
    return encrypted ? decryptSeed(encrypted, pin) !== null : false;
  }, []);

  const rememberFocusedElement = useCallback(() => {
    const snapshot = captureFocusedElement(chatContainerRef.current);
    if (snapshot) focusSnapshotRef.current = snapshot;
  }, []);

  const lockApp = useCallback(() => {
    rememberFocusedElement();
    setFocusBaseWordOnMount(false);
    setSeedWord('');
    setState('locked');
  }, [rememberFocusedElement]);

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
        lockApp();
      }
    }
    const intervalId = window.setInterval(checkInterval, 1000);

    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        rememberFocusedElement();
        return;
      }
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastActivityRef.current >= lockSeconds * 1000) {
          lockApp();
        }
      }
    }
    function onWindowBlur() {
      rememberFocusedElement();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      userEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [state, defaultSettings.autoCollapseSeconds, lockApp, rememberFocusedElement]);

  useLayoutEffect(() => {
    if (state !== 'unlocked') return;
    const snapshot = focusSnapshotRef.current;
    if (!snapshot) return;
    focusSnapshotRef.current = null;
    if (!snapshot.element.isConnected || snapshot.element.closest('[hidden]') || snapshot.element.matches(':disabled')) return;

    snapshot.element.focus({ preventScroll: true });
    if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null &&
      (snapshot.element instanceof HTMLInputElement || snapshot.element instanceof HTMLTextAreaElement)) {
      snapshot.element.setSelectionRange(
        snapshot.selectionStart,
        snapshot.selectionEnd,
        snapshot.selectionDirection ?? undefined,
      );
    }
  }, [state]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  function continueToApp(): void {
    focusSnapshotRef.current = null;
    setState(hasConfiguredMaster() ? 'locked' : 'setup');
  }

  function handleCloudAuthenticated(): void {
    setSeedWord('');
    setCloudStatus(cloudActionsEnabled ? 'synced' : 'offline');
    continueToApp();
  }

  async function syncInitialMessages(localMessages: ChatMessage[]): Promise<ChatMessage[]> {
    if (!cloudActionsEnabled) return localMessages;
    const userId = cloudUserId;
    if (!userId) return localMessages;
    if (getCloudUser()?.id !== userId) throw new Error('La sessió del compte ha canviat.');
    setCloudStatus('syncing');
    try {
      const merged = await mergeLocalWithCloud(seedWord, defaultSettings.autoHide, userId, localMessages);
      if (getCloudUser()?.id !== userId) throw new Error('La sessió del compte ha canviat.');
      setCloudStatus('synced');
      return merged;
    } catch (error) {
      if (getCloudUser()?.id === userId) setCloudStatus('error');
      throw error;
    }
  }

  function syncMessage(message: ChatMessage): void {
    if (!cloudActionsEnabled) return;
    const userId = cloudUserId;
    if (!userId || getCloudUser()?.id !== userId) return;
    upsertMessage(message, seedWord, userId)
      .then(() => { if (getCloudUser()?.id === userId) setCloudStatus('synced'); })
      .catch(() => { if (getCloudUser()?.id === userId) setCloudStatus('error'); });
  }

  async function deleteCloudMessage(message: ChatMessage): Promise<void> {
    if (!cloudActionsEnabled) throw new Error('La sincronització està pausada per evitar alterar dades xifrades antigues.');
    const userId = cloudUserId;
    if (!userId) return;
    if (getCloudUser()?.id !== userId) throw new Error('La sessió del compte ha canviat; no s’ha eliminat la fitxa.');
    setCloudStatus('syncing');
    try {
      await markMessageDeleted(message, seedWord, userId);
      if (getCloudUser()?.id === userId) setCloudStatus('synced');
    } catch (error) {
      if (getCloudUser()?.id === userId) setCloudStatus('error');
      throw error;
    }
  }

  async function saveCloudMessageLogo(message: ChatMessage, file: File | undefined, logoUrl: string | undefined): Promise<string | undefined> {
    if (!cloudActionsEnabled) throw new Error('La sincronització està pausada per evitar alterar dades xifrades antigues.');
    const userId = cloudUserId;
    if (!userId && !getCloudUser()) {
      if (file) throw new Error('Inicia sessió al núvol per desar un fitxer de logotip.');
      return logoUrl;
    }
    if (!userId || getCloudUser()?.id !== userId) {
      throw new Error('Inicia sessió al núvol per desar o eliminar el fitxer del logo a PocketBase.');
    }
    setCloudStatus('syncing');
    try {
      const savedLogoUrl = await saveMessageLogo(message, file, logoUrl, seedWord, userId);
      if (getCloudUser()?.id === userId) setCloudStatus('synced');
      return savedLogoUrl;
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
    return (
      <SetupScreen
        isUpgrade={upgradingMaster}
        onCancel={upgradingMaster ? () => {
          setUpgradingMaster(false);
          hasOpenedChatRef.current = false;
          setState('locked');
        } : undefined}
        onComplete={() => {
          setMasterFormat(getMasterFormat());
          setUpgradingMaster(false);
          hasOpenedChatRef.current = false;
          setSeedWord('');
          setState('locked');
        }}
      />
    );
  }

  return (
    <>
      {chatSessionMounted && state === 'unlocked' && (
        <div ref={chatContainerRef}>
          <ChatScreen
            key={cloudUserId ?? 'local'}
            seedWord={seedWord}
            defaultSettings={defaultSettings}
            onDefaultSettingsChange={setDefaultSettings}
            verifyPin={verifyPin}
            onLock={lockApp}
            cloudStatus={cloudStatus}
            onInitialSync={cloudActionsEnabled ? syncInitialMessages : undefined}
            onCloudMessageChange={cloudActionsEnabled ? syncMessage : undefined}
            onCloudMessageDelete={cloudUserId ? deleteCloudMessage : undefined}
            onCloudLogoChange={cloudActionsEnabled ? saveCloudMessageLogo : undefined}
            cloudUserId={cloudUserId}
            theme={theme}
            onThemeChange={handleThemeChange}
            onSignOut={handleSignOut}
            onSignIn={handleSignIn}
            focusBaseWordOnMount={focusBaseWordOnMount}
            onInitialFocusComplete={() => setFocusBaseWordOnMount(false)}
            cloudActionsEnabled={cloudActionsEnabled}
          />
        </div>
      )}
      {state === 'locked' && (
        <div className="fixed inset-0 z-50">
          <UnlockScreen
            onReconfigurePinOnly={() => {
              setSeedWord('');
              setChatSessionMounted(false);
              hasOpenedChatRef.current = false;
              setUpgradingMaster(true);
              setState('setup');
            }}
            onUnlock={(seed) => {
              setSeedWord(seed);
              if (!hasOpenedChatRef.current) {
                hasOpenedChatRef.current = true;
                setChatSessionMounted(true);
                setFocusBaseWordOnMount(true);
              }
              setState('unlocked');
            }}
            onResetLocalData={() => {
              setSeedWord('');
              setMasterFormat(getMasterFormat());
              setUpgradingMaster(false);
              setChatSessionMounted(false);
              setFocusBaseWordOnMount(false);
              hasOpenedChatRef.current = false;
              focusSnapshotRef.current = null;
              setDefaultSettings(getDefaultSettings());
              setState('setup');
            }}
          />
        </div>
      )}
    </>
  );
}
