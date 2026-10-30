export const fields = ['customer_id', 'name', 'email', 'country', 'amount', 'notes'] as const;
export type Field = (typeof fields)[number];
export type Values = Record<Field, string>;
export type Issues = Partial<Record<Field, string>>;
export interface ReviewRow {
  id: number;
  values: Values;
  issues: Issues;
}
export interface DatasetSummary {
  id: string;
  name: string;
  createdAt: string;
  revision: number;
  total: number;
  invalid: number;
  issueCount: number;
}
export interface Dataset extends DatasetSummary {
  rows: ReviewRow[];
}
export const MAX_BYTES = 1024 * 1024;
export const MAX_ROWS = 5000;
export const labels: Record<Field, string> = {
  customer_id: 'Customer ID',
  name: 'Name',
  email: 'Email',
  country: 'Country',
  amount: 'Amount (USD)',
  notes: 'Notes',
};
