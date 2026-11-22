import type { NextFunction, Request, Response } from 'express';
import { serverEnv } from '../config/env.ts';
import { verifyFirebaseIdToken } from '../config/firebaseAdmin.ts';

export interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
  isBootstrapAdmin: boolean;
  authTime: number;
  expiresAt: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: VerifiedAuthUser;
    }
  }
}

export async function verifyBearerFirebaseUser(token: string): Promise<VerifiedAuthUser> {
  const decoded = await verifyFirebaseIdToken(token);
  const email = (decoded.email || '').trim().toLowerCase();

  if (!email) {
    throw new Error('EMAIL_REQUIRED');
  }

  const emailVerified = Boolean(decoded.email_verified);

  return {
    uid: decoded.uid,
    email,
    emailVerified,
    name: typeof decoded.name === 'string' ? decoded.name : email.split('@')[0],
    picture: typeof decoded.picture === 'string' ? decoded.picture : undefined,
    isBootstrapAdmin: emailVerified && email === serverEnv.adminBootstrapEmail,
    authTime: decoded.auth_time,
    expiresAt: decoded.exp,
  };
}

export async function requireVerifiedAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization Bearer token.',
      });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token || token.length > 8192) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid authentication token.',
      });
      return;
    }

    const verifiedUser = await verifyBearerFirebaseUser(token);
    req.authUser = verifiedUser;
    next();
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_REQUIRED') {
      res.status(403).json({
        error: 'EMAIL_REQUIRED',
        message: 'A valid account email address is required to access Av_eSAFE Library portals.',
      });
      return;
    }
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Authentication token could not be verified or has expired.',
    });
  }
}
