import express, { type ErrorRequestHandler } from 'express';
import { fields, MAX_BYTES, type Values } from '../shared/contracts.js';
import { AppError, exportCsv, parseCsv } from './domain.js';
import { Store } from './store.js';

export function createApp(store: Store, clientDirectory?: string, port = 3001) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin');
      // Loopback-only application; reject browser cross-origin mutations, including multipart forms.
      if (
        origin &&
        ![
          'http://127.0.0.1:5173',
          'http://localhost:5173',
          `http://127.0.0.1:${port}`,
          `http://localhost:${port}`,
        ].includes(origin)
      ) {
        throw new AppError(403, 'ORIGIN_REJECTED', 'Cross-origin changes are not allowed.');
      }
      if (req.get('sec-fetch-site') === 'cross-site')
        throw new AppError(403, 'ORIGIN_REJECTED', 'Cross-site changes are not allowed.');
    }
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/datasets', (_req, res) => res.json(store.list()));
  app.get('/api/datasets/:id', (req, res) => res.json(store.get(req.params.id)));
  app.post('/api/datasets', express.raw({ type: 'text/csv', limit: MAX_BYTES }), (req, res) => {
    if (!req.is('text/csv'))
      throw new AppError(415, 'CONTENT_TYPE', 'Upload a CSV with Content-Type: text/csv.');
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let name: string;
    try {
      name = decodeURIComponent(req.get('x-file-name') ?? 'import.csv');
    } catch {
      throw new AppError(400, 'INVALID_NAME', 'Invalid file name.');
    }
    name =
      name
        .replaceAll('\\', '/')
        .split('/')
        .pop()!
        .replace(/[\x00-\x1f\x7f]/g, '')
        .slice(0, 120) || 'import.csv';
    res.status(201).json(store.create(name, parseCsv(buffer)));
  });
  app.patch(
    '/api/datasets/:id/rows/:rowId',
    express.json({ limit: '16kb', strict: true }),
    (req, res) => {
      const body = req.body;
      const rowId = Number(req.params.rowId);
      if (
        !body ||
        !Number.isSafeInteger(body.revision) ||
        body.revision < 1 ||
        !Number.isSafeInteger(rowId) ||
        rowId < 1 ||
        !body.changes ||
        typeof body.changes !== 'object' ||
        Array.isArray(body.changes) ||
        Object.keys(body).some((key) => !['revision', 'changes'].includes(key)) ||
        !Object.keys(body.changes).length ||
        Object.entries(body.changes).some(
          ([key, value]) =>
            !fields.includes(key as keyof Values) ||
            typeof value !== 'string' ||
            value.length > 4000,
        )
      ) {
        throw new AppError(
          400,
          'INVALID_PATCH',
          'Provide a revision and changes containing known string fields (at most 4,000 characters per value).',
        );
      }
      res.json(store.patch(req.params.id, rowId, body.revision, body.changes));
    },
  );
  app.get('/api/datasets/:id/export', (req, res) => {
    const dataset = store.get(req.params.id);
    if (dataset.invalid)
      throw new AppError(
        422,
        'UNRESOLVED_ISSUES',
        'Correct all validation issues before exporting.',
      );
    res.setHeader('Content-Disposition', 'attachment; filename="reviewed-dataset.csv"');
    res.type('text/csv').send(exportCsv(dataset.rows.map((row) => row.values)));
  });
  app.use('/api', () => {
    throw new AppError(404, 'NOT_FOUND', 'API route not found.');
  });
  if (clientDirectory) {
    app.use(express.static(clientDirectory));
    app.get('/', (_req, res) => res.sendFile('index.html', { root: clientDirectory }));
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof AppError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({
        code: 'FILE_TOO_LARGE',
        message: 'Request is too large. CSV uploads are limited to 1 MiB; edits to 16 KiB.',
      });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ code: 'INVALID_JSON', message: 'Request body must be valid JSON.' });
      return;
    }
    console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed. Retry or check the local server.',
    });
  };
  app.use(errorHandler);
  return app;
}
