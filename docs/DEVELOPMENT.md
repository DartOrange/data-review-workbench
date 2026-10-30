# Development

## Setup

Node.js 24.13+ and npm are required for source development. The Windows executable build is pinned to Node 26.13.0 x64.

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite forwards `/api` to Express at port 3001. Stop with Ctrl+C. Run commands from the repository root.

```powershell
npm run build
npm start
```

The built server serves the frontend at http://127.0.0.1:3001. Both source modes use `data/workbench.sqlite`. Override with `$env:DATABASE_PATH = 'data/demo.sqlite'`; remove the override afterward with `Remove-Item Env:DATABASE_PATH`.

## Checks

```powershell
npm run check
npm run test:e2e
```

`check` runs Prettier, ESLint, strict TypeScript checks, client/server builds, and API/domain tests. Browser tests start the built server with their own ignored SQLite file and regenerate synthetic screenshots. Source-build tests use port 3003; executable tests use port 3002, so both are isolated from the normal application on port 3001.

Tests use installed Microsoft Edge. To configure Playwright Chromium instead:

```powershell
npx playwright install chromium
$env:PLAYWRIGHT_CHANNEL = 'chromium'
npm run test:e2e
```

Only the browsers/platforms in [verification](VERIFICATION.md) have been checked.

## Build the Windows executable

```powershell
npm run build:demo
npm run test:demo
```

Run on Windows x64 with Node 26.13.0. The build bundles the Express application with esbuild, embeds the built frontend and samples using Node's single-executable application support, and writes `demo/windows-x64/DataReviewWorkbench-1.0.0.exe`. It also writes its SHA-256 manifest, launch instructions, and redistribution license notices. Regenerate the executable whenever product source changes. `test:demo` exercises the actual executable with an isolated database.

The executable opens the default browser; `--no-open` suppresses that for automated tests. It stores normal user data outside the repository in `%LOCALAPPDATA%\DataReviewWorkbench`. The runtime is embedded; the generated application is unsigned. No signing keys are included.

## Design notes

React owns the visible state and inspector draft; server-confirmed data owns the grid. Express handles parsing, business rules, persistence, and CSV export. SQLite stores one bounded dataset per JSON payload with a compare-and-swap revision. See [architecture](ARCHITECTURE.md).

The client uses React 19.3.1, MUI 9.5.0, AG Grid Community 36.2.0, TypeScript 6.0.3, and Vite 8.3.5. The server uses Express 5.3.0, csv-parse 7.0.3, and built-in SQLite. Exact dependency versions are locked.

References: [React](https://react.dev/learn/installation), [Vite](https://vite.dev/guide/), [MUI](https://mui.com/material-ui/getting-started/installation/), [AG Grid Community](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/), [Express](https://expressjs.com/en/starter/installing/), [Node SQLite](https://nodejs.org/api/sqlite.html), [Node executable packaging](https://nodejs.org/api/single-executable-applications.html), and [CSV parsing](https://csv.js.org/parse/options/).
