import { useEffect, useState } from 'react';
import { decryptSavedPasswordDetails, decryptSavedPasswordField } from '@/lib/savedPasswordCrypto';
import type { MessageSyncChange } from '@/lib/cloudSync';
import type { ChatMessage } from '@/lib/storage';
import type { SavedPasswordChoice, SavedPasswordSyncChange } from '@/lib/savedPasswords';
import type { SavedPasswordRecord } from '@/lib/storage';

interface SyncReviewModalProps {
  changes: SavedPasswordSyncChange[];
  messageChanges: MessageSyncChange[];
  seedWord: string;
  busy: boolean;
  onApply: (choices: Record<string, SavedPasswordChoice>) => void;
  onLater: () => void;
}

interface Summary {
  name: string;
  deleted: boolean;
  fields: Partial<Record<keyof typeof FIELD_LABELS, string>>;
}

interface Row {
  key: string;
  part: 'A' | 'B';
  kind: SavedPasswordSyncChange['kind'];
  defaultChoice: SavedPasswordChoice;
  fallbackTitle: string;
  hasLocal: boolean;
  hasCloud: boolean;
  cloudDeleted: boolean;
  local?: Summary | null;
  cloud?: Summary | null;
}

const KIND_TEXT: Record<SavedPasswordSyncChange['kind'], string> = {
  create: 'Fitxa nova que encara no és al núvol',
  push: 'Has canviat aquesta fitxa en aquest dispositiu',
  pull: 'Aquesta fitxa ha canviat al núvol (des d’un altre dispositiu)',
  conflict: 'La fitxa ha canviat als dos llocs',
  'missing-cloud': 'Aquesta fitxa ja no existeix al núvol',
};

const PART_LABEL = { A: 'Automàtica', B: 'Manual' } as const;

const SHORT_KIND: Record<SavedPasswordSyncChange['kind'], string> = {
  create: 'nova',
  push: 'canviada aquí',
  pull: 'canviada al núvol',
  conflict: 'conflicte',
  'missing-cloud': 'no és al núvol',
};

const FIELD_LABELS = {
  name: 'nom',
  notes: 'notes',
  icon: 'icona',
  logoUrl: 'logotip',
  password: 'contrasenya',
  baseWord: 'paraula base',
  comment: 'comentari',
  options: 'opcions de generació',
};

function summarizeMessage(message: ChatMessage): Summary {
  const { length, uppercase, lowercase, numbers, symbols, allowedSymbols } = message.options;
  return {
    name: message.baseWord,
    deleted: false,
    fields: {
      baseWord: message.baseWord,
      comment: message.comment,
      options: JSON.stringify([length, uppercase, lowercase, numbers, symbols, allowedSymbols || '']),
    },
  };
}

async function summarize(record: SavedPasswordRecord, seedWord: string): Promise<Summary | null> {
  try {
    const [details, password] = await Promise.all([
      decryptSavedPasswordDetails(record.encryptedName, seedWord),
      decryptSavedPasswordField(record.encryptedPassword, seedWord, 'password'),
    ]);
    return {
      name: details.name,
      deleted: record.deleted,
      fields: { name: details.name, notes: details.notes, icon: details.icon, logoUrl: details.logoUrl ?? '', password },
    };
  } catch {
    return null;
  }
}

function differingFields(local: Summary | null, cloud: Summary | null): string[] {
  if (!local || !cloud) return [];
  return (Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>)
    .filter((key) => local.fields[key] !== cloud.fields[key])
    .map((key) => FIELD_LABELS[key]);
}

function choiceLabels(kind: SavedPasswordSyncChange['kind']): { local: string; cloud: string } {
  if (kind === 'create') return { local: 'Puja-la al núvol', cloud: 'Descarta la còpia d’aquest dispositiu' };
  if (kind === 'missing-cloud') return { local: 'Torna-la a crear al núvol', cloud: 'Elimina-la d’aquest dispositiu' };
  return { local: 'Mantén la d’aquest dispositiu (substitueix la del núvol)', cloud: 'Mantén la del núvol (substitueix la d’aquest dispositiu)' };
}

function StateLine({ label, summary }: { label: string; summary: Summary | null | undefined }) {
  if (summary === undefined) return null;
  return (
    <p className="text-sm text-slate-600 dark:text-slate-300">
      <span className="font-medium">{label}:</span>{' '}
      {summary ? <>{summary.name}{summary.deleted && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">esborrada</span>}</> : 'no s’ha pogut desxifrar'}
    </p>
  );
}

export default function SyncReviewModal({ changes, messageChanges, seedWord, busy, onApply, onLater }: SyncReviewModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [choices, setChoices] = useState<Record<string, SavedPasswordChoice>>({});

  useEffect(() => {
    let active = true;
    const messageRows: Row[] = messageChanges.map((change) => {
      const cloudSummary = change.cloud ? summarizeMessage(change.cloud) : undefined;
      if (cloudSummary) cloudSummary.deleted = change.cloudDeleted;
      return {
        key: `A:${change.id}`,
        part: 'A',
        kind: change.kind,
        defaultChoice: change.defaultChoice,
        fallbackTitle: 'Fitxa automàtica',
        hasLocal: !!change.local,
        hasCloud: !!change.cloud,
        cloudDeleted: change.cloudDeleted,
        local: change.local ? summarizeMessage(change.local) : undefined,
        cloud: cloudSummary,
      };
    });
    Promise.all(changes.map(async (change): Promise<Row> => ({
      key: `B:${change.id}`,
      part: 'B',
      kind: change.kind,
      defaultChoice: change.defaultChoice,
      fallbackTitle: 'Fitxa manual',
      hasLocal: !!change.local,
      hasCloud: !!change.cloud,
      cloudDeleted: !!change.cloud?.deleted,
      local: change.local ? await summarize(change.local, seedWord) : undefined,
      cloud: change.cloud ? await summarize(change.cloud, seedWord) : undefined,
    }))).then((bRows) => {
      if (!active) return;
      const all = [...messageRows, ...bRows];
      setRows(all);
      setChoices((current) => Object.fromEntries(all.map((row) => [row.key, current[row.key] ?? row.defaultChoice])));
    });
    return () => { active = false; };
  }, [changes, messageChanges, seedWord]);

  const pendingDecisions = rows.filter((row) => (choices[row.key] ?? 'skip') !== 'skip').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3" role="dialog" aria-modal="true" aria-labelledby="sync-review-title">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 id="sync-review-title" className="text-base font-semibold text-slate-900 dark:text-white">Revisa la sincronització</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Hi ha {rows.length} {rows.length === 1 ? 'fitxa' : 'fitxes'} (automàtiques i manuals) que no coincideixen entre aquest dispositiu i el núvol. No es farà cap canvi fins que cliquis «Aplica».
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {rows.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60" aria-label="Fitxes que no coincideixen">
              {rows.map((row) => (
                <li key={`summary-${row.key}`} className="flex items-baseline gap-2 text-slate-800 dark:text-slate-100">
                  <span className="shrink-0 rounded bg-slate-200 px-1.5 text-xs font-semibold dark:bg-slate-700">{PART_LABEL[row.part]}</span>
                  <span className="min-w-0 break-words font-medium">{row.local?.name ?? row.cloud?.name ?? row.fallbackTitle}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-500 dark:text-slate-400">{SHORT_KIND[row.kind]}</span>
                </li>
              ))}
            </ul>
          )}
          {rows.map((row) => {
            const labels = choiceLabels(row.kind);
            const diffs = differingFields(row.local ?? null, row.cloud ?? null);
            const title = row.local?.name ?? row.cloud?.name ?? row.fallbackTitle;
            const choice = choices[row.key] ?? row.defaultChoice;
            return (
              <fieldset key={row.key} disabled={busy} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <legend className="px-1 text-sm font-semibold text-slate-900 dark:text-white">{title} <span className="rounded bg-slate-100 px-1.5 text-xs font-normal dark:bg-slate-800">{PART_LABEL[row.part]}</span></legend>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{KIND_TEXT[row.kind]}</p>
                <div className="mt-2 space-y-0.5">
                  <StateLine label="Aquest dispositiu" summary={row.hasLocal ? row.local : undefined} />
                  <StateLine label="Núvol" summary={row.hasCloud ? row.cloud : undefined} />
                  {diffs.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Difereix en: {diffs.join(', ')}.</p>
                  )}
                </div>
                <div className="mt-3 space-y-1.5">
                  {([['local', labels.local], ['cloud', labels.cloud], ['skip', 'Decideix més tard']] as const).map(([value, label]) => (
                    <label key={value} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input
                        type="radio"
                        name={`choice-${row.key}`}
                        checked={choice === value}
                        onChange={() => setChoices((current) => ({ ...current, [row.key]: value }))}
                        className="mt-1"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        <div className="flex gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button
            type="button"
            disabled={busy}
            onClick={onLater}
            className="h-10 flex-1 rounded-lg bg-slate-100 text-sm font-medium text-slate-800 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100"
          >
            Més tard
          </button>
          <button
            type="button"
            disabled={busy || pendingDecisions === 0}
            onClick={() => onApply(choices)}
            className="h-10 flex-1 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Aplicant…' : `Aplica (${pendingDecisions})`}
          </button>
        </div>
      </div>
    </div>
  );
}
