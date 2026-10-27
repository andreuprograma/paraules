import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Image, MessageSquare, RefreshCw, Trash2 } from 'lucide-react';
import { estimateStrength } from '@/lib/passwordGenerator';
import { resolveLogoInput } from '@/lib/logo';
import type { PasswordEnvelopeV1 } from '@/lib/passwordEncryption';
import type { SavedPasswordRecord } from '@/lib/storage';
import type { MessageOptions } from '@/lib/storage';
import { decryptSavedPasswordDetails, decryptSavedPasswordField, encryptSavedPasswordField } from '@/lib/savedPasswordCrypto';
import type { SavedPasswordDetails } from '@/lib/savedPasswordCrypto';
import { PasswordCardActions, PasswordCardIcon, PasswordCardSurface } from './PasswordCardVisuals';

interface SavedPasswordDraft {
  id: string;
  password: string;
}

interface SavedPasswordCardsProps {
  records: SavedPasswordRecord[];
  seedWord: string;
  defaultOptions: MessageOptions;
  draft: SavedPasswordDraft | null;
  onSave: (name: PasswordEnvelopeV1, password: PasswordEnvelopeV1) => Promise<void>;
  onUpdate: (id: string, name: PasswordEnvelopeV1, password: PasswordEnvelopeV1) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onConvertToPartA: (id: string, details: SavedPasswordDetails, options: MessageOptions) => Promise<void>;
  onCancelDraft: () => void;
  autoHide: boolean;
  collapseAllSignal?: number;
  expandAllSignal?: number;
  onExpandedChange?: (id: string, expanded: boolean) => void;
  highlightId?: string | null;
  expandId?: string | null;
  expandSignal?: number;
}

interface SavedPasswordCardProps {
  record?: SavedPasswordRecord;
  seedWord: string;
  defaultOptions: MessageOptions;
  initialPassword?: string;
  onSave: SavedPasswordCardsProps['onSave'];
  onUpdate: SavedPasswordCardsProps['onUpdate'];
  onDelete: SavedPasswordCardsProps['onDelete'];
  onConvertToPartA: SavedPasswordCardsProps['onConvertToPartA'];
  onCancelDraft?: () => void;
  expandSignal?: number;
  autoHide: boolean;
  collapseAllSignal?: number;
  expandAllSignal?: number;
  onExpandedChange?: (id: string, expanded: boolean) => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + date.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
}

function SavedPasswordCard({
  record,
  seedWord,
  defaultOptions,
  initialPassword = '',
  onSave,
  onUpdate,
  onDelete,
  onConvertToPartA,
  onCancelDraft,
  expandSignal = 0,
  autoHide,
  collapseAllSignal = 0,
  expandAllSignal = 0,
  onExpandedChange,
}: SavedPasswordCardProps) {
  const isDraft = !record;
  const [details, setDetails] = useState<SavedPasswordDetails>({ name: '', notes: '', icon: '🔐' });
  const [password, setPassword] = useState(initialPassword);
  const [expanded, setExpanded] = useState(isDraft);
  const [passwordVisible, setPasswordVisible] = useState(!autoHide);
  const [notesOpen, setNotesOpen] = useState(false);
  const [editingName, setEditingName] = useState(isDraft);
  const [logoPanelOpen, setLogoPanelOpen] = useState(false);
  const [logoQuery, setLogoQuery] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [logoError, setLogoError] = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoResolvedDomain, setLogoResolvedDomain] = useState('');
  const [regenerationPanelOpen, setRegenerationPanelOpen] = useState(false);
  const [regenerationOptions, setRegenerationOptions] = useState<MessageOptions>(defaultOptions);
  const [symbolsPanelOpen, setSymbolsPanelOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (expandSignal > 0) {
      setExpanded(true);
      setPasswordVisible(true);
      if (record) onExpandedChange?.(record.id, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal]);

  useEffect(() => {
    if (collapseAllSignal > 0 && record) {
      setExpanded(false);
      if (autoHide) setPasswordVisible(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseAllSignal]);

  useEffect(() => {
    if (expandAllSignal > 0 && record) {
      setExpanded(true);
      setPasswordVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandAllSignal]);

  function toggleExpanded(): void {
    if (!record) return;
    const expanding = !expanded;
    setExpanded(expanding);
    setPasswordVisible(expanding ? true : !autoHide && passwordVisible);
    onExpandedChange?.(record.id, expanding);
  }

  useEffect(() => {
    let active = true;
    if (!record) return;

    Promise.all([
      decryptSavedPasswordDetails(record.encryptedName, seedWord),
      decryptSavedPasswordField(record.encryptedPassword, seedWord, 'password'),
    ]).then(([nextDetails, nextPassword]) => {
      if (!active) return;
      setDetails(nextDetails);
      setPassword(nextPassword);
      setLogoPreviewUrl(nextDetails.logoUrl ?? '');
      setError('');
    }).catch(() => {
      if (active) setError('No s’han pogut desxifrar les dades d’aquesta contrasenya.');
    });

    return () => { active = false; };
  }, [record, seedWord]);

  const strength = estimateStrength(password);
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];
  const strengthText = ['text-red-600 dark:text-red-400', 'text-orange-600 dark:text-orange-400', 'text-yellow-600 dark:text-yellow-400', 'text-emerald-600 dark:text-emerald-400'];
  const createdLabel = record ? formatDate(record.createdAt) : '';
  const updatedLabel = record ? formatDate(record.updatedAt) : '';
  const datesMatch = createdLabel && updatedLabel && createdLabel === updatedLabel;

  async function save(): Promise<void> {
    if (!details.name.trim() || !password) {
      setError('Escriu un nom o servei i una contrasenya.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const [encryptedName, encryptedPassword] = await Promise.all([
        encryptSavedPasswordField(details.name.trim(), seedWord, 'name', {
          notes: details.notes,
          icon: details.icon,
          logoUrl: details.logoUrl,
        }),
        encryptSavedPasswordField(password, seedWord, 'password'),
      ]);
      if (record) {
        await onUpdate(record.id, encryptedName, encryptedPassword);
        setEditingName(false);
        setNotesOpen(false);
        setLogoPanelOpen(false);
      } else {
        await onSave(encryptedName, encryptedPassword);
        onCancelDraft?.();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No s’ha pogut xifrar i desar la contrasenya.');
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(password);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = password;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copiedSuccessfully = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copiedSuccessfully) throw new Error('Clipboard copy was rejected.');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('No s’ha pogut copiar la contrasenya. Comprova els permisos del porta-retalls.');
    }
  }

  function handleNotesButtonClick(): void {
    if (notesOpen) {
      notesRef.current?.focus();
    } else {
      setNotesOpen(true);
    }
  }

  function previewLogo(): void {
    try {
      const resolved = resolveLogoInput(logoQuery, import.meta.env.VITE_LOGODEV_TOKEN || '');
      setLogoPreviewUrl(resolved.url);
      setLogoResolvedDomain(resolved.domain || '');
      setLogoError('');
      setLogoLoading(true);
    } catch (previewError) {
      setLogoPreviewUrl('');
      setLogoResolvedDomain('');
      setLogoLoading(false);
      setLogoError(previewError instanceof Error ? previewError.message : 'No s’ha pogut validar la imatge.');
    }
  }

  function handleLogoLoaded(): void {
    setLogoLoading(false);
    setDetails((current) => ({ ...current, logoUrl: logoPreviewUrl }));
  }

  function handleLogoFailed(): void {
    setLogoLoading(false);
    setLogoError(logoResolvedDomain
      ? `No s’ha pogut carregar el logo per al domini ${logoResolvedDomain}. Comprova el token i la connexió.`
      : 'No s’ha pogut carregar la imatge. Comprova que la URL sigui accessible i apunti a una imatge.');
  }

  function removeLogo(): void {
    setLogoPreviewUrl('');
    setLogoQuery('');
    setLogoResolvedDomain('');
    setLogoError('');
    setLogoLoading(false);
    setDetails((current) => ({ ...current, logoUrl: undefined }));
  }

  function openRegenerationOptions(): void {
    setRegenerationOptions(defaultOptions);
    setRegenerationPanelOpen(true);
  }

  async function convertToPartA(): Promise<void> {
    if (!record) return;
    setBusy(true);
    setError('');
    try {
      await onConvertToPartA(record.id, details, regenerationOptions);
    } catch (conversionError) {
      setError(conversionError instanceof Error
        ? conversionError.message
        : 'No s’ha pogut convertir la fitxa a la Part A.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!record) {
      onCancelDraft?.();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onDelete(record.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No s’ha pogut eliminar la contrasenya.');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <PasswordCardSurface>
      <header
        className={`flex items-center gap-2 p-4 ${record ? 'cursor-pointer select-none' : ''}`}
        onClick={toggleExpanded}
      >
        <PasswordCardIcon
          logoUrl={details.logoUrl}
          icon={details.icon}
          alt={`Logotip de ${details.name}`}
          onError={() => setLogoError('El logo guardat no s’ha pogut carregar. Torna a provar amb un domini correcte.')}
        />
        {editingName ? (
          <input
            value={details.name}
            onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))}
            onClick={(event) => event.stopPropagation()}
            maxLength={200}
            autoFocus={isDraft}
            placeholder="Nom o servei"
            aria-label="Nom o servei"
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900 dark:text-white">
            {details.name || 'Contrasenya nova'}
          </h3>
        )}
        {record && (
          <>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); setEditingName((value) => !value); setExpanded(true); }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
              aria-label={editingName ? 'Deixa d’editar el nom' : 'Edita el nom o servei'}
            >
              <span className="text-xs">✎</span>
            </button>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); toggleExpanded(); }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              aria-label={expanded ? 'Replega fitxa' : 'Desplega fitxa'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </>
        )}
      </header>

      {expanded && (
        <div className="px-4 pb-4">
          {logoPanelOpen && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                URL d’imatge, marca coneguda o domini
              </label>
              <div className="flex gap-2">
                <input
                  value={logoQuery}
                  onChange={(event) => { setLogoQuery(event.target.value); setLogoPreviewUrl(''); setLogoError(''); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); previewLogo(); } }}
                  placeholder="https://exemple.cat/logo.png"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button type="button" onClick={previewLogo} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                  Previsualitza
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Introdueix una marca coneguda, un domini o una URL d’imatge com a la Part A.
              </p>
              {logoResolvedDomain && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Provant el domini <span className="font-mono">{logoResolvedDomain}</span>.</p>}
              {logoLoading && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Carregant la previsualització…</p>}
              {logoError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{logoError}</p>}
              {logoPreviewUrl && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <img src={logoPreviewUrl} alt="Previsualització del logotip" className="h-full w-full object-contain" onLoad={handleLogoLoaded} onError={handleLogoFailed} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setDetails((current) => ({ ...current, logoUrl: logoPreviewUrl })); setLogoPanelOpen(false); }} disabled={logoLoading || !!logoError} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
                      Desa el logotip
                    </button>
                    <button type="button" onClick={removeLogo} className="rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      Treu-lo
                    </button>
                  </div>
                </div>
              )}
              <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Canvia la icona
                <input
                  value={details.icon}
                  onChange={(event) => setDetails((current) => ({ ...current, icon: event.target.value }))}
                  maxLength={8}
                  aria-label="Canvia la icona"
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
            </div>
          )}

          <label className="block border-t border-slate-200 pt-3 dark:border-slate-700">
            <span className="sr-only">Contrasenya</span>
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              aria-label="Contrasenya"
              placeholder="Contrasenya"
              className="w-full min-w-0 bg-transparent font-mono text-[15px] leading-relaxed tracking-wide text-emerald-700 outline-none dark:text-emerald-300"
              style={{ overflowWrap: 'anywhere' }}
            />
          </label>

          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className={`h-full transition-all duration-300 ${strengthColors[strength.score - 1]}`} style={{ width: `${(strength.score / 4) * 100}%` }} />
            </div>
            <span className={`text-[11px] font-medium ${strengthText[strength.score - 1]}`}>{strength.label}</span>
          </div>

          {record && regenerationPanelOpen && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Paràmetres per regenerar</span>
              </div>
              <div className="mt-2 flex w-full min-w-0 items-center gap-1">
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setRegenerationOptions((current) => ({ ...current, length: Math.max(2, current.length - 1) }))}
                    disabled={regenerationOptions.length <= 2}
                    aria-label="Redueix la llargada per regenerar"
                    className="box-border h-9 w-8 rounded-lg border border-slate-300 bg-white text-lg font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-mono text-xs font-semibold text-slate-900 dark:text-white" aria-live="polite">
                    {regenerationOptions.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRegenerationOptions((current) => ({ ...current, length: Math.min(100, current.length + 1) }))}
                    disabled={regenerationOptions.length >= 100}
                    aria-label="Augmenta la llargada per regenerar"
                    className="box-border h-9 w-8 rounded-lg border border-slate-300 bg-white text-lg font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    +
                  </button>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  {([
                    ['uppercase', 'ABC', 'Majúscules'],
                    ['lowercase', 'abc', 'Minúscules'],
                    ['numbers', '123', 'Números'],
                    ['symbols', '@#!', 'Símbols'],
                  ] as const).map(([key, label, title]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={regenerationOptions[key]}
                      title={title}
                      onClick={() => setRegenerationOptions((current) => ({ ...current, [key]: !current[key] }))}
                      className={`box-border h-9 min-w-0 flex-1 whitespace-nowrap rounded-lg px-0.5 text-[10px] font-semibold transition-colors min-[390px]:text-xs ${regenerationOptions[key] ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label={symbolsPanelOpen ? 'Amaga els símbols permesos' : 'Mostra els símbols permesos'}
                  aria-expanded={symbolsPanelOpen}
                  onClick={() => setSymbolsPanelOpen((open) => !open)}
                  className="box-border flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {symbolsPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
              {symbolsPanelOpen && (
                <input
                  type="text"
                  value={regenerationOptions.allowedSymbols}
                  onChange={(event) => setRegenerationOptions((current) => ({ ...current, allowedSymbols: event.target.value }))}
                  placeholder="Símbols permesos (buit = predeterminats)"
                  aria-label="Símbols permesos per regenerar"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 box-border h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                />
              )}
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/60">
                  <div className="mb-3 flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                      La contrasenya actual se substituirà per una de nova amb aquests paràmetres. Recorda que l’aplicació no actualitza el servei extern: hauràs d’actualitzar-hi la contrasenya manualment.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void convertToPartA()} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50">
                      <RefreshCw className="h-4 w-4" />
                      Sí, regenera
                    </button>
                    <button type="button" disabled={busy} onClick={() => setRegenerationPanelOpen(false)} className="h-9 flex-1 rounded-lg bg-slate-100 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">
                      Cancel·la
                    </button>
                  </div>
                </div>
            </div>
          )}

          {createdLabel && (
            <div className="mt-3 flex justify-end">
              <span className="font-mono text-[10px] leading-tight text-slate-400 dark:text-slate-500" title={datesMatch ? `Creada: ${createdLabel}` : `Creada: ${createdLabel}\nModificada: ${updatedLabel}`}>
                {datesMatch ? createdLabel : <>C {createdLabel} · M {updatedLabel}</>}
              </span>
            </div>
          )}

          {notesOpen && (
            <div className="mt-2">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor={`saved-password-notes-${record?.id ?? 'draft'}`}>
                Observacions
              </label>
              <textarea
                ref={notesRef}
                id={`saved-password-notes-${record?.id ?? 'draft'}`}
                value={details.notes}
                onChange={(event) => setDetails((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Escriu un comentari…"
                rows={2}
                className="w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
              />
            </div>
          )}

          <PasswordCardActions actions={[
            { key: 'copy', label: 'Copia la contrasenya', title: copied ? 'Copiada' : 'Copia', icon: copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />, onClick: () => void copyPassword() },
            { key: 'visibility', label: passwordVisible ? 'Amaga la contrasenya' : 'Mostra la contrasenya', title: passwordVisible ? 'Amaga' : 'Mostra', icon: passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />, onClick: () => setPasswordVisible((value) => !value) },
            { key: 'comment', label: 'Comentari', title: 'Comentari', icon: <MessageSquare className="h-4 w-4" />, active: !!details.notes || notesOpen, onClick: handleNotesButtonClick },
            {
              key: 'logo',
              label: 'Canvia la icona',
              title: 'Cerca o canvia el logotip',
              icon: <Image className="h-4 w-4" />,
              active: logoPanelOpen || !!details.logoUrl,
              onClick: () => { setLogoPanelOpen((open) => !open); setLogoQuery(''); setLogoPreviewUrl(details.logoUrl ?? ''); setLogoError(''); },
            },
            record ? {
              key: 'regenerate',
              label: 'Torna a generar',
              title: 'Regenera i converteix a la Part A',
              icon: <RefreshCw className="h-4 w-4" />,
              active: regenerationPanelOpen,
              onClick: openRegenerationOptions,
            } : null,
            { key: 'delete', label: 'Esborra la contrasenya', title: 'Esborra', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setConfirmDelete(true) },
          ]} />

          {confirmDelete && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800/60 dark:bg-red-950/50">
              <p className="mb-3 text-sm leading-relaxed text-red-700 dark:text-red-200">
                Segur que vols esborrar la contrasenya de <span className="font-semibold">{details.name}</span>? Aquesta acció no es pot desfer.
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void remove()} className="h-9 flex-1 rounded-lg bg-red-500 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50">Sí, esborra</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 flex-1 rounded-lg bg-slate-100 text-sm font-medium text-slate-900 dark:bg-slate-700 dark:text-white">Cancel·la</button>
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy ? 'Desant…' : isDraft ? 'Desa la contrasenya' : 'Desa els canvis'}
            </button>
            {isDraft && (
              <button type="button" disabled={busy} onClick={onCancelDraft} className="flex h-10 items-center justify-center rounded-lg bg-slate-100 px-3 text-slate-700 dark:bg-slate-700 dark:text-slate-200" aria-label="Cancel·la fitxa nova">
                Cancel·la
              </button>
            )}
          </div>
        </div>
      )}
    </PasswordCardSurface>
  );
}

export default function SavedPasswordCards({
  records,
  seedWord,
  defaultOptions,
  draft,
  onSave,
  onUpdate,
  onDelete,
  onConvertToPartA,
  onCancelDraft,
  autoHide,
  collapseAllSignal = 0,
  expandAllSignal = 0,
  onExpandedChange,
  highlightId,
  expandId,
  expandSignal = 0,
}: SavedPasswordCardsProps) {
  const activeRecords = records
    .filter((record) => !record.deleted)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  if (activeRecords.length === 0 && !draft) return null;

  return (
    <section aria-label="Contrasenyes desades" className="space-y-4">
      {draft && (
        <SavedPasswordCard
          key={draft.id}
          seedWord={seedWord}
          defaultOptions={defaultOptions}
          initialPassword={draft.password}
          onSave={onSave}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onConvertToPartA={onConvertToPartA}
          onCancelDraft={onCancelDraft}
          autoHide={autoHide}
        />
      )}
      {activeRecords.map((record) => (
        <div
          key={record.id}
          data-message-id={record.id}
          className={`rounded-2xl transition-all ${highlightId === record.id ? 'ring-2 ring-amber-400/80 ring-offset-4 ring-offset-slate-50 dark:ring-offset-slate-950' : ''}`}
        >
          <SavedPasswordCard
            record={record}
            seedWord={seedWord}
            defaultOptions={defaultOptions}
            onSave={onSave}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onConvertToPartA={onConvertToPartA}
            autoHide={autoHide}
            collapseAllSignal={collapseAllSignal}
            expandAllSignal={expandAllSignal}
            onExpandedChange={onExpandedChange}
            expandSignal={expandId === record.id ? expandSignal : 0}
          />
        </div>
      ))}
    </section>
  );
}
