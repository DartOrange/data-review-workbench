import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { getAsset, getAssetKeys } from 'node:sea';
import { createApp } from './app.js';
import { Store } from './store.js';
import { mountAssets } from './assets.js';

const databasePath =
  process.env.DATABASE_PATH ??
  join(
    process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
    'DataReviewWorkbench',
    'workbench.sqlite',
  );
mkdirSync(dirname(databasePath), { recursive: true });
const store = new Store(databasePath);
const port = Number(process.env.WORKBENCH_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('WORKBENCH_PORT must be an integer from 1024 through 65535.');
const app = createApp(store, undefined, port);
mountAssets(app, getAssetKeys(), (key) => Buffer.from(getAsset(key)));
const url = `http://127.0.0.1:${port}`;
const server = app.listen(port, '127.0.0.1', () => {
  console.log(
    `Data Review Workbench\n${url}\nSaved data: ${databasePath}\nKeep this window open. Press Ctrl+C to stop.`,
  );
  if (!process.argv.includes('--no-open')) {
    const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    browser.on('error', () => console.log(`Open ${url} in your browser.`));
    browser.unref();
  }
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Close the other instance, or open ${url}.`
      : 'The local application could not start.',
  );
  store.close();
  process.exitCode = 1;
});
function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
