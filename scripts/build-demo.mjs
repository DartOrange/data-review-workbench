import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32' || process.arch !== 'x64' || process.versions.node !== '26.13.0') {
  throw new Error('Build the Windows x64 demo with Node 26.13.0; the packaged runtime is pinned.');
}
const output = resolve('demo/windows-x64');
const temporary = resolve('dist/portable');
await mkdir(output, { recursive: true });
await mkdir(temporary, { recursive: true });
await copyFile('public/samples/customer-ledger.csv', 'demo/customer-ledger.csv');
await copyFile('public/samples/malformed.csv', 'demo/malformed.csv');
await build({
  entryPoints: ['server/portable.ts'],
  outfile: join(temporary, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node26',
  minify: false,
  legalComments: 'inline',
});
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name),
      ),
    )
  ).flat();
}
const assets = {};
for (const file of await files(resolve('dist/client')))
  assets[relative(resolve('dist/client'), file).replaceAll('\\', '/')] = file;
const exe = join(output, 'DataReviewWorkbench-1.0.0.exe');
const config = {
  main: join(temporary, 'main.cjs'),
  output: exe,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  execArgvExtension: 'none',
  assets,
};
await writeFile(join(temporary, 'sea.json'), JSON.stringify(config, null, 2));
execFileSync(process.execPath, ['--build-sea', join(temporary, 'sea.json')], { stdio: 'inherit' });
// Preserve upstream notices for the redistributed Node runtime and bundled npm dependencies.
const nodeLicenseUrl = 'https://raw.githubusercontent.com/nodejs/node/v26.13.0/LICENSE';
const response = await fetch(nodeLicenseUrl);
if (!response.ok) throw new Error('Could not retrieve the pinned Node runtime license.');
function normalizeNotice(text) {
  return text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.replaceAll('\t', '    ').trimEnd())
    .join('\n');
}
await writeFile(join(output, 'NODE-LICENSE.txt'), normalizeNotice(await response.text()));
const notices = [];
for (const name of [
  'express',
  'csv-parse',
  'react',
  'react-dom',
  '@mui/material',
  '@emotion/react',
  '@emotion/styled',
  'ag-grid-community',
  'ag-grid-react',
]) {
  const directory = resolve('node_modules', name);
  for (const file of await files(directory)) {
    if (
      /^licen[sc]e(?:\.[^.]+)?$/i.test(file.split(/[\\/]/).pop()) &&
      !relative(directory, file).includes('node_modules')
    ) {
      notices.push(
        `\n--- ${name}: ${relative(directory, file)} ---\n${await readFile(file, 'utf8')}`,
      );
    }
  }
}
// Include licenses for transitive bundled packages as well.
for (const directory of await readdir(resolve('node_modules'), { withFileTypes: true })) {
  if (!directory.isDirectory() || directory.name.startsWith('@') || directory.name.startsWith('.'))
    continue;
  const folder = resolve('node_modules', directory.name);
  for (const file of await readdir(folder))
    if (/^licen[sc]e(?:\.[^.]+)?$/i.test(file))
      notices.push(`\n--- ${directory.name} ---\n${await readFile(join(folder, file), 'utf8')}`);
}
await writeFile(join(output, 'DEPENDENCY-NOTICES.txt'), normalizeNotice(notices.join('\n')));
await copyFile('LICENSE', join(output, 'LICENSE.txt'));
const executable = await readFile(exe);
if (executable.length >= 100 * 1024 * 1024)
  throw new Error('Executable exceeds the 100 MiB artifact size limit.');
const manifest = {
  version: '1.0.0',
  platform: 'windows-x64',
  runtime: process.version,
  sha256: createHash('sha256').update(executable).digest('hex'),
  bytes: executable.length,
  sourceFiles: ['server', 'shared', 'src', 'public'],
  command: 'npm run build:demo',
  signed: false,
};
await writeFile(join(output, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(output, 'START-HERE.txt'),
  'Data Review Workbench\n\nDouble-click DataReviewWorkbench-1.0.0.exe. Your browser opens http://127.0.0.1:3001.\nNo Node.js or npm installation is required. Keep the console window open.\nPress Ctrl+C or close the console window to stop the local server.\n\nSaved data: %LOCALAPPDATA%\\DataReviewWorkbench\\workbench.sqlite\nUse Try sample data, fix the two highlighted fields, then export the corrected CSV.\n\nWindows x64 only. This executable is unsigned.\nSee LICENSE.txt, NODE-LICENSE.txt, and DEPENDENCY-NOTICES.txt.\n',
);
console.log(`Ready: ${exe} (${executable.length} bytes)\nSHA-256: ${manifest.sha256}`);
