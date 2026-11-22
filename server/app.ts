import 'dotenv/config';
import express from 'express';
import { serverEnv } from './config/env.ts';
import { authRouter } from './routes/auth.ts';
import { healthRouter } from './routes/health.ts';
import { idCardsRouter } from './routes/idCards.ts';
import { iotRouter } from './routes/iot.ts';
import {
  adminAuthRouter,
  adminPortalRouter,
  studentPublicRouter,
} from './routes/adminAuthAndPortal.ts';
import { studentAuthRouter, studentPortalRouter } from './routes/studentAuth.ts';
import { studentsRouter } from './routes/students.ts';
import type { RawBodyRequest } from './middleware/deviceAuth.ts';

export function createApiApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '4mb',
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = buf.toString('utf8');
      },
    }),
  );

  // Explicit security headers compatible with iframe preview & Vercel hosting
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const origin = req.headers.origin;
    if (origin && serverEnv.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization,Content-Type,X-Device-Id,X-Timestamp,X-Nonce,X-Signature',
      );
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // API Routes
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin-auth', adminAuthRouter);
  app.use('/api/admin-portal', adminPortalRouter);
  app.use('/api/student-public', studentPublicRouter);
  app.use('/api/student-auth', studentAuthRouter);
  app.use('/api/student-portal', studentPortalRouter);
  app.use('/api/iot', iotRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/id-cards', idCardsRouter);

  // Unknown API route guard
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'API endpoint does not exist.',
    });
  });

  return app;
}
