import { Router } from 'express';
import { serverEnv } from '../config/env.ts';
import { adminSdkStatus } from '../config/firebaseAdmin.ts';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    service: 'Av_eSAFE Library Management System API',
    status: 'operational',
    timestamp: new Date().toISOString(),
    library: {
      name: 'Av_eSAFE Library',
      location: 'Electronic City, Bangalore',
      operatingHours: '24/7',
      capacity: {
        totalSeats: 120,
        hall1Seats: 80,
        hall2Seats: 40,
      },
    },
    integrations: {
      firebaseConfigured: Boolean(serverEnv.firebase?.projectId),
      tokenVerificationReady: adminSdkStatus.tokenVerificationReady,
      smartDoorHardware: serverEnv.iotHmacConfigured ? 'configured' : 'not_configured_simulator_only',
    },
  });
});
