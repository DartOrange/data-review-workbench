import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createApp } from './app.js';
import { Store } from './store.js';

const databasePath = resolve(process.env.DATABASE_PATH ?? 'data/workbench.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const store = new Store(databasePath);
const port = Number(process.env.WORKBENCH_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('WORKBENCH_PORT must be an integer from 1024 through 65535.');
const server = createApp(store, resolve('dist/client'), port).listen(port, '127.0.0.1', () => {
  console.log(`Data Review Workbench API: http://127.0.0.1:${port}`);
});
function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
