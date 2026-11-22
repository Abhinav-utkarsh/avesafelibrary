import { Router } from 'express';
import { requireVerifiedAuth } from '../middleware/auth.ts';

export const authRouter = Router();

export const LIBRARY_SHIFT_CATALOG = [
  {
    id: 'morning',
    label: 'Morning Shift',
    window: '06:00 AM – 12:00 PM',
    hours: 6,
    defaultFeeNonFixed: 500,
    defaultFeeFixed: 650,
  },
  {
    id: 'noon',
    label: 'Noon Shift',
    window: '12:00 PM – 06:00 PM',
    hours: 6,
    defaultFeeNonFixed: 500,
    defaultFeeFixed: 650,
  },
  {
    id: 'evening',
    label: 'Evening Shift',
    window: '04:00 PM – 10:00 PM',
    hours: 6,
    defaultFeeNonFixed: 550,
    defaultFeeFixed: 700,
  },
  {
    id: 'night',
    label: 'Night Shift',
    window: '10:00 PM – 06:00 AM',
    hours: 8,
    defaultFeeNonFixed: 550,
    defaultFeeFixed: 700,
  },
  {
    id: 'double',
    label: 'Double Shift',
    window: 'Any 2 Consecutive Shifts (12 hrs)',
    hours: 12,
    defaultFeeNonFixed: 900,
    defaultFeeFixed: 1100,
  },
  {
    id: 'triple',
    label: 'Triple Shift',
    window: '18 Hours Extended Access',
    hours: 18,
    defaultFeeNonFixed: 1200,
    defaultFeeFixed: 1450,
  },
  {
    id: 'all_shifts',
    label: 'All Shifts (24/7)',
    window: 'Full 24-Hour Uninterrupted Access',
    hours: 24,
    defaultFeeNonFixed: 1500,
    defaultFeeFixed: 1800,
  },
] as const;

authRouter.get('/shifts', (_req, res) => {
  res.json({
    operatingHours: '24/7',
    shifts: LIBRARY_SHIFT_CATALOG,
  });
});

authRouter.get('/session', requireVerifiedAuth, (req, res) => {
  const user = req.authUser!;
  res.json({
    verified: true,
    user: {
      uid: user.uid,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      isBootstrapAdmin: user.isBootstrapAdmin,
      expiresAt: new Date(user.expiresAt * 1000).toISOString(),
    },
    verifiedAt: new Date().toISOString(),
  });
});
