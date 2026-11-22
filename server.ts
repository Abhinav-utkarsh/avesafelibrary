import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/app.ts';
import { serverEnv } from './server/config/env.ts';

async function startServer(): Promise<void> {
  const app = createApiApp();

  if (!serverEnv.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(503).send('Application build not found.');
      }
    });
  }

  app.listen(serverEnv.port, '0.0.0.0', () => {
    console.log(
      `Av_eSAFE Library Server running on http://0.0.0.0:${serverEnv.port} (${serverEnv.nodeEnv})`,
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start Av_eSAFE Library server:', err);
  process.exit(1);
});
