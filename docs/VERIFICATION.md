# Verification

Verified on 2026-10-30 on Windows x64, Node.js 26.13.0, npm 11.20.0, and Microsoft Edge 156.0.4314.50. Results apply to this local desktop environment.

| Check                  | Observed result                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm ci`               | Successful clean installation from the lockfile                                             |
| `npm run check`        | Formatting, ESLint, strict TypeScript, client/server builds, and 9 API/domain tests passed  |
| `npm run test:e2e`     | 5 browser scenarios passed against the built server                                         |
| `npm run build:demo`   | Windows x64 executable generated with the embedded Node 26.13.0 runtime and frontend assets |
| `npm run test:demo`    | The same 5 browser scenarios passed against the actual packaged executable                  |
| `npm run dev`          | Frontend returned HTTP 200 and Vite proxied health/dataset requests to the API              |
| `npm audit --omit=dev` | No known runtime dependency vulnerabilities reported at the time of the check               |

## Behaviors exercised

- Real file import from `demo/customer-ledger.csv`, field-level validation, invalid-only filtering, direct grid editing, and inspector form saving.
- Page reload retains saved corrections; the API suite also closes and reopens the SQLite database before checking persisted values and export.
- Export is blocked while errors remain. The completed download contains corrected data and neutralized formula-like notes while source values remain unchanged.
- Malformed CSV, wrong/duplicate headers, invalid UTF-8, control characters, inconsistent columns, empty files, byte limits, and row limits reject structurally invalid imports without partial persistence.
- Duplicate IDs flag both records and clear correctly after a relevant correction.
- Stale revisions return a conflict; browser recovery reloads the latest data without silently overwriting it.
- Failed initial loading and failed saving have working recovery paths. A failed form save retains its draft.
- An oversized file is rejected in the UI. Keyboard editing can be cancelled with Escape without saving.
- Embedded HTML, JavaScript, and CSS receive browser-compatible MIME types. This regression check covers an earlier packaging defect that produced a blank page.
- A 390px desktop-browser viewport has no document-level horizontal overflow. This is a responsive layout check, not physical phone or native mobile validation.

## Visual evidence

The screenshots below were regenerated through the packaged executable and visually inspected:

- [Empty state](screenshots/00-empty.png)
- [Imported ledger](screenshots/01-imported.png)
- [Field inspector](screenshots/01b-inspector.png)
- [Corrected data](screenshots/02-corrected.png)
- [Malformed upload](screenshots/03-malformed.png)
- [Narrow viewport](screenshots/04-narrow.png)

## Artifact and limits

`demo/windows-x64/build-manifest.json` records the executable's byte size, runtime, and SHA-256. The executable is unsigned and Windows x64 only. The application was tested with isolated databases; saved user data is not part of the distribution.

The client build reports a 1,628.63 kB JavaScript asset (468.36 kB gzip) and Vite's chunk-size warning. This was observed from the build output, not a browser performance benchmark. No scalability, production readiness, screen-reader certification, Excel/LibreOffice behavior, other browser, native mobile, Linux, or macOS result is claimed. The minimum supported development Node version was not tested separately from Node 26.13.0.
