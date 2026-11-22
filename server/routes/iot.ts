import { Router } from 'express';
import { z } from 'zod';
import { serverEnv } from '../config/env.ts';
import { requireVerifiedAuth } from '../middleware/auth.ts';
import {
  getReplayCacheSize,
  MAX_CLOCK_SKEW_SECONDS,
  runHmacReplaySelfTest,
  verifyDeviceHmac,
  type RawBodyRequest,
} from '../middleware/deviceAuth.ts';
import {
  accessEvaluationSchema,
  evaluateDoorAccess,
} from '../services/accessPolicyEngine.ts';

export const iotRouter = Router();

const hardwareHeartbeatSchema = z.object({
  firmwareVersion: z.string().trim().min(1).max(40),
  doorContactState: z.enum(['closed', 'open', 'ajar']),
  lockRelayState: z.enum(['locked', 'unlocked']),
  r307SensorReady: z.boolean(),
  wifiRssiDbm: z.number().min(-120).max(0).optional(),
  uptimeSeconds: z.number().min(0).optional(),
});

/**
 * Authenticated Diagnostics & Hardware Architecture Specification Endpoint.
 */
iotRouter.get('/diagnostics', requireVerifiedAuth, (_req, res) => {
  res.json({
    hardwareStatus: serverEnv.iotHmacConfigured
      ? 'configured_awaiting_device_heartbeat'
      : 'not_configured_simulator_only',
    hmacKeyConfigured: serverEnv.iotHmacConfigured,
    replayProtection: {
      algorithm: 'HMAC-SHA256',
      clockSkewToleranceSeconds: MAX_CLOCK_SKEW_SECONDS,
      activeNonceCacheEntries: getReplayCacheSize(),
      canonicalFormat: 'METHOD\\nPATH\\nX-Device-Id\\nX-Timestamp\\nX-Nonce\\nSHA256(body)',
    },
    emergencyExitPolicy: {
      softwareIndependent: true,
      wiringRequirement:
        'Physical NC break-glass / push-to-exit switch wired directly in series with 12V magnetic lock power supply (fail-safe). Must unlock immediately on press or power loss regardless of ESP32, Wi-Fi, Express server, or Firebase status.',
    },
    hardwareArchitecture: [
      { component: 'ESP32-WROOM-32', role: 'Wi-Fi TLS controller, HMAC-SHA256 signing & UART bridge' },
      { component: 'R307 Optical Fingerprint Sensor', role: 'Local template matching (UART 57600 baud) returning numeric template ID' },
      { component: '12V Magnetic Door Lock (Fail-Safe)', role: '280kg holding force; releases automatically on power cut or emergency exit' },
      { component: '5V Optocoupler Relay Module', role: '5-second unlock pulse driven by authorized backend response only' },
      { component: 'Magnetic Door Contact Reed Switch', role: 'Detects physical closed / open / forced-ajar door states' },
      { component: 'Entry / Exit Push Button', role: 'Request-to-exit trigger and hardwired emergency power break' },
      { component: '16x2 I2C LCD + Piezo Buzzer + Dual LEDs', role: 'Real-time student feedback (Granted / Denied reason, Green/Red LED, beep codes)' },
    ],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Strictly Isolated Software Simulator Authorization Endpoint (Admin Portal).
 * Executes the exact same server-side access policy engine as live hardware,
 * tagged explicitly with mode: 'simulator'.
 */
iotRouter.post('/simulator/authorize', requireVerifiedAuth, (req, res) => {
  try {
    const parsed = accessEvaluationSchema.parse({
      ...req.body,
      mode: 'simulator', // Force simulator isolation regardless of client payload
    });
    const decision = evaluateDoorAccess(parsed);
    res.json({
      simulatedOnly: true,
      physicalHardwareActuated: false,
      result: decision,
    });
  } catch (err) {
    res.status(400).json({
      error: 'INVALID_SIMULATOR_PAYLOAD',
      message: err instanceof Error ? err.message : 'Invalid simulation payload.',
    });
  }
});

/**
 * Ephemeral HMAC-SHA256 & Replay Protection Self-Test (Admin Diagnostics).
 */
iotRouter.post('/simulator/hmac-test', requireVerifiedAuth, (_req, res) => {
  const report = runHmacReplaySelfTest();
  res.json(report);
});

/**
 * Live ESP32 Hardware Authorization Endpoint (HMAC-SHA256 + Replay Protected).
 * Rejects with 503 HARDWARE_NOT_CONFIGURED until IOT_HMAC_SECRET_KEY is provisioned.
 */
iotRouter.post('/hardware/authorize', verifyDeviceHmac, (req: RawBodyRequest, res) => {
  try {
    const parsed = accessEvaluationSchema.parse({
      ...req.body,
      mode: 'hardware',
      deviceId: req.iotDevice?.deviceId || req.body?.deviceId,
      simulatedTimeHHMM: undefined, // Never allow simulated clock override on live hardware
    });
    const decision = evaluateDoorAccess(parsed);
    res.json({
      simulatedOnly: false,
      verifiedDeviceId: req.iotDevice?.deviceId,
      result: decision,
    });
  } catch (err) {
    res.status(400).json({
      error: 'INVALID_HARDWARE_PAYLOAD',
      message: err instanceof Error ? err.message : 'Invalid hardware authorization payload.',
    });
  }
});

/**
 * Live ESP32 Hardware Heartbeat & Sensor Diagnostics Endpoint.
 */
iotRouter.post('/hardware/heartbeat', verifyDeviceHmac, (req: RawBodyRequest, res) => {
  const parsed = hardwareHeartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'INVALID_HEARTBEAT_PAYLOAD',
      message: parsed.error.issues[0]?.message || 'Invalid heartbeat fields.',
    });
    return;
  }

  res.json({
    acknowledged: true,
    deviceId: req.iotDevice?.deviceId,
    serverTimestamp: new Date().toISOString(),
    telemetry: parsed.data,
  });
});
