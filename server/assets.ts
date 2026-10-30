import { extname } from 'node:path';
import type { Express } from 'express';

export function mountAssets(app: Express, keys: string[], readAsset: (key: string) => Buffer) {
  const assets = new Set(keys);
  app.get('/{*path}', (req, res) => {
    const key = req.path === '/' ? 'index.html' : req.path.slice(1);
    if (!assets.has(key)) {
      res.status(404).type('text').send('File not found.');
      return;
    }
    res.type(extname(key) || 'application/octet-stream').send(readAsset(key));
  });
}
