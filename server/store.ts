import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Dataset, DatasetSummary, Values } from '../shared/contracts.js';
import { AppError, validateRows } from './domain.js';

interface Stored {
  id: string;
  name: string;
  created_at: string;
  revision: number;
  payload: string;
}
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1, payload TEXT NOT NULL
      );`);
  }
  close() {
    this.db.close();
  }
  private hydrate(stored: Stored): Dataset {
    const values = JSON.parse(stored.payload) as Values[];
    const issues = validateRows(values);
    return {
      id: stored.id,
      name: stored.name,
      createdAt: stored.created_at,
      revision: stored.revision,
      total: values.length,
      invalid: issues.filter((value) => Object.keys(value).length).length,
      issueCount: issues.reduce((sum, value) => sum + Object.keys(value).length, 0),
      rows: values.map((value, index) => ({ id: index + 1, values: value, issues: issues[index] })),
    };
  }
  list(): DatasetSummary[] {
    return (
      this.db
        .prepare('SELECT * FROM datasets ORDER BY created_at DESC, rowid DESC')
        .all() as unknown as Stored[]
    ).map((stored) => {
      const { rows: _rows, ...summary } = this.hydrate(stored);
      return summary;
    });
  }
  get(id: string): Dataset {
    const stored = this.db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as unknown as
      Stored | undefined;
    if (!stored) throw new AppError(404, 'NOT_FOUND', 'Dataset not found. Select another import.');
    return this.hydrate(stored);
  }
  create(name: string, values: Values[]): Dataset {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO datasets (id, name, created_at, payload) VALUES (?, ?, ?, ?)')
      .run(id, name, new Date().toISOString(), JSON.stringify(values));
    return this.get(id);
  }
  patch(id: string, rowId: number, revision: number, changes: Partial<Values>): Dataset {
    const dataset = this.get(id);
    if (dataset.revision !== revision)
      throw new AppError(
        409,
        'REVISION_CONFLICT',
        'This dataset changed in another tab. Reload saved data before editing again.',
      );
    if (!dataset.rows[rowId - 1]) throw new AppError(404, 'ROW_NOT_FOUND', 'Record not found.');
    const values = dataset.rows.map((row) => row.values);
    values[rowId - 1] = { ...values[rowId - 1], ...changes };
    const result = this.db
      .prepare(
        'UPDATE datasets SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?',
      )
      .run(JSON.stringify(values), id, revision);
    if (!result.changes)
      throw new AppError(
        409,
        'REVISION_CONFLICT',
        'This dataset changed. Reload saved data before editing again.',
      );
    return this.get(id);
  }
}
