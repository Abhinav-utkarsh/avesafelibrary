import { Router } from 'express';
import { z } from 'zod';
import { requireVerifiedAuth } from '../middleware/auth.ts';
import { validateProfilePhotoDataUrl } from '../services/cardVerificationPolicy.ts';

export const studentsRouter = Router();

const ValidatePhotoSchema = z.object({
  studentId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  studentUid: z.string().max(128).optional(),
  photoDataUrl: z.string().min(20).max(140000),
});

const AuthorizePhotoRemovalSchema = z.object({
  studentId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  studentUid: z.string().max(128).optional(),
});

/**
 * POST /api/students/profile-photo/validate
 * Verifies authenticated Firebase identity, ensures student ownership (unless admin),
 * inspects binary image magic bytes (JPG/PNG/WebP), enforces size caps, and returns
 * a sanitized normalized data URI ready for Firestore persistence.
 */
studentsRouter.post('/profile-photo/validate', requireVerifiedAuth, (req, res) => {
  const parsed = ValidatePhotoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid profile photo upload request.',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  const user = req.authUser!;
  const { studentId, studentUid, photoDataUrl } = parsed.data;

  // Enforce ownership: if a studentUid is provided and caller is not bootstrap admin,
  // caller UID must match studentUid. Firestore rules also enforce this strictly at DB layer.
  if (studentUid && studentUid !== user.uid && !user.isBootstrapAdmin) {
    res.status(403).json({
      error: 'FORBIDDEN_STUDENT_PHOTO',
      message: 'You are not authorized to modify another student profile photograph.',
    });
    return;
  }

  const result = validateProfilePhotoDataUrl(photoDataUrl);
  if (!result.ok) {
    res.status(400).json({
      error: 'INVALID_IMAGE',
      message: result.error,
    });
    return;
  }

  res.json({
    ok: true,
    studentId,
    validatedPhotoUrl: result.normalizedDataUrl,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    validatedAt: new Date().toISOString(),
  });
});

/**
 * DELETE /api/students/profile-photo/authorize
 * Authorizes a student (or administrator) to remove their profile photograph.
 */
studentsRouter.delete('/profile-photo/authorize', requireVerifiedAuth, (req, res) => {
  const parsed = AuthorizePhotoRemovalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid profile photo removal request.',
    });
    return;
  }

  const user = req.authUser!;
  const { studentId, studentUid } = parsed.data;

  if (studentUid && studentUid !== user.uid && !user.isBootstrapAdmin) {
    res.status(403).json({
      error: 'FORBIDDEN_STUDENT_PHOTO',
      message: 'You are not authorized to remove another student profile photograph.',
    });
    return;
  }

  res.json({
    ok: true,
    studentId,
    authorizedBy: user.uid,
    authorizedAt: new Date().toISOString(),
  });
});
