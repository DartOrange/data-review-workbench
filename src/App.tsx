import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellEditRequestEvent,
  type ColDef,
} from 'ag-grid-community';
import {
  fields,
  labels,
  MAX_BYTES,
  type Dataset,
  type DatasetSummary,
  type Field,
  type ReviewRow,
  type Values,
} from '../shared/contracts';
import { message, request } from './api';

ModuleRegistry.registerModules([AllCommunityModule]);
const gridTheme = themeQuartz.withParams({
  accentColor: '#246759',
  backgroundColor: '#ffffff',
  foregroundColor: '#243d39',
  headerBackgroundColor: '#f5f7f5',
  headerFontSize: 11,
  fontSize: 13,
  fontFamily: 'Segoe UI, sans-serif',
  borderColor: '#e2e7e3',
  rowBorder: { color: '#edf0ed' },
  wrapperBorder: false,
  headerHeight: 43,
  rowHeight: 46,
  selectedRowBackgroundColor: '#edf5ee',
});
type GridRow = ReviewRow & Values;
const emptyDraft: Values = {
  customer_id: '',
  name: '',
  email: '',
  country: '',
  amount: '',
  notes: '',
};

export function App() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Values>(emptyDraft);
  const fileInput = useRef<HTMLInputElement>(null);
  const operation = useRef(false);
  const selected = dataset?.rows.find((row) => row.id === selectedId);
  const dirty = !!selected && fields.some((field) => selected.values[field] !== draft[field]);

  const accept = useCallback((next: Dataset) => {
    setDataset(next);
    setDatasets((previous) => [next, ...previous.filter((item) => item.id !== next.id)]);
    try {
      localStorage.setItem('workbench.dataset', next.id);
    } catch {
      /* Persistence remains server-side if browser storage is unavailable. */
    }
  }, []);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      setError(message(cause));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    const list = await request<DatasetSummary[]>('/api/datasets');
    setDatasets(list);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('workbench.dataset');
    } catch {
      /* Use latest import. */
    }
    const id = list.find((item) => item.id === saved)?.id ?? list[0]?.id;
    if (id) {
      accept(await request<Dataset>(`/api/datasets/${id}`));
      setSelectedId(null);
    }
  }, [accept]);

  useEffect(() => {
    void run(load);
  }, [load, run]);

  const selectRow = useCallback(
    (row: ReviewRow) => {
      if (dirty && !window.confirm('Discard unsaved form changes?')) return;
      setSelectedId(row.id);
      setDraft({ ...row.values });
    },
    [dirty],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const discardDraft = () => !dirty || window.confirm('Discard unsaved form changes?');
  const importBuffer = async (buffer: ArrayBuffer, name: string) => {
    if (buffer.byteLength > MAX_BYTES) throw new Error('CSV files must be 1 MiB or smaller.');
    const next = await request<Dataset>('/api/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv', 'X-File-Name': encodeURIComponent(name) },
      body: buffer,
    });
    accept(next);
    setSelectedId(null);
    setFilter('all');
    setQuery('');
    setNotice(`Imported ${next.total} records. ${next.invalid} need review.`);
  };
  const importFile = (file?: File) => {
    if (!file || !discardDraft()) return;
    void run(async () => {
      if (!file.name.toLowerCase().endsWith('.csv'))
        throw new Error('Choose a .csv file encoded as UTF-8.');
      if (file.size > MAX_BYTES) throw new Error('CSV files must be 1 MiB or smaller.');
      await importBuffer(await file.arrayBuffer(), file.name);
    });
  };
  const save = async (row: ReviewRow, changes: Partial<Values>) => {
    if (!dataset) return;
    const next = await request<Dataset>(`/api/datasets/${dataset.id}/rows/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: dataset.revision, changes }),
    });
    accept(next);
    if (selectedId === row.id) setDraft({ ...next.rows[row.id - 1].values });
    setNotice(
      `Record ${row.id} saved. ${next.invalid ? `${next.invalid} ${next.invalid === 1 ? 'record still needs' : 'records still need'} review.` : 'All records are ready to export.'}`,
    );
  };

  const columns = useMemo<ColDef<GridRow>[]>(
    () => [
      { headerName: '#', field: 'id', width: 58, pinned: 'left', editable: false, filter: false },
      {
        headerName: 'Review',
        colId: 'status',
        width: 115,
        editable: false,
        filter: false,
        valueGetter: (params) =>
          Object.keys(params.data?.issues ?? {}).length ? 'Needs review' : 'Ready',
        cellClass: (params) =>
          Object.keys(params.data?.issues ?? {}).length ? 'status-review' : 'status-ready',
      },
      ...fields.map((field) => ({
        field,
        headerName: labels[field],
        minWidth: field === 'email' ? 220 : 125,
        flex: field === 'notes' || field === 'name' ? 1 : undefined,
        width:
          field === 'notes' ? 230 : field === 'name' ? 175 : field === 'amount' ? 145 : undefined,
        editable: !busy && !dirty,
        cellDataType: 'text' as const,
        tooltipValueGetter: (params: { data?: GridRow }) =>
          params.data?.issues[field] ?? 'Double-click or press Enter to edit.',
        cellClassRules: {
          'invalid-cell': (params: { data?: GridRow }) => !!params.data?.issues[field],
        },
      })),
    ],
    [busy, dirty],
  );
  const rows: GridRow[] = (dataset?.rows ?? [])
    .filter(
      (row) =>
        (filter === 'all' ||
          (filter === 'invalid'
            ? Object.keys(row.issues).length > 0
            : Object.keys(row.issues).length === 0)) &&
        fields.some((field) => row.values[field].toLowerCase().includes(query.toLowerCase())),
    )
    .map((row) => ({ ...row, ...row.values }));
  const progress = dataset
    ? Math.round(((dataset.total - dataset.invalid) / dataset.total) * 100)
    : 0;

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Application identity">
        <div className="brand-mark">
          w<span>·</span>
        </div>
        <div className="rail-label">DATA TOOLS</div>
        <div className="rail-active" title="Review workspace">
          ▤
        </div>
        <span className="rail-bottom">01</span>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Data review</strong>
          </div>
          <div className="local-badge">
            <span /> Local workspace
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">IMPORT · REVIEW · EXPORT</div>
              <h1>Data Review Workbench</h1>
              <p>Turn a messy customer ledger into data you can trust.</p>
            </div>
            <div className="heading-tag">SYNTHETIC DATA ONLY</div>
          </div>
          <section className="import-strip" aria-label="Import dataset">
            <div className="import-symbol">↑</div>
            <div className="import-copy">
              <h2>Start with a CSV</h2>
              <p>UTF-8 · up to 1 MiB · 5,000 records · fixed customer schema</p>
            </div>
            <a className="text-link" href="/samples/customer-ledger.csv" download>
              Download sample
            </a>
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => {
                if (discardDraft())
                  void run(async () => {
                    const response = await fetch('/samples/customer-ledger.csv');
                    if (!response.ok) throw new Error('Sample file could not be loaded.');
                    await importBuffer(await response.arrayBuffer(), 'customer-ledger.csv');
                  });
              }}
            >
              Try sample data
            </Button>
            <Button variant="contained" disabled={busy} onClick={() => fileInput.current?.click()}>
              ↑ &nbsp; Import CSV
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              aria-label="Import CSV file"
              className="visually-hidden"
              onChange={(event) => {
                importFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </section>
          <div aria-live="polite" className="notifications">
            {error && (
              <Alert
                severity="error"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    disabled={busy}
                    onClick={() => {
                      if (discardDraft()) void run(load);
                    }}
                  >
                    Reload saved data
                  </Button>
                }
              >
                {error}
              </Alert>
            )}
            {notice && (
              <Alert severity="success" onClose={() => setNotice('')}>
                {notice}
              </Alert>
            )}
            {busy && <LinearProgress aria-label="Request in progress" />}
          </div>
          {dataset ? (
            <>
              <section className="metrics" aria-label="Dataset summary">
                <div className="metric">
                  <span>TOTAL RECORDS</span>
                  <strong>{dataset.total.toLocaleString()}</strong>
                  <small>In this dataset</small>
                </div>
                <div className="metric warning">
                  <span>NEED REVIEW</span>
                  <strong>
                    {dataset.invalid.toLocaleString()}
                    <i>
                      {dataset.issueCount} field {dataset.issueCount === 1 ? 'issue' : 'issues'}
                    </i>
                  </strong>
                  <small>Checked on the server</small>
                </div>
                <div className="metric">
                  <span>READY TO EXPORT</span>
                  <strong>{(dataset.total - dataset.invalid).toLocaleString()}</strong>
                  <small>All validation rules passed</small>
                </div>
                <div className="metric progress-metric">
                  <span>REVIEW PROGRESS</span>
                  <strong>
                    {progress}
                    <em>%</em>
                  </strong>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    aria-label="Review progress"
                  />
                </div>
              </section>
              <div className="review-layout">
                <section className="grid-card" aria-label="Records workspace">
                  <div className="dataset-toolbar">
                    <div>
                      <h2>Customer ledger</h2>
                      <p>Saved locally · revision {dataset.revision}</p>
                    </div>
                    <FormControl size="small" className="dataset-select">
                      <InputLabel id="dataset-label">Dataset</InputLabel>
                      <Select
                        labelId="dataset-label"
                        label="Dataset"
                        value={dataset.id}
                        disabled={busy}
                        onChange={(event) => {
                          if (discardDraft())
                            void run(async () => {
                              accept(await request<Dataset>(`/api/datasets/${event.target.value}`));
                              setSelectedId(null);
                              setQuery('');
                              setFilter('all');
                            });
                        }}
                      >
                        {datasets.map((item) => (
                          <MenuItem key={item.id} value={item.id}>
                            {item.name} · {item.id.slice(0, 4)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </div>
                  <div className="filter-toolbar">
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={filter}
                      aria-label="Review status"
                      onChange={(_event, value) => value && setFilter(value)}
                    >
                      <ToggleButton value="all">All records</ToggleButton>
                      <ToggleButton value="invalid">Needs review ({dataset.invalid})</ToggleButton>
                      <ToggleButton value="ready">Ready</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField
                      size="small"
                      placeholder="Search records…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      slotProps={{ htmlInput: { 'aria-label': 'Search records' } }}
                    />
                  </div>
                  <div className="grid-container" aria-busy={busy}>
                    <AgGridReact<GridRow>
                      theme={gridTheme}
                      rowData={rows}
                      columnDefs={columns}
                      getRowId={(params) => String(params.data.id)}
                      defaultColDef={{ sortable: true, resizable: true, filter: true }}
                      readOnlyEdit
                      stopEditingWhenCellsLoseFocus
                      tooltipShowDelay={150}
                      overlayNoRowsTemplate="No matching records. Try another filter or search."
                      onRowClicked={(event) => {
                        if (event.data && !busy) selectRow(event.data);
                      }}
                      onCellFocused={(event) => {
                        const row = event.api.getDisplayedRowAtIndex(event.rowIndex ?? -1)?.data;
                        if (row && !busy && !dirty && row.id !== selectedId) selectRow(row);
                      }}
                      onCellEditRequest={(event: CellEditRequestEvent<GridRow>) => {
                        const field = event.colDef.field as Field;
                        if (
                          event.data &&
                          fields.includes(field) &&
                          event.newValue !== event.oldValue
                        )
                          void run(() =>
                            save(event.data, { [field]: String(event.newValue ?? '') }),
                          );
                      }}
                    />
                  </div>
                  <div className="grid-footer">
                    <span>
                      {rows.length} of {dataset.total} records shown
                    </span>
                    <span>Double-click a cell or press Enter to edit</span>
                  </div>
                </section>
                <aside className="inspector" aria-label="Record inspector">
                  <div className="inspector-heading">
                    <span className="eyebrow">RECORD INSPECTOR</span>
                    <span className="inspector-icon">☷</span>
                  </div>
                  {selected ? (
                    <>
                      <h2>Record {selected.id}</h2>
                      <Chip
                        size="small"
                        label={
                          Object.keys(selected.issues).length
                            ? `${Object.keys(selected.issues).length} field ${Object.keys(selected.issues).length === 1 ? 'issue' : 'issues'}`
                            : 'Ready to export'
                        }
                        color={Object.keys(selected.issues).length ? 'warning' : 'success'}
                        variant="outlined"
                      />
                      <p className="inspector-hint">
                        Edit values below, then save. Validation runs on the server.
                      </p>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(() => save(selected, draft));
                        }}
                      >
                        {fields.map((field) => (
                          <TextField
                            key={field}
                            fullWidth
                            size="small"
                            label={labels[field]}
                            value={draft[field]}
                            disabled={busy}
                            error={!!selected.issues[field]}
                            helperText={selected.issues[field]}
                            multiline={field === 'notes'}
                            minRows={field === 'notes' ? 2 : undefined}
                            onChange={(event) =>
                              setDraft((previous) => ({ ...previous, [field]: event.target.value }))
                            }
                          />
                        ))}
                        <Button
                          fullWidth
                          variant="contained"
                          type="submit"
                          disabled={busy || !dirty}
                        >
                          Save record
                        </Button>
                        {dirty && (
                          <Button
                            fullWidth
                            disabled={busy}
                            onClick={() => setDraft({ ...selected.values })}
                          >
                            Discard changes
                          </Button>
                        )}
                      </form>
                    </>
                  ) : (
                    <div className="inspector-empty">
                      <div className="record-illustration">
                        <span />
                        <span />
                        <span />
                      </div>
                      <h2>A closer look</h2>
                      <p>Select a record to see field errors and make corrections.</p>
                      <div className="keyboard-hint">
                        <kbd>Tab</kbd> to navigate · <kbd>Enter</kbd> to edit
                      </div>
                    </div>
                  )}
                  <div className="rules-note">
                    <strong>Validation rules</strong>
                    <p>
                      Unique customer ID · required name · email format · supported country ·
                      non-negative USD amount
                    </p>
                    <span>Source record numbers exclude the header.</span>
                  </div>
                </aside>
              </div>
              <section className="export-strip">
                <div className="export-icon">↗</div>
                <div>
                  <h2>{dataset.invalid ? 'A few corrections away.' : 'Your dataset is ready.'}</h2>
                  <p>
                    {dataset.invalid
                      ? 'Resolve every field issue to unlock a safe CSV export.'
                      : 'Export saved values with spreadsheet formula protection.'}
                  </p>
                </div>
                <Button
                  variant="contained"
                  disabled={busy || dataset.invalid > 0 || dirty}
                  onClick={() =>
                    void run(async () => {
                      const response = await fetch(`/api/datasets/${dataset.id}/export`, {
                        signal: AbortSignal.timeout(15000),
                      });
                      if (!response.ok) {
                        const body = await response.json().catch(() => null);
                        throw new Error(body?.message ?? 'Export failed. Retry.');
                      }
                      const url = URL.createObjectURL(await response.blob());
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'reviewed-dataset.csv';
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                      setNotice(
                        'Export downloaded. Formula-like values were prefixed with an apostrophe.',
                      );
                    })
                  }
                >
                  ↓ &nbsp; Export corrected CSV
                </Button>
              </section>
            </>
          ) : (
            <section className="empty-state">
              {busy ? (
                <CircularProgress size={28} />
              ) : (
                <>
                  <div className="empty-grid">▦</div>
                  <span className="eyebrow">A CLEAN START</span>
                  <h2>Your next clean dataset starts here.</h2>
                  <p>
                    Import a customer ledger, review the highlighted issues,
                    <br />
                    and save corrections before exporting.
                  </p>
                  <Button variant="outlined" onClick={() => fileInput.current?.click()}>
                    Choose your first CSV
                  </Button>
                  <details>
                    <summary>View the CSV schema</summary>
                    <code>{fields.join(',')}</code>
                    <p>
                      Supported countries: US, GB, DE, UA, CA, FR, PL, NL. Amount: 0–9999999.99 USD.
                    </p>
                  </details>
                </>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>
              Data Review Workbench <b>/</b> CSV review workspace
            </span>
            <span>Local SQLite storage · No external services</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
