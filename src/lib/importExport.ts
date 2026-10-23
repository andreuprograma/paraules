import { ChatMessage, MessageOptions, DEFAULT_SETTINGS } from './storage';

export const EXPORT_HEADERS = [
  'Paraula base',
  'Caràcters',
  'Majúscules',
  'Minúscules',
  'Números',
  'Símbols',
  'Símbols permesos',
  'Comentaris',
] as const;

const TRUE_VALUES = new Set(['sí', 'si', 'true', '1', 'x', 'yes', 'y', 'verdader', 'cert']);
const FALSE_VALUES = new Set(['no', 'false', '0', '', 'fals']);

function parseBoolean(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return v !== '' && !FALSE_VALUES.has(v);
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const first = cells[0].trim().toLowerCase();
  return first === 'paraula base' || first === 'paraula' || first === 'base';
}

function clampLength(n: number): number {
  if (Number.isNaN(n) || n < 2) return 2;
  if (n > 100) return 100;
  return n;
}

function boolToText(v: boolean): string {
  return v ? 'sí' : 'no';
}

function escapeField(value: string): string {
  if (value.includes('\n') || value.includes('\r') || value.includes('\t') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function unescapeField(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    const inner = trimmed.slice(1, -1);
    return inner.replace(/""/g, '"');
  }
  return trimmed;
}

function joinRow(fields: string[]): string {
  return fields.map(escapeField).join('\t');
}

function parseRows(raw: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === '\t') {
      current.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n') {
      current.push(field);
      rows.push(current);
      current = [];
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (raw[i + 1] === '\n') i += 1;
      current.push(field);
      rows.push(current);
      current = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (field !== '' || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}

export interface ParsedRow {
  baseWord: string;
  options: MessageOptions;
  comment: string;
}

export function parseImportData(raw: string): ParsedRow[] {
  const rows = parseRows(raw).filter((cells) => cells.some((c) => c.trim() !== ''));
  if (rows.length === 0) return [];

  let startIndex = 0;
  if (isHeaderRow(rows[0])) startIndex = 1;

  const result: ParsedRow[] = [];
  for (let i = startIndex; i < rows.length; i++) {
    const cells = rows[i];
    const baseWord = cells[0]?.trim();
    if (!baseWord) continue;

    const length = clampLength(parseInt(cells[1] ?? '', 10) || DEFAULT_SETTINGS.length);
    const uppercase = cells[2] !== undefined ? parseBoolean(cells[2]) : true;
    const lowercase = cells[3] !== undefined ? parseBoolean(cells[3]) : true;
    const numbers = cells[4] !== undefined ? parseBoolean(cells[4]) : true;
    const symbols = cells[5] !== undefined ? parseBoolean(cells[5]) : true;
    const allowedSymbols = cells[6] !== undefined ? unescapeField(cells[6]) : '';
    const comment = cells[7] !== undefined ? unescapeField(cells[7]) : '';

    result.push({
      baseWord,
      options: { length, uppercase, lowercase, numbers, symbols, allowedSymbols },
      comment,
    });
  }

  return result;
}

export function messagesToExportText(messages: ChatMessage[]): string {
  const header = joinRow([...EXPORT_HEADERS]);
  const lines = messages.map((msg) => {
    const o = msg.options;
    return joinRow([
      msg.baseWord,
      String(o.length),
      boolToText(o.uppercase),
      boolToText(o.lowercase),
      boolToText(o.numbers),
      boolToText(o.symbols),
      o.allowedSymbols,
      msg.comment,
    ]);
  });
  return [header, ...lines].join('\n');
}

export function downloadExportFile(messages: ChatMessage[]): void {
  const content = messagesToExportText(messages);
  const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `caixa-contrasenyes-${date}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
