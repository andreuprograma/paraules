import { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, Check, Eye, EyeOff, RefreshCw, Trash2, MessageSquare, AlertTriangle, AlertCircle, ChevronDown, ChevronUp, Image } from 'lucide-react';
import { estimateStrength, generatePassword } from '@/lib/passwordGenerator';
import { resolveLogoInput } from '@/lib/logo';
import { MessageOptions } from '@/lib/storage';
import { PasswordCardActions, PasswordCardIcon, PasswordCardSurface } from './PasswordCardVisuals';

export interface PasswordBubbleChanges {
  comment: string;
  options?: MessageOptions;
  logoChange?: {
    logoUrl?: string;
    file?: File;
    previewUrl?: string;
  };
}

interface PasswordBubbleProps {
  messageId: string;
  baseWord: string;
  seedWord: string;
  password?: string;
  initiallyExpanded: boolean;
  autoHide: boolean;
  comment: string;
  logoUrl?: string;
  icon?: string;
  options: MessageOptions;
  collapseAllSignal: number;
  expandAllSignal: number;
  expandOneId: string | null;
  expandOneSignal: number;
  onExpandedChange: (id: string, expanded: boolean) => void;
  createdAt?: string;
  updatedAt?: string;
  onSaveChanges: (changes: PasswordBubbleChanges) => Promise<void>;
  onDelete: () => void;
  onHighlight?: () => void;
}

function optionsEqual(a: MessageOptions, b: MessageOptions): boolean {
  return (
    a.length === b.length &&
    a.uppercase === b.uppercase &&
    a.lowercase === b.lowercase &&
    a.numbers === b.numbers &&
    a.symbols === b.symbols &&
    (a.allowedSymbols || '') === (b.allowedSymbols || '')
  );
}

export default function PasswordBubble({
  messageId,
  baseWord,
  seedWord,
  password,
  initiallyExpanded,
  autoHide,
  comment,
  logoUrl,
  icon,
  options,
  collapseAllSignal,
  expandAllSignal,
  expandOneId,
  expandOneSignal,
  onExpandedChange,
  createdAt,
  updatedAt,
  onSaveChanges,
  onDelete,
  onHighlight,
}: PasswordBubbleProps) {
  const [visible, setVisible] = useState(initiallyExpanded || !autoHide);
  const [transientPassword, setTransientPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(comment);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [symbolsPanelOpen, setSymbolsPanelOpen] = useState(false);
  const [logoPanelOpen, setLogoPanelOpen] = useState(false);
  const [logoQuery, setLogoQuery] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [logoError, setLogoError] = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoResolvedDomain, setLogoResolvedDomain] = useState('');
  const [logoFile, setLogoFile] = useState<File | undefined>();
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(!initiallyExpanded);
  const [regenerationOptions, setRegenerationOptions] = useState<MessageOptions>(options);
  const [pendingRegenerationOptions, setPendingRegenerationOptions] = useState<MessageOptions | null>(null);
  const [pendingLogoChange, setPendingLogoChange] = useState<PasswordBubbleChanges['logoChange'] | null>(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [saveError, setSaveError] = useState('');
  const confirmRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const logoObjectUrlRef = useRef<string | null>(null);
  const canRegenerate = !optionsEqual(options, regenerationOptions);

  useEffect(() => {
    setCommentDraft(comment);
  }, [comment]);

  useEffect(() => {
    setRegenerationOptions(options);
  }, [options]);

  useEffect(() => () => {
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
  }, []);

  const setLogoPreview = useCallback((url: string, file?: File) => {
    if (logoObjectUrlRef.current && logoObjectUrlRef.current !== url) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
    if (url.startsWith('blob:')) logoObjectUrlRef.current = url;
    setLogoPreviewUrl(url);
    setLogoFile(file);
    setLogoError('');
    setLogoLoading(!!url);
    setLogoResolvedDomain('');
  }, []);

  useEffect(() => {
    if (!/^https?:\/\//i.test(logoQuery.trim())) return;
    const timeout = window.setTimeout(() => {
      try {
        const resolved = resolveLogoInput(logoQuery, import.meta.env.VITE_LOGODEV_TOKEN || '');
        setLogoPreview(resolved.url);
        setLogoResolvedDomain(resolved.domain || '');
      } catch (error) {
        setLogoPreview('');
        setLogoError(error instanceof Error ? error.message : 'No s’ha pogut validar la imatge.');
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [logoQuery, setLogoPreview]);

  useEffect(() => {
    if ((confirmOpen || deleteOpen) && confirmRef.current) {
      confirmRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [confirmOpen, deleteOpen]);

  useEffect(() => {
    if (collapseAllSignal > 0) setCollapsed(true);
  }, [collapseAllSignal]);

  useEffect(() => {
    if (expandAllSignal > 0) {
      setCollapsed(false);
      setVisible(true);
    }
  }, [expandAllSignal]);

  useEffect(() => {
    if (expandOneSignal > 0 && expandOneId === messageId) {
      setCollapsed(false);
      setVisible(true);
    }
  }, [expandOneSignal, expandOneId, messageId]);
  useEffect(() => {
    if (visible && !password && !transientPassword) {
      setTransientPassword(generatePassword(seedWord, baseWord, options));
    }
  }, [visible, password, transientPassword, seedWord, baseWord, options]);
  const displayedPassword = transientPassword || password || '';
  const displayedLogoUrl = pendingLogoChange
    ? pendingLogoChange.file ? pendingLogoChange.previewUrl : pendingLogoChange.logoUrl
    : logoUrl;
  const hasUnsavedChanges = commentDraft.trim() !== comment || !!pendingRegenerationOptions || !!pendingLogoChange;
  const strength = estimateStrength(displayedPassword);
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];
  const strengthText = ['text-red-600 dark:text-red-400', 'text-orange-600 dark:text-orange-400', 'text-yellow-600 dark:text-yellow-400', 'text-emerald-600 dark:text-emerald-400'];
  async function copy() {
    const value = transientPassword || password || generatePassword(seedWord, baseWord, options);
    if (!transientPassword && !password) setTransientPassword(value);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleCommentButtonClick() {
    if (comment) {
      commentRef.current?.focus();
    } else {
      setCommentOpen((open) => !open);
    }
  }

  function handleRegenerateClick() {
    if (!canRegenerate) return;
    setConfirmOpen(true);
  }

  function confirmRegenerate() {
    setConfirmOpen(false);
    setTransientPassword(generatePassword(seedWord, baseWord, regenerationOptions));
    setPendingRegenerationOptions(regenerationOptions);
    setVisible(true);
  }

  async function saveChanges(): Promise<void> {
    const changes: PasswordBubbleChanges = { comment: commentDraft.trim() };
    if (pendingRegenerationOptions) changes.options = pendingRegenerationOptions;
    if (pendingLogoChange) {
      changes.logoChange = {
        ...(pendingLogoChange.logoUrl ? { logoUrl: pendingLogoChange.logoUrl } : {}),
        ...(pendingLogoChange.file ? { file: pendingLogoChange.file } : {}),
      };
    }
    setSavingChanges(true);
    setSaveError('');
    try {
      await onSaveChanges(changes);
      if (pendingRegenerationOptions) setPendingRegenerationOptions(null);
      if (pendingLogoChange) {
        setPendingLogoChange(null);
        if (pendingLogoChange.file) setLogoPreview('');
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No s’han pogut desar els canvis.');
    } finally {
      setSavingChanges(false);
    }
  }

  function updateRegenerationOption<K extends keyof MessageOptions>(
    key: K,
    value: MessageOptions[K],
  ) {
    setRegenerationOptions((current) => ({ ...current, [key]: value }));
  }

  function toggleExpanded() {
    const expanding = collapsed;
    setCollapsed(!collapsed);
    if (expanding) {
      setVisible(true);
      onHighlight?.();
    } else if (autoHide) {
      setVisible(false);
    }
    onExpandedChange(messageId, expanding);
  }

  function confirmDelete() {
    setDeleteOpen(false);
    onDelete();
  }

  function formatDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
  }

  const createdLabel = formatDate(createdAt);
  const updatedLabel = formatDate(updatedAt);
  const datesMatch = createdLabel && updatedLabel && createdLabel === updatedLabel;

  function previewLogo() {
    const input = logoQuery.trim();
    try {
      const resolved = resolveLogoInput(input, import.meta.env.VITE_LOGODEV_TOKEN || '');
      setLogoPreview(resolved.url);
      setLogoResolvedDomain(resolved.domain || '');
    } catch (error) {
      setLogoPreview('');
      setLogoError(error instanceof Error ? error.message : 'No s’ha pogut validar la imatge.');
      return;
    }
  }

  function handleLogoFileChange(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size === 0) {
      setLogoPreview('');
      setLogoError('Selecciona un fitxer d’imatge vàlid i no buit.');
      return;
    }
    setLogoQuery('');
    const previewUrl = URL.createObjectURL(file);
    setLogoPreview(previewUrl, file);
  }

  function saveLogo() {
    const selectedFile = logoFile ?? (pendingLogoChange?.previewUrl === logoPreviewUrl ? pendingLogoChange.file : undefined);
    if (!logoPreviewUrl || (!selectedFile && !logoQuery.trim())) return;
    setPendingLogoChange(selectedFile ? { file: selectedFile, previewUrl: logoPreviewUrl } : { logoUrl: logoPreviewUrl });
    setLogoPanelOpen(false);
  }

  function removeLogo() {
    setPendingLogoChange({});
    setLogoPreview('');
    setLogoPanelOpen(false);
  }

  return (
    <div className="flex justify-start" onClickCapture={onHighlight}>
      <div className="w-full">
        <PasswordCardSurface>
          <div
            className="flex items-center gap-2 p-4 cursor-pointer select-none"
            onClick={toggleExpanded}
          >
            <PasswordCardIcon
              logoUrl={displayedLogoUrl}
              icon={icon}
              alt={`Logotip de ${baseWord}`}
              onError={() => setLogoError('El logo guardat no s’ha pogut carregar. Torna a provar amb un domini correcte.')}
            />
            <div className="flex-1 min-w-0 text-[15px] font-semibold text-slate-900 dark:text-white truncate">{baseWord}</div>
            <button
              onClick={(event) => { event.stopPropagation(); toggleExpanded(); }}
              className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors shrink-0"
              aria-label={collapsed ? 'Desplega' : 'Replega'}
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
          {!collapsed && (
          <div className="px-4 pb-4">
          {logoPanelOpen && (
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3" onClick={(e) => e.stopPropagation()}>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">URL d’imatge, marca coneguda o domini</label>
              <div className="flex gap-2">
                <input value={logoQuery} onChange={(e) => { setLogoQuery(e.target.value); setLogoPreview(''); }} onKeyDown={(e) => { if (e.key === 'Enter') previewLogo(); }} placeholder="https://exemple.cat/logo.png" className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
                <button type="button" onClick={previewLogo} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-medium text-white">Previsualitza</button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => logoFileInputRef.current?.click()} className="rounded-lg bg-slate-200 dark:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200">Tria un fitxer</button>
                <input ref={logoFileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { handleLogoFileChange(event.target.files?.[0]); event.target.value = ''; }} />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">També pots enganxar una URL HTTP o HTTPS.</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Es proven dominis coneguts per a algunes marques; no es fa una cerca general de marques a Logo.dev.</p>
              {logoResolvedDomain && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Provant el domini <span className="font-mono">{logoResolvedDomain}</span>.</p>}
              {logoLoading && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Carregant la previsualització…</p>}
              {logoError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{logoError}</p>}
              {logoPreviewUrl && <div className="mt-3 flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">{!logoError ? <img key={logoPreviewUrl} src={logoPreviewUrl} alt="Previsualització del logotip" className="w-full h-full object-contain" onLoad={() => setLogoLoading(false)} onError={() => { setLogoLoading(false); setLogoError(logoResolvedDomain ? `No s’ha pogut carregar el logo per al domini ${logoResolvedDomain}. Comprova el token i la connexió.` : 'No s’ha pogut carregar la imatge. Comprova que la URL sigui accessible i apunti a una imatge, o tria un altre fitxer.'); }} /> : <span className="px-1 text-center text-[10px] leading-tight text-slate-500">No s’ha pogut carregar</span>}</div>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={saveLogo} disabled={!logoPreviewUrl || (!logoFile && !logoQuery.trim()) || logoLoading || !!logoError} className="rounded-lg bg-emerald-600 disabled:opacity-40 px-3 py-2 text-sm font-medium text-white">Aplica el logotip</button><button type="button" onClick={removeLogo} className="rounded-lg bg-slate-200 dark:bg-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">Treu-lo</button></div>
              </div>}
            </div>
          )}

          <div className="font-mono text-[15px] leading-relaxed text-emerald-700 dark:text-emerald-300 break-all tracking-wide select-all border-t border-slate-200 dark:border-slate-700 pt-3" style={{ wordBreak: 'break-all', overflowWrap: 'break-word' }}>
            {visible ? displayedPassword : '•'.repeat(Math.min(displayedPassword.length || options.length, 24))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${strengthColors[strength.score - 1]}`} style={{ width: `${(strength.score / 4) * 100}%` }} />
            </div>
            <span className={`text-[11px] font-medium ${strengthText[strength.score - 1]}`}>{strength.label}</span>
          </div>

          {createdLabel && (
            <div className="mt-3 flex justify-end">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-tight" title={datesMatch ? `Creada: ${createdLabel}` : `Creada: ${createdLabel}\nModificada: ${updatedLabel}`}>
                {datesMatch ? createdLabel : <>C {createdLabel} · M {updatedLabel}</>}
              </span>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Paràmetres per regenerar</span>
            </div>
            <div className="mt-2 flex w-full min-w-0 items-center gap-1">
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => updateRegenerationOption('length', Math.max(2, regenerationOptions.length - 1))}
                  disabled={regenerationOptions.length <= 2}
                  aria-label="Redueix la llargada per regenerar"
                  className="box-border h-9 w-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono text-xs font-semibold text-slate-900 dark:text-white" aria-live="polite">
                  {regenerationOptions.length}
                </span>
                <button
                  type="button"
                  onClick={() => updateRegenerationOption('length', Math.min(100, regenerationOptions.length + 1))}
                  disabled={regenerationOptions.length >= 100}
                  aria-label="Augmenta la llargada per regenerar"
                  className="box-border h-9 w-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
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
                    onClick={() => updateRegenerationOption(key, !regenerationOptions[key])}
                    className={`box-border h-9 min-w-0 flex-1 px-0.5 rounded-lg text-[10px] min-[390px]:text-xs font-semibold whitespace-nowrap transition-colors ${regenerationOptions[key] ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700'}`}
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
                className="box-border h-9 w-8 shrink-0 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center"
              >
                {symbolsPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            {symbolsPanelOpen && (
              <input
                type="text"
                value={regenerationOptions.allowedSymbols}
                onChange={(event) => updateRegenerationOption('allowedSymbols', event.target.value)}
                placeholder="Símbols permesos (buit = predeterminats)"
                aria-label="Símbols permesos per regenerar"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="mt-2 box-border h-9 w-full min-w-0 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </div>

          {(comment || commentOpen) && (
            <div className="mt-2">
              <textarea
                ref={commentRef}
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Escriu un comentari…"
                rows={2}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 break-words resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          <PasswordCardActions actions={[
            { key: 'copy', label: copied ? 'Copiada' : 'Copia', title: copied ? 'Copiada' : 'Copia', icon: copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />, onClick: () => void copy() },
            { key: 'visibility', label: visible ? 'Amaga' : 'Mostra', title: visible ? 'Amaga' : 'Mostra', icon: visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />, onClick: () => setVisible((value) => !value) },
            { key: 'comment', label: 'Comentari', title: 'Comentari', icon: <MessageSquare className="h-4 w-4" />, active: !!comment || commentOpen, onClick: handleCommentButtonClick },
            {
              key: 'logo',
              label: 'Logotip',
              title: 'Cerca o canvia el logotip',
              icon: <Image className="h-4 w-4" />,
              active: logoPanelOpen || !!displayedLogoUrl,
              onClick: () => {
                setLogoPanelOpen((open) => !open);
                setLogoQuery('');
                setLogoPreview(pendingLogoChange
                  ? pendingLogoChange.previewUrl ?? pendingLogoChange.logoUrl ?? ''
                  : logoUrl ?? '');
                setLogoError('');
              },
            },
            { key: 'regenerate', label: 'Torna a generar', title: !canRegenerate ? 'La configuració actual coincideix amb la de la contrasenya' : undefined, icon: <RefreshCw className="h-4 w-4" />, disabled: !canRegenerate, onClick: handleRegenerateClick },
            { key: 'delete', label: 'Esborra', title: 'Esborra', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteOpen(true) },
          ]} />

          {deleteOpen && (
            <div ref={confirmRef} className="mt-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 p-3">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-200 leading-relaxed">
                  Segur que vols esborrar la contrasenya de <span className="font-semibold">{baseWord}</span>? Aquesta acció no es pot desfer.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={confirmDelete} className="flex-1 h-9 rounded-lg bg-red-500 hover:bg-red-400 text-white text-sm font-semibold transition-colors">
                  Sí, esborra
                </button>
                <button onClick={() => setDeleteOpen(false)} className="flex-1 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm font-medium transition-colors">
                  Cancel·la
                </button>
              </div>
            </div>
          )}

          {confirmOpen && (
            <div ref={confirmRef} className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 p-3">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                  La contrasenya actual se substituirà per una de nova amb aquests paràmetres. Recorda que l’aplicació no actualitza el servei extern: hauràs d’actualitzar-hi la contrasenya manualment.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={confirmRegenerate} className="flex-1 h-9 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold transition-colors">
                  Sí, regenera
                </button>
                <button onClick={() => setConfirmOpen(false)} className="flex-1 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm font-medium transition-colors">
                  Cancel·la
                </button>
              </div>
            </div>
          )}
          {saveError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{saveError}</p>}
          <button
            type="button"
            disabled={!hasUnsavedChanges || savingChanges}
            onClick={() => void saveChanges()}
            className="mt-3 flex h-10 w-full items-center justify-center rounded-lg bg-emerald-600 px-3 font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingChanges ? 'Desant…' : 'Desa els canvis'}
          </button>
          </div>
          )}
          </PasswordCardSurface>
        </div>
      </div>
  );
}
