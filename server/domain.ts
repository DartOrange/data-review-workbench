import { parse } from 'csv-parse/sync';
import { fields, MAX_BYTES, MAX_ROWS, type Issues, type Values } from '../shared/contracts.js';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parseCsv(buffer: Buffer): Values[] {
  if (buffer.length > MAX_BYTES)
    throw new AppError(413, 'FILE_TOO_LARGE', 'CSV files must be 1 MiB or smaller.');
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new AppError(400, 'INVALID_ENCODING', 'Use a UTF-8 encoded CSV file.');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) {
    throw new AppError(400, 'CONTROL_CHARACTER', 'CSV contains unsupported control characters.');
  }
  let records: string[][];
  try {
    records = parse(source, { bom: true, skip_empty_lines: true, max_record_size: 16384 });
  } catch {
    throw new AppError(
      400,
      'MALFORMED_CSV',
      'Malformed CSV. Check quotes, column counts, or unusually long records.',
    );
  }
  if (records.length < 2)
    throw new AppError(400, 'EMPTY_CSV', 'Include a header and at least one data record.');
  if (
    records[0].length !== fields.length ||
    records[0].some((value, index) => value !== fields[index])
  ) {
    throw new AppError(
      400,
      'INVALID_HEADER',
      `Expected these columns in order: ${fields.join(',')}.`,
    );
  }
  if (records.length - 1 > MAX_ROWS)
    throw new AppError(413, 'TOO_MANY_ROWS', 'CSV files may contain at most 5,000 data records.');
  return records
    .slice(1)
    .map(
      (record) =>
        Object.fromEntries(fields.map((field, index) => [field, record[index]])) as Values,
    );
}

export function validateRows(rows: Values[]): Issues[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1));
  return rows.map((row) => {
    const issues: Issues = {};
    for (const field of fields) {
      if (row[field].length > (field === 'notes' ? 1000 : 256))
        issues[field] = `Use at most ${field === 'notes' ? 1000 : 256} characters.`;
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(row[field]))
        issues[field] = 'Unsupported control character.';
    }
    if (!/^[A-Z0-9-]{2,24}$/.test(row.customer_id))
      issues.customer_id = 'Use 2–24 uppercase letters, digits, or hyphens.';
    else if (counts.get(row.customer_id)! > 1)
      issues.customer_id = 'Customer ID must be unique in this dataset.';
    if (!row.name.trim()) issues.name = 'Name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
      issues.email = 'Enter an email address such as alex@example.com.';
    if (!['US', 'GB', 'DE', 'UA', 'CA', 'FR', 'PL', 'NL'].includes(row.country))
      issues.country = 'Use US, GB, DE, UA, CA, FR, PL, or NL.';
    if (!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(row.amount))
      issues.amount = 'Use 0–9999999.99 with up to two decimal places; no currency symbol.';
    return issues;
  });
}

// Quote every cell and neutralize spreadsheet formula prefixes, including whitespace/full-width variants.
export function exportCsv(rows: Values[]): string {
  const cell = (value: string) => {
    const safe =
      /^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      fields.map(cell).join(','),
      ...rows.map((row) => fields.map((field) => cell(row[field])).join(',')),
    ].join('\r\n') +
    '\r\n'
  );
}
