# Try Data Review Workbench

1. Open [`windows-x64/DataReviewWorkbench-1.0.0.exe`](windows-x64/DataReviewWorkbench-1.0.0.exe).
2. Keep its console window open. Your browser opens http://127.0.0.1:3001.
3. Import [`customer-ledger.csv`](customer-ledger.csv) from this folder, or click **Try sample data**.
4. Fix record 2's email to `jamie.reed@example.com` and record 4's amount to `25.00`.
5. Reload, then export the corrected CSV.

[`malformed.csv`](malformed.csv) is an intentional broken-file fixture. Importing it should show a clear error and preserve your existing dataset.

The executable is for Windows x64, includes its runtime, and requires no installation. Press Ctrl+C or close its console window to stop. Saved data stays in `%LOCALAPPDATA%\DataReviewWorkbench`.
