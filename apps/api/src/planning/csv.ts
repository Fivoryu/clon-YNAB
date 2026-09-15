import { createHash } from 'node:crypto';
import { normalizeMetadata, parseTransactionDate, foldEffectiveHistory } from './transaction-history.ts';

export const CSV_HEADER = 'date,type,account,amountMinor,category,payee,memo';
export const CSV_MAX_BYTES = 10_485_760;
export const CSV_MAX_ROWS = 5_000;
export const CSV_MAX_DIAGNOSTICS = 1_000;

export type CsvKind = 'INCOME' | 'SPENDING' | 'TRANSFER';
export type CsvDiagnostic = { row: number; field: string; code: string; message: string };
export type CsvTransactionRow = {
  date: string;
  type: CsvKind;
  account: string;
  amountMinor: number;
  category: string;
  payee: string | null;
  memo: string | null;
};
export type CsvParseResult = {
  rows: number;
  accepted: number;
  rejected: number;
  diagnostics: CsvDiagnostic[];
  diagnosticsTruncated: boolean;
  values: CsvTransactionRow[];
};

type ExportEvent = {
  id: string;
  transactionId?: string;
  kind: string;
  amountMinor: number;
  businessDate?: string;
  month?: string;
  accountId?: string;
  categoryId?: string;
  payee?: string | null;
  memo?: string | null;
  supersedesEventId?: string;
};
type ExportTransfer = {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;
  businessDate: string;
  payee?: string | null;
  memo?: string | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fieldNames = ['date', 'type', 'account', 'amountMinor', 'category', 'payee', 'memo'] as const;

const diagnostic = (row: number, field: string, code: string, message: string): CsvDiagnostic => ({ row, field, code, message });

const decode = (bytes: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw diagnostic(0, 'file', 'INVALID_ENCODING', 'CSV must be valid UTF-8');
  }
};

type ParsedRecord = { fields: string[] };
const parseRecords = (text: string): ParsedRecord[] => {
  if (!text.endsWith('\r\n')) throw diagnostic(0, 'file', 'INVALID_CSV', 'CSV must end every record with CRLF');
  const records: ParsedRecord[] = [];
  let fields: string[] = [];
  let value = '';
  let inQuotes = false;
  let afterQuote = false;
  let atFieldStart = true;

  const endField = () => {
    fields.push(value);
    value = '';
    afterQuote = false;
    atFieldStart = true;
  };
  const endRecord = () => {
    endField();
    if (fields.length === 1 && fields[0] === '') fields = ['', '', '', '', '', '', ''];
    records.push({ fields });
    fields = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (afterQuote) {
      if (char === ',') {
        endField();
        continue;
      }
      if (char === '\r' && text[i + 1] === '\n') {
        endRecord();
        i += 1;
        continue;
      }
      throw diagnostic(records.length + 1, 'file', 'INVALID_CSV', 'Unexpected character after quoted field');
    }

    if (char === '"') {
      if (!atFieldStart || value.length > 0) throw diagnostic(records.length + 1, 'file', 'INVALID_CSV', 'Quote is only valid at the start of a field');
      inQuotes = true;
      atFieldStart = false;
      continue;
    }
    if (char === ',') {
      endField();
      continue;
    }
    if (char === '\r') {
      if (text[i + 1] !== '\n') throw diagnostic(records.length + 1, 'file', 'INVALID_CSV', 'Bare carriage return is not allowed');
      endRecord();
      i += 1;
      continue;
    }
    if (char === '\n') throw diagnostic(records.length + 1, 'file', 'INVALID_CSV', 'Bare line feed is not allowed');
    value += char;
    atFieldStart = false;
  }
  if (inQuotes) throw diagnostic(records.length + 1, 'file', 'INVALID_CSV', 'Quoted field is not terminated');
  if (fields.length || value.length || afterQuote) throw diagnostic(records.length + 1, 'file', 'INVALID_CSV', 'CSV must end with CRLF');
  return records;
};

const validateRow = (fields: string[], rowNumber: number): { value?: CsvTransactionRow; error?: CsvDiagnostic } => {
  if (fields.length !== 7) return { error: diagnostic(rowNumber, 'file', 'INVALID_COLUMN_COUNT', 'Each CSV row must contain exactly seven fields') };
  const [date, type, account, rawAmount, category, payee, memo] = fields;
  try { parseTransactionDate(date); } catch { return { error: diagnostic(rowNumber, 'date', 'INVALID_DATE', 'date must be a real YYYY-MM-DD date') }; }
  if (!['INCOME', 'SPENDING', 'TRANSFER'].includes(type)) return { error: diagnostic(rowNumber, 'type', 'INVALID_TYPE', 'type must be INCOME, SPENDING, or TRANSFER') };
  if (!/^[1-9]\d*$/.test(rawAmount)) return { error: diagnostic(rowNumber, 'amountMinor', 'INVALID_AMOUNT', 'amountMinor must be positive decimal digits') };
  const amountMinor = Number(rawAmount);
  if (!Number.isSafeInteger(amountMinor)) return { error: diagnostic(rowNumber, 'amountMinor', 'INVALID_AMOUNT', 'amountMinor must be a safe integer') };

  let normalizedAccount = account;
  if (type === 'TRANSFER') {
    const parts = account.split('=>');
    if (parts.length !== 2 || !uuid.test(parts[0]) || !uuid.test(parts[1]) || parts[0].toLowerCase() === parts[1].toLowerCase()) return { error: diagnostic(rowNumber, 'account', 'TRANSFER_GRAMMAR', 'Transfer account must be sourceAccountId=>destinationAccountId with distinct canonical UUIDs') };
    normalizedAccount = `${parts[0].toLowerCase()}=>${parts[1].toLowerCase()}`;
  } else {
    if (!uuid.test(account)) return { error: diagnostic(rowNumber, 'account', 'INVALID_ACCOUNT', 'account must be a canonical UUID') };
    normalizedAccount = account.toLowerCase();
  }

  let normalizedCategory = category;
  if (type === 'SPENDING') {
    if (!uuid.test(category)) return { error: diagnostic(rowNumber, 'category', 'INVALID_CATEGORY', 'Spending category must be a canonical UUID') };
    normalizedCategory = category.toLowerCase();
  } else if (category !== '') {
    return { error: diagnostic(rowNumber, 'category', 'INVALID_CATEGORY', 'category must be empty for income and transfers') };
  }

  try {
    const normalized = normalizeMetadata({ payee, memo });
    return { value: { date, type: type as CsvKind, account: normalizedAccount, amountMinor, category: normalizedCategory, payee: normalized.payee, memo: normalized.memo } };
  } catch (error) {
    return { error: diagnostic(rowNumber, 'payee/memo', 'INVALID_METADATA', error instanceof Error ? error.message : 'metadata is invalid') };
  }
};

export const parseTransactionCsv = (bytes: Uint8Array): CsvParseResult => {
  if (bytes.byteLength > CSV_MAX_BYTES) return { rows: 0, accepted: 0, rejected: 0, diagnostics: [diagnostic(0, 'file', 'FILE_TOO_LARGE', `CSV must not exceed ${CSV_MAX_BYTES} bytes`)], diagnosticsTruncated: false, values: [] };
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { rows: 0, accepted: 0, rejected: 0, diagnostics: [diagnostic(1, 'file', 'INVALID_HEADER', `Header must be exactly ${CSV_HEADER}`)], diagnosticsTruncated: false, values: [] };
  let text: string;
  try { text = decode(bytes); } catch (error) { return { rows: 0, accepted: 0, rejected: 0, diagnostics: [error as CsvDiagnostic], diagnosticsTruncated: false, values: [] }; }
  if (!text.startsWith(`${CSV_HEADER}\r\n`)) return { rows: 0, accepted: 0, rejected: 0, diagnostics: [diagnostic(1, 'file', 'INVALID_HEADER', `Header must be exactly ${CSV_HEADER}`)], diagnosticsTruncated: false, values: [] };

  let records: ParsedRecord[];
  try { records = parseRecords(text); } catch (error) { return { rows: 0, accepted: 0, rejected: 0, diagnostics: [error as CsvDiagnostic], diagnosticsTruncated: false, values: [] }; }
  const data = records.slice(1);
  if (data.length === 0) return { rows: 0, accepted: 0, rejected: 0, diagnostics: [diagnostic(0, 'file', 'INVALID_CSV', 'CSV must contain at least one data row')], diagnosticsTruncated: false, values: [] };
  if (data.length > CSV_MAX_ROWS) return { rows: data.length, accepted: 0, rejected: data.length, diagnostics: [diagnostic(0, 'file', 'ROW_LIMIT_EXCEEDED', `CSV must not exceed ${CSV_MAX_ROWS} data rows`)], diagnosticsTruncated: false, values: [] };

  const values: CsvTransactionRow[] = [];
  const diagnostics: CsvDiagnostic[] = [];
  let rejected = 0;
  for (let index = 0; index < data.length; index += 1) {
    const checked = validateRow(data[index].fields, index + 2);
    if (checked.error) {
      rejected += 1;
      if (diagnostics.length < CSV_MAX_DIAGNOSTICS) diagnostics.push(checked.error);
    } else if (checked.value) values.push(checked.value);
  }
  return { rows: data.length, accepted: values.length, rejected, diagnostics, diagnosticsTruncated: rejected > CSV_MAX_DIAGNOSTICS, values };
};

const serializeField = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export const serializeTransactionCsv = (rows: CsvTransactionRow[]): Uint8Array => {
  const lines = rows.map(row => [row.date, row.type, row.account, row.amountMinor, row.category, row.payee, row.memo].map(serializeField).join(','));
  return new TextEncoder().encode(`${CSV_HEADER}\r\n${lines.length ? `${lines.join('\r\n')}\r\n` : ''}`);
};

const lexicalBytes = (left: string, right: string) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
const nullableCompare = (left: string | null, right: string | null) => left === right ? 0 : left === null ? -1 : right === null ? 1 : lexicalBytes(left, right);
const typeRank: Record<CsvKind, number> = { INCOME: 0, SPENDING: 1, TRANSFER: 2 };

type Projected = CsvTransactionRow & { identity: string };
export const projectEffectiveCsvRows = (events: ExportEvent[], transfers: ExportTransfer[] = []): CsvTransactionRow[] => {
  const effective = foldEffectiveHistory(events);
  const rows: Projected[] = [];
  for (const event of effective) {
    if (event.kind !== 'INCOME' && event.kind !== 'SPENDING') continue;
    if (!event.accountId) continue;
    rows.push({
      identity: event.transactionId ?? event.id,
      date: event.businessDate ?? `${event.month ?? '1970-01'}-01`,
      type: event.kind,
      account: event.accountId.toLowerCase(),
      amountMinor: event.amountMinor,
      category: event.kind === 'SPENDING' ? (event.categoryId ?? '').toLowerCase() : '',
      payee: event.payee ?? null,
      memo: event.memo ?? null,
    });
  }
  for (const transfer of transfers) rows.push({ identity: transfer.id, date: transfer.businessDate, type: 'TRANSFER', account: `${transfer.sourceAccountId.toLowerCase()}=>${transfer.destinationAccountId.toLowerCase()}`, amountMinor: transfer.amountMinor, category: '', payee: transfer.payee ?? null, memo: transfer.memo ?? null });
  rows.sort((left, right) => left.date.localeCompare(right.date)
    || typeRank[left.type] - typeRank[right.type]
    || lexicalBytes(left.account, right.account)
    || left.amountMinor - right.amountMinor
    || (left.category === right.category ? 0 : left.category === '' ? -1 : right.category === '' ? 1 : lexicalBytes(left.category, right.category))
    || nullableCompare(left.payee, right.payee)
    || nullableCompare(left.memo, right.memo)
    || lexicalBytes(left.identity, right.identity));
  return rows.map(({ identity: _identity, ...row }) => row);
};

export const canonicalImportDigest = (budgetId: string, expectedVersion: number, rows: CsvTransactionRow[]) => {
  const csv = new TextDecoder().decode(serializeTransactionCsv(rows));
  const payload = `route = /api/v1/budgets/${budgetId}/transactions/import\nbudgetId = ${budgetId}\nexpectedVersion = ${expectedVersion}\ncsv = ${csv}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
};

export const csvFieldNames = fieldNames;
