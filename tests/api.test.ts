import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { parse } from 'csv-parse/sync';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { mountAssets } from '../server/assets.js';
import { exportCsv } from '../server/domain.js';
import { fields, MAX_BYTES, type Values } from '../shared/contracts.js';

const header = fields.join(',');
const valid = 'C-1,Alex,alex@example.com,US,12.50,Example';
const sample = readFileSync('public/samples/customer-ledger.csv');
let directory: string;
let store: Store;
let app: ReturnType<typeof createApp>;
before(() => {
  directory = mkdtempSync(join(tmpdir(), 'workbench-'));
  store = new Store(join(directory, 'test.sqlite'));
  app = createApp(store);
});
after(() => {
  store.close();
  rmSync(directory, { recursive: true, force: true });
});
const upload = (content: string | Buffer) =>
  request(app).post('/api/datasets').set('Content-Type', 'text/csv').send(content);

test('embedded frontend assets use browser-compatible MIME types and reject missing paths', async () => {
  const embedded = createApp(store);
  mountAssets(embedded, ['index.html', 'assets/app.js', 'assets/app.css'], (key) =>
    Buffer.from(key),
  );
  await request(embedded)
    .get('/')
    .expect('Content-Type', /text\/html/)
    .expect(200);
  await request(embedded)
    .get('/assets/app.js')
    .expect('Content-Type', /javascript/)
    .expect(200);
  await request(embedded)
    .get('/assets/app.css')
    .expect('Content-Type', /text\/css/)
    .expect(200);
  await request(embedded).get('/missing.js').expect(404);
});

test('sample import exposes precise errors; corrections survive reopening SQLite and export', async () => {
  const imported = await upload(sample).expect(201);
  const id = imported.body.id;
  assert.equal(imported.body.total, 12);
  assert.equal(imported.body.invalid, 2);
  assert.match(imported.body.rows[1].issues.email, /email/);
  assert.match(imported.body.rows[3].issues.amount, /decimal/);
  await request(app).get(`/api/datasets/${id}/export`).expect(422);
  const fixedEmail = await request(app)
    .patch(`/api/datasets/${id}/rows/2`)
    .send({ revision: 1, changes: { email: 'jamie.reed@example.com' } })
    .expect(200);
  assert.equal(fixedEmail.body.invalid, 1);
  await request(app)
    .patch(`/api/datasets/${id}/rows/4`)
    .send({ revision: 2, changes: { amount: '25.00' } })
    .expect(200);
  store.close();
  store = new Store(join(directory, 'test.sqlite'));
  app = createApp(store);
  const reloaded = await request(app).get(`/api/datasets/${id}`).expect(200);
  assert.equal(reloaded.body.rows[1].values.email, 'jamie.reed@example.com');
  assert.equal(reloaded.body.rows[3].values.amount, '25.00');
  assert.equal(reloaded.body.invalid, 0);
  const exported = await request(app).get(`/api/datasets/${id}/export`).expect(200);
  assert.match(exported.headers['content-disposition'], /attachment/);
  const records = parse(exported.text, { bom: true, columns: true }) as Values[];
  assert.equal(records.length, 12);
  assert.equal(records[5].notes, "'=SUM(1+1)");
  assert.equal(records[4].notes, 'Includes shipping, tax');
  assert.equal(reloaded.body.rows[5].values.notes, '=SUM(1+1)');
});

test('structural failures reject the whole file and preserve existing datasets', async () => {
  const previous = (await request(app).get('/api/datasets')).body.length;
  for (const content of [
    '',
    header,
    `${header}\nC-1,Too few`,
    `${header}\n"unclosed`,
    `name,email\nAlex,alex@example.com`,
    `${header}\n${valid}\nC-2,Too few`,
  ]) {
    const response = await upload(content).expect(400);
    assert.equal(typeof response.body.message, 'string');
  }
  const duplicateHeader = header.replace('name', 'customer_id');
  await upload(`${duplicateHeader}\n${valid}`).expect(400);
  await upload(Buffer.from([0xff, 0xfe, 0x01])).expect(400);
  await upload(`${header}\n${valid}\u0000`).expect(400);
  assert.equal((await request(app).get('/api/datasets')).body.length, previous);
});

test('upload byte and row limits are enforced by the server', async () => {
  await upload('x'.repeat(MAX_BYTES + 1)).expect(413);
  const response = await upload(
    `${header}\n${Array.from({ length: 5001 }, () => valid).join('\n')}`,
  ).expect(413);
  assert.equal(response.body.code, 'TOO_MANY_ROWS');
});

test('business validation preserves strings, flags every duplicate, and revalidates related rows', async () => {
  const imported = await upload(`${header}\n${valid}\nC-1,,broken,XX,1e3,`).expect(201);
  assert.equal(imported.body.invalid, 2);
  for (const field of ['customer_id', 'name', 'email', 'country', 'amount'])
    assert.ok(imported.body.rows[1].issues[field]);
  assert.equal(imported.body.rows[1].values.amount, '1e3');
  const changed = await request(app)
    .patch(`/api/datasets/${imported.body.id}/rows/2`)
    .send({
      revision: 1,
      changes: {
        customer_id: 'C-2',
        name: 'Jamie',
        email: 'jamie@example.com',
        country: 'UA',
        amount: '0',
      },
    })
    .expect(200);
  assert.equal(changed.body.invalid, 0);
  assert.deepEqual(changed.body.rows[0].issues, {});
});

test('a stale revision cannot overwrite a newer correction', async () => {
  const { body: dataset } = await upload(`${header}\n${valid}`).expect(201);
  await request(app)
    .patch(`/api/datasets/${dataset.id}/rows/1`)
    .send({ revision: 1, changes: { name: 'New name' } })
    .expect(200);
  await request(app)
    .patch(`/api/datasets/${dataset.id}/rows/1`)
    .send({ revision: 1, changes: { name: 'Stale name' } })
    .expect(409);
  assert.equal(
    (await request(app).get(`/api/datasets/${dataset.id}`)).body.rows[0].values.name,
    'New name',
  );
});

test('patch contracts, missing records, and request types fail predictably', async () => {
  const { body: dataset } = await upload(`${header}\n${valid}`).expect(201);
  const url = `/api/datasets/${dataset.id}/rows/1`;
  for (const body of [
    {},
    { revision: 1, changes: {} },
    { revision: 1, changes: { amount: 12 } },
    { revision: 1, changes: { unknown: 'x' } },
    { revision: -1, changes: { name: 'x' } },
    { revision: 1, changes: { notes: 'a'.repeat(4001) } },
  ]) {
    await request(app).patch(url).send(body).expect(400);
  }
  await request(app).patch(url).set('Content-Type', 'application/json').send('{broken').expect(400);
  await request(app)
    .patch(`/api/datasets/${dataset.id}/rows/99`)
    .send({ revision: 1, changes: { name: 'x' } })
    .expect(404);
  await request(app).get('/api/datasets/missing').expect(404);
  await request(app).get('/api/unknown').expect(404);
  await request(app).post('/api/datasets').send({ csv: valid }).expect(415);
  await request(app)
    .post('/api/datasets')
    .set('Origin', 'https://example.com')
    .set('Content-Type', 'text/csv')
    .send(`${header}\n${valid}`)
    .expect(403);
});

test('BOM, quoted delimiters, escaped quotes, CRLF, and multiline cells survive import/export', async () => {
  const content = `\uFEFF${header}\r\nC-1,"Alex, Jr.",alex@example.com,US,0,"line one\r\nline ""two"""\r\n`;
  const { body: dataset } = await upload(content).expect(201);
  assert.equal(dataset.rows[0].values.name, 'Alex, Jr.');
  assert.equal(dataset.rows[0].values.notes, 'line one\r\nline "two"');
  const exported = await request(app).get(`/api/datasets/${dataset.id}/export`).expect(200);
  assert.deepEqual(parse(exported.text, { bom: true, columns: true })[0], dataset.rows[0].values);
});

test('formula prefixes including whitespace, tabs, and full-width characters are neutralized', () => {
  for (const value of [
    '=1+1',
    '+CMD',
    '-1',
    '@SUM(A1)',
    '  =1',
    '\t=1',
    '\r=1',
    '\n=1',
    '＝1',
    '＋1',
    '－1',
    '＠1',
  ]) {
    const values: Values = {
      customer_id: 'C-1',
      name: 'Alex',
      email: 'alex@example.com',
      country: 'US',
      amount: '0',
      notes: value,
    };
    const parsed = parse(exportCsv([values]), { bom: true, columns: true }) as Values[];
    assert.equal(parsed[0].notes, `'${value}`);
    assert.equal(values.notes, value);
  }
});
