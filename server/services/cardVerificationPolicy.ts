export type CardVerificationVerdict = 'VALID' | 'EXPIRED' | 'INACTIVE' | 'REVOKED' | 'INVALID';

export interface CardVerificationInput {
  cardNumber: string;
  registrationNo: string;
  studentName: string;
  membershipType: string;
  shiftLabel: string;
  hall: string;
  seatId?: string;
  membershipExpiry?: string;
  studentStatus: string;
  cardStatus: string;
}

export interface CardVerificationEvaluation {
  verdict: CardVerificationVerdict;
  valid: boolean;
  reason: string;
}

export const MAX_OPTIMIZED_PHOTO_BYTES = 120 * 1024; // 120 KB binary cap for optimized avatar

/**
 * Pure policy evaluator for Av_eSAFE Library Student ID Card QR verification.
 * Evaluates revocation/superseding, inactive/suspended status, and expiry date strictly.
 */
export function evaluateCardVerificationStatus(
  record: CardVerificationInput | null,
  referenceDate: Date = new Date(),
): CardVerificationEvaluation {
  if (!record) {
    return {
      verdict: 'INVALID',
      valid: false,
      reason: 'No Av_eSAFE Library identity card matches this card identifier.',
    };
  }

  if (record.cardStatus === 'revoked') {
    return {
      verdict: 'REVOKED',
      valid: false,
      reason: 'This identity card has been revoked by Av_eSAFE Library administration.',
    };
  }

  if (record.cardStatus === 'superseded') {
    return {
      verdict: 'REVOKED',
      valid: false,
      reason: 'This card was replaced by a newer reissued identity card and is no longer valid.',
    };
  }

  if (record.studentStatus === 'inactive' || record.studentStatus === 'suspended') {
    return {
      verdict: 'INACTIVE',
      valid: false,
      reason: `Student membership is currently ${record.studentStatus}. Please contact the front desk.`,
    };
  }

  if (record.studentStatus === 'expired') {
    return {
      verdict: 'EXPIRED',
      valid: false,
      reason: 'Student library membership has expired. Renewal is required for library access.',
    };
  }

  if (record.membershipExpiry && record.membershipExpiry.trim().length > 0) {
    const parsedExpiry = new Date(`${record.membershipExpiry.slice(0, 10)}T23:59:59.999Z`);
    if (!Number.isNaN(parsedExpiry.getTime()) && parsedExpiry.getTime() < referenceDate.getTime()) {
      return {
        verdict: 'EXPIRED',
        valid: false,
        reason: `Library membership expired on ${record.membershipExpiry.slice(0, 10)}.`,
      };
    }
  }

  if (record.cardStatus === 'active' && (record.studentStatus === 'active' || record.studentStatus === 'demo')) {
    return {
      verdict: 'VALID',
      valid: true,
      reason:
        record.studentStatus === 'demo'
          ? 'Valid Av_eSAFE Library trial/demo student identity card.'
          : 'Verified active Av_eSAFE Library student identity card.',
    };
  }

  return {
    verdict: 'INVALID',
    valid: false,
    reason: 'Card status could not be verified.',
  };
}

export interface ValidatedImagePayload {
  ok: true;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  normalizedDataUrl: string;
}

export interface InvalidImagePayload {
  ok: false;
  error: string;
}

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/**
 * Validates base64 image data URI by decoding binary bytes and checking raw magic signatures:
 * - JPEG: FF D8 FF
 * - PNG:  89 50 4E 47 0D 0A 1A 0A
 * - WebP: RIFF .... WEBP
 * Rejects SVG, HTML, polyglots, mismatched MIME claims, and oversized payloads.
 */
export function validateProfilePhotoDataUrl(
  rawDataUrl: string,
): ValidatedImagePayload | InvalidImagePayload {
  if (typeof rawDataUrl !== 'string' || rawDataUrl.trim().length === 0) {
    return { ok: false, error: 'Image data is required.' };
  }

  if (rawDataUrl.length > 140000) {
    return { ok: false, error: 'Optimized image exceeds the maximum permitted payload size.' };
  }

  const match = DATA_URL_PATTERN.exec(rawDataUrl.trim());
  if (!match) {
    return {
      ok: false,
      error: 'Unsupported image format. Only JPG, JPEG, PNG, and WebP images are permitted.',
    };
  }

  const declaredMime = match[1] as 'image/jpeg' | 'image/png' | 'image/webp';
  const base64Body = match[2];
  const buffer = Buffer.from(base64Body, 'base64');

  if (buffer.length < 16) {
    return { ok: false, error: 'Image payload is corrupted or truncated.' };
  }

  if (buffer.length > MAX_OPTIMIZED_PHOTO_BYTES) {
    return {
      ok: false,
      error: `Optimized image must be ${Math.round(MAX_OPTIMIZED_PHOTO_BYTES / 1024)} KB or smaller.`,
    };
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (
    (declaredMime === 'image/jpeg' && !isJpeg) ||
    (declaredMime === 'image/png' && !isPng) ||
    (declaredMime === 'image/webp' && !isWebp)
  ) {
    return {
      ok: false,
      error: 'Image binary signature does not match the declared file type.',
    };
  }

  return {
    ok: true,
    mimeType: declaredMime,
    sizeBytes: buffer.length,
    normalizedDataUrl: `data:${declaredMime};base64,${buffer.toString('base64')}`,
  };
}
