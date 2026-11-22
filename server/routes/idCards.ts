import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { serverEnv } from '../config/env.ts';
import { requireVerifiedAuth } from '../middleware/auth.ts';
import {
  evaluateCardVerificationStatus,
  type CardVerificationInput,
} from '../services/cardVerificationPolicy.ts';

export const idCardsRouter = Router();

const CARD_NUMBER_REGEX = /^[A-Z0-9_-]{6,40}$/;

const PrepareCardSchema = z.object({
  studentId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  registrationNo: z.string().min(3).max(40).regex(/^[A-Z0-9_-]+$/),
  origin: z.string().url().optional(),
});

interface FirestoreRestValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
}

interface FirestoreRestDoc {
  name?: string;
  fields?: Record<string, FirestoreRestValue>;
}

function readStringField(fields: Record<string, FirestoreRestValue> | undefined, key: string): string {
  return fields?.[key]?.stringValue ?? '';
}

function generateUniqueCardNumber(): string {
  const year = new Date().getFullYear();
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `AVE-${year}-${suffix}`;
}

/**
 * POST /api/id-cards/prepare
 * Generates a collision-resistant Av_eSAFE Library ID card number and clean non-sensitive
 * verification URL (zero PII, zero tokens, zero Firebase credentials).
 */
idCardsRouter.post('/prepare', requireVerifiedAuth, (req, res) => {
  const parsed = PrepareCardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid ID card preparation request.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  const cardNumber = generateUniqueCardNumber();
  const safeOrigin = parsed.data.origin?.replace(/\/+$/, '') || '';
  const verificationPath = `/verify/${cardNumber}`;
  const verificationUrl = safeOrigin ? `${safeOrigin}${verificationPath}` : verificationPath;

  res.json({
    ok: true,
    cardNumber,
    studentId: parsed.data.studentId,
    registrationNo: parsed.data.registrationNo,
    verificationPath,
    verificationUrl,
    preparedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/id-cards/verify/:cardNumber
 * Public non-PII QR verification endpoint.
 * Queries the split /card_verifications/{cardNumber} projection via Firestore REST API
 * (honoring firestore.rules single-document get policy; list is disabled).
 * Returns VALID | EXPIRED | INACTIVE | REVOKED | INVALID without exposing any private PII.
 */
idCardsRouter.get('/verify/:cardNumber', async (req, res) => {
  const rawCardNumber = String(req.params.cardNumber || '').trim().toUpperCase();

  if (!CARD_NUMBER_REGEX.test(rawCardNumber)) {
    res.status(200).json({
      verdict: 'INVALID',
      valid: false,
      reason: 'Card identifier format is invalid.',
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  const fb = serverEnv.firebase;
  if (!fb?.projectId) {
    res.status(503).json({
      error: 'VERIFICATION_UNAVAILABLE',
      message: 'Firebase verification store is not configured.',
    });
    return;
  }

  try {
    const dbId = encodeURIComponent(fb.firestoreDatabaseId || '(default)');
    const docId = encodeURIComponent(rawCardNumber);
    const keyQuery = fb.apiKey ? `?key=${encodeURIComponent(fb.apiKey)}` : '';
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      fb.projectId,
    )}/databases/${dbId}/documents/card_verifications/${docId}${keyQuery}`;

    const upstream = await fetch(firestoreUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (upstream.status === 404) {
      const evaluated = evaluateCardVerificationStatus(null);
      res.status(200).json({
        ...evaluated,
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    if (!upstream.ok) {
      res.status(502).json({
        error: 'VERIFICATION_LOOKUP_FAILED',
        message: 'Unable to reach card verification registry right now.',
      });
      return;
    }

    const doc = (await upstream.json()) as FirestoreRestDoc;
    const fields = doc.fields;

    if (!fields) {
      const evaluated = evaluateCardVerificationStatus(null);
      res.status(200).json({
        ...evaluated,
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    // Extract ONLY non-sensitive public card verification fields
    const record: CardVerificationInput = {
      cardNumber: readStringField(fields, 'cardNumber') || rawCardNumber,
      registrationNo: readStringField(fields, 'registrationNo'),
      studentName: readStringField(fields, 'studentName'),
      membershipType: readStringField(fields, 'membershipType') || 'unseated',
      shiftLabel: readStringField(fields, 'shiftLabel') || 'Standard Shift',
      hall: readStringField(fields, 'hall') || 'Unassigned',
      seatId: readStringField(fields, 'seatId') || undefined,
      membershipExpiry: readStringField(fields, 'membershipExpiry') || undefined,
      studentStatus: readStringField(fields, 'studentStatus') || 'inactive',
      cardStatus: readStringField(fields, 'cardStatus') || 'revoked',
    };

    const evaluated = evaluateCardVerificationStatus(record);

    res.status(200).json({
      ...evaluated,
      checkedAt: new Date().toISOString(),
      card: record,
    });
  } catch {
    res.status(502).json({
      error: 'VERIFICATION_LOOKUP_ERROR',
      message: 'Failed to verify student identity card.',
    });
  }
});
