import { useState, useRef, useEffect } from 'react';
import { Copy, Check, Eye, EyeOff, RefreshCw, Trash2, MessageSquare, AlertTriangle, AlertCircle, KeyRound, ChevronDown, ChevronUp, Image } from 'lucide-react';
import { estimateStrength } from '@/lib/passwordGenerator';
import { MessageOptions } from '@/lib/storage';

const KNOWN_LOGO_DOMAINS: Record<string, string> = {
  whatsapp: 'whatsapp.com',
  netflix: 'netflix.com',
  google: 'google.com',
  caixabank: 'caixabank.es',
};

interface PasswordBubbleProps {
  messageId: string;
  baseWord: string;
  password: string;
  initiallyExpanded: boolean;
  autoHide: boolean;
  comment: string;
  logoUrl?: string;
  options: MessageOptions;
  collapseAllSignal: number;
  expandAllSignal: number;
  expandOneId: string | null;
  expandOneSignal: number;
  onExpandedChange: (id: string, expanded: boolean) => void;
  createdAt?: string;
  updatedAt?: string;
  onRegenerate: (options: MessageOptions) => void;
  onDelete: () => void;
  onSaveComment: (comment: string) => void;
  onSaveLogo: (logoUrl: string | undefined, file?: File) => Promise<void>;
  onHighlight?: () => void;
}

const LOGO_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

async function downloadLogoFile(url: string, domain: string): Promise<File> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('No s’ha pogut descarregar el logo. Logo.dev pot bloquejar la petició per CORS; no s’ha pujat cap fitxer. Caldria un proxy de servidor de confiança per descarregar-lo.');
  }
  if (!response.ok) {
    throw new Error(`Logo.dev ha respost amb l’estat ${response.status}; no s’ha pujat cap fitxer.`);
  }

  const mimeType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const extension = LOGO_MIME_EXTENSIONS[mimeType];
  if (!extension) {
    throw new Error(`Logo.dev ha retornat un tipus MIME no admès (${mimeType || 'absent'}); s’esperava una imatge PNG, JPEG, WebP, GIF o AVIF.`);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('Logo.dev ha retornat una imatge buida; no s’ha pujat cap fitxer.');
  }
  return new File([blob], `${domain.replace(/[^a-z0-9.-]/gi, '-')}.${extension}`, { type: mimeType });
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
  password,
  initiallyExpanded,
  autoHide,
  comment,
  logoUrl,
  options,
  collapseAllSignal,
  expandAllSignal,
  expandOneId,
  expandOneSignal,
  onExpandedChange,
  createdAt,
  updatedAt,
  onRegenerate,
  onDelete,
  onSaveComment,
  onSaveLogo,
  onHighlight,
}: PasswordBubbleProps) {
  const [visible, setVisible] = useState(initiallyExpanded || !autoHide);
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
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoResolvedDomain, setLogoResolvedDomain] = useState('');
  const [collapsed, setCollapsed] = useState(!initiallyExpanded);
  const [regenerationOptions, setRegenerationOptions] = useState<MessageOptions>(options);
  const confirmRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const canRegenerate = !optionsEqual(options, regenerationOptions);

  useEffect(() => {
    setCommentDraft(comment);
  }, [comment]);

  useEffect(() => {
    setRegenerationOptions(options);
  }, [options]);

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
  const strength = estimateStrength(password);
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];
  const strengthText = ['text-red-600 dark:text-red-400', 'text-orange-600 dark:text-orange-400', 'text-yellow-600 dark:text-yellow-400', 'text-emerald-600 dark:text-emerald-400'];
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = password;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function saveComment() {
    onSaveComment(commentDraft.trim());
    if (!commentDraft.trim()) setCommentOpen(false);
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
    onRegenerate(regenerationOptions);
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
    setLogoError('');
    setLogoPreviewUrl('');
    setLogoLoading(false);
    setLogoResolvedDomain('');

    if (!input) {
      setLogoError('Escriu el nom d’una marca coneguda o un domini.');
      return;
    }

    const normalizedBrand = input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const knownDomain = KNOWN_LOGO_DOMAINS[normalizedBrand];
    const manualDomain = input
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[/?#]/, 1)[0]
      .toLowerCase();
    const domain = knownDomain || (manualDomain.includes('.') ? manualDomain : '');

    if (!domain || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
      setLogoError('No tinc un domini conegut per a aquesta marca. Introdueix manualment el seu domini, per exemple marca.cat.');
      return;
    }

    const token = import.meta.env.VITE_LOGODEV_TOKEN;
    if (!token) {
      setLogoError('Falta VITE_LOGODEV_TOKEN a .env. Afegeix-hi el token públic de Logo.dev i reinicia Vite.');
      return;
    }

    const params = new URLSearchParams({ token, size: '128', format: 'png' });
    setLogoResolvedDomain(domain);
    setLogoPreviewUrl(`https://img.logo.dev/${encodeURIComponent(domain)}?${params.toString()}`);
    setLogoLoading(true);
  }

  async function saveLogo() {
    if (!logoPreviewUrl || !logoResolvedDomain) return;
    setLogoSaving(true);
    setLogoError('');
    try {
      const file = await downloadLogoFile(logoPreviewUrl, logoResolvedDomain);
      await onSaveLogo(logoPreviewUrl, file);
      setLogoPanelOpen(false);
      setLogoLoading(false);
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : 'No s’ha pogut desar el logotip.');
    } finally {
      setLogoSaving(false);
    }
  }

  async function removeLogo() {
    setLogoSaving(true);
    setLogoError('');
    try {
      await onSaveLogo(undefined);
      setLogoPreviewUrl('');
      setLogoPanelOpen(false);
      setLogoLoading(false);
      setLogoResolvedDomain('');
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : 'No s’ha pogut eliminar el logotip.');
    } finally {
      setLogoSaving(false);
    }
  }

  return (
    <div className="flex justify-start" onClickCapture={onHighlight}>
      <div className="w-full">
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-lg">
          <div
            className="flex items-center gap-2 p-4 cursor-pointer select-none"
            onClick={toggleExpanded}
          >
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0 overflow-hidden">
              {logoUrl ? <img src={logoUrl} alt={`Logotip de ${baseWord}`} className="w-full h-full object-contain" onError={() => setLogoError('El logo guardat no s’ha pogut carregar. Torna a provar amb un domini correcte.')} /> : <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            </div>
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
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Marca coneguda o domini manual</label>
              <div className="flex gap-2">
                <input value={logoQuery} onChange={(e) => { setLogoQuery(e.target.value); setLogoPreviewUrl(''); setLogoError(''); setLogoLoading(false); setLogoResolvedDomain(''); }} onKeyDown={(e) => { if (e.key === 'Enter') previewLogo(); }} placeholder="WhatsApp, Netflix o exemple.cat" className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
                <button type="button" onClick={previewLogo} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-medium text-white">Previsualitza</button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Es proven dominis coneguts per a algunes marques; no es fa una cerca general de marques a Logo.dev. Per a la resta, introdueix el domini oficial.</p>
              {logoResolvedDomain && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Provant el domini <span className="font-mono">{logoResolvedDomain}</span>.</p>}
              {logoLoading && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Carregant la previsualització…</p>}
              {logoError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{logoError}</p>}
              {logoPreviewUrl && <div className="mt-3 flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">{!logoError ? <img src={logoPreviewUrl} alt="Previsualització del logotip" className="w-full h-full object-contain" onLoad={() => setLogoLoading(false)} onError={() => { setLogoLoading(false); setLogoError(logoResolvedDomain ? `Logo.dev no ha pogut carregar una imatge per a ${logoResolvedDomain}. Comprova el domini, el token i la connexió.` : 'El logotip desat no s’ha pogut carregar. Torna a provar amb un domini correcte.'); }} /> : <span className="px-1 text-center text-[10px] leading-tight text-slate-500">No s’ha pogut carregar</span>}</div>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void saveLogo()} disabled={!logoPreviewUrl || !logoResolvedDomain || logoLoading || logoSaving || !!logoError} className="rounded-lg bg-emerald-600 disabled:opacity-40 px-3 py-2 text-sm font-medium text-white">{logoSaving ? 'Desant…' : 'Desa el logotip'}</button><button type="button" onClick={() => void removeLogo()} disabled={logoSaving} className="rounded-lg bg-slate-200 dark:bg-slate-700 disabled:opacity-40 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">Treu-lo</button></div>
              </div>}
            </div>
          )}

          <div className="font-mono text-[15px] leading-relaxed text-emerald-700 dark:text-emerald-300 break-all tracking-wide select-all border-t border-slate-200 dark:border-slate-700 pt-3" style={{ wordBreak: 'break-all', overflowWrap: 'break-word' }}>
            {visible ? password : '•'.repeat(Math.min(password.length, 24))}
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
                onBlur={() => { if (commentDraft.trim() !== comment) saveComment(); }}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveComment(); } }}
                placeholder="Escriu un comentari…"
                rows={2}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 break-words resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          <div className="mt-3 grid w-full min-w-0 grid-cols-3 gap-2 min-[430px]:grid-cols-6">
            <button onClick={copy} title={copied ? 'Copiada' : 'Copia'} aria-label={copied ? 'Copiada' : 'Copia'} className="box-border flex h-11 w-full min-w-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 active:bg-slate-300 dark:active:bg-slate-900 text-slate-900 dark:text-white transition-colors">
              {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
            <button onClick={() => setVisible((value) => !value)} title={visible ? 'Amaga' : 'Mostra'} className="box-border flex h-11 w-full min-w-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 active:bg-slate-300 dark:active:bg-slate-900 text-slate-900 dark:text-white transition-colors" aria-label={visible ? 'Amaga' : 'Mostra'}>
              {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={handleCommentButtonClick} title="Comentari" className={`box-border flex h-11 w-full min-w-0 items-center justify-center rounded-lg transition-colors ${comment || commentOpen ? 'bg-emerald-600 text-emerald-50 dark:bg-emerald-700 dark:text-emerald-100' : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white'}`} aria-label="Comentari">
              <MessageSquare className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setLogoPanelOpen((open) => !open); setLogoQuery(baseWord); setLogoPreviewUrl(logoUrl || ''); setLogoError(''); setLogoLoading(!!logoUrl); setLogoResolvedDomain(''); }}
              className={`box-border flex h-11 w-full min-w-0 items-center justify-center rounded-lg transition-colors ${logoPanelOpen || logoUrl ? 'bg-emerald-600 text-white dark:bg-emerald-700' : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white'}`}
              aria-label="Logotip"
              title="Cerca o canvia el logotip"
            >
              <Image className="w-4 h-4" />
            </button>
            <button
              onClick={handleRegenerateClick}
              disabled={!canRegenerate}
              className="box-border flex h-11 w-full min-w-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 active:bg-slate-300 dark:active:bg-slate-900 text-slate-900 dark:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Torna a generar"
              title={!canRegenerate ? 'La configuració actual coincideix amb la de la contrasenya' : undefined}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => setDeleteOpen(true)} title="Esborra" className="box-border flex h-11 w-full min-w-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/70 hover:bg-red-200 dark:hover:bg-red-900 active:bg-red-300 dark:active:bg-red-950 text-red-600 dark:text-red-300 transition-colors" aria-label="Esborra">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

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
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
