import assert from 'node:assert/strict';
import { runHmacReplaySelfTest } from '../server/middleware/deviceAuth.ts';
import { evaluateDoorAccess } from '../server/services/accessPolicyEngine.ts';
import {
  evaluateCardVerificationStatus,
  validateProfilePhotoDataUrl,
} from '../server/services/cardVerificationPolicy.ts';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function runTests(): Promise<void> {
  const results: { name: string; status: 'PASS' | 'FAIL' }[] = [];

  async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
    try {
      await fn();
      results.push({ name, status: 'PASS' });
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      results.push({ name, status: 'FAIL' });
      console.error(`  [FAIL] ${name}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  console.log('\n1. Cryptographic HMAC-SHA256 & Replay Protection Suite');
  await test('HMAC-SHA256 valid signature, tamper, skew, and nonce replay checks', () => {
    const report = runHmacReplaySelfTest();
    assert.equal(report.allPassed, true);
    assert.equal(report.checks.length, 4);
  });

  console.log('\n2. Smart Door Access Authorization Policy Engine Suite');
  const baseStudent = {
    id: 'stu_001',
    fullName: 'Aarav Kumar',
    registrationNo: 'NL-2611-A1B2',
    status: 'active' as const,
    shiftType: 'morning' as const,
    seatId: 'H1-12',
    hall: 'Hall 1',
    membershipExpiry: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    pendingAmount: 0,
    monthlyFee: 650,
  };

  await test('Grants valid morning shift entry inside window', () => {
    const res = evaluateDoorAccess({
      mode: 'simulator',
      deviceId: 'SIM-GATE-01',
      deviceStatus: 'online',
      antiPassbackEnabled: true,
      direction: 'entry',
      fingerprintId: 'FP-101',
      student: baseStudent,
      isCurrentlyInside: false,
      minutesSinceLastEvent: null,
      policy: { gracePeriodDays: 5, antiPassbackMinutes: 10 },
      simulatedTimeHHMM: '09:15',
    });
    assert.equal(res.decision, 'GRANTED');
    assert.equal(res.attendanceAction, 'CHECK_IN');
    assert.equal(res.hardwareSignals.relayAction, 'PULSE_UNLOCK_5S');
  });

  await test('Denies entry outside shift window (morning student at 15:30)', () => {
    const res = evaluateDoorAccess({
      mode: 'simulator',
      deviceId: 'SIM-GATE-01',
      deviceStatus: 'online',
      antiPassbackEnabled: true,
      direction: 'entry',
      fingerprintId: 'FP-101',
      student: baseStudent,
      isCurrentlyInside: false,
      minutesSinceLastEvent: null,
      policy: { gracePeriodDays: 5, antiPassbackMinutes: 10 },
      simulatedTimeHHMM: '15:30',
    });
    assert.equal(res.decision, 'DENIED');
    assert.equal(res.hardwareSignals.relayAction, 'KEEP_LOCKED');
  });

  await test('Denies entry when anti-passback detects student already inside', () => {
    const res = evaluateDoorAccess({
      mode: 'simulator',
      deviceId: 'SIM-GATE-01',
      deviceStatus: 'online',
      antiPassbackEnabled: true,
      direction: 'entry',
      fingerprintId: 'FP-101',
      student: baseStudent,
      isCurrentlyInside: true,
      minutesSinceLastEvent: 45,
      policy: { gracePeriodDays: 5, antiPassbackMinutes: 10 },
      simulatedTimeHHMM: '09:30',
    });
    assert.equal(res.decision, 'DENIED');
    assert.match(res.reason, /Anti-passback/i);
  });

  await test('Denies entry when membership expired beyond grace period', () => {
    const res = evaluateDoorAccess({
      mode: 'simulator',
      deviceId: 'SIM-GATE-01',
      deviceStatus: 'online',
      antiPassbackEnabled: true,
      direction: 'entry',
      fingerprintId: 'FP-101',
      student: {
        ...baseStudent,
        membershipExpiry: new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10),
      },
      isCurrentlyInside: false,
      minutesSinceLastEvent: null,
      policy: { gracePeriodDays: 5, antiPassbackMinutes: 10 },
      simulatedTimeHHMM: '09:30',
    });
    assert.equal(res.decision, 'DENIED');
    assert.match(res.reason, /expired/i);
  });

  await test('Denies unrecognized biometric template', () => {
    const res = evaluateDoorAccess({
      mode: 'simulator',
      deviceId: 'SIM-GATE-01',
      deviceStatus: 'online',
      antiPassbackEnabled: true,
      direction: 'entry',
      fingerprintId: 'FP-UNKNOWN',
      student: null,
      isCurrentlyInside: false,
      minutesSinceLastEvent: null,
      policy: { gracePeriodDays: 5, antiPassbackMinutes: 10 },
      simulatedTimeHHMM: '09:30',
    });
    assert.equal(res.decision, 'DENIED');
    assert.match(res.reason, /Unrecognized/i);
  });

  await test('Grants valid exit for currently inside student', () => {
    const res = evaluateDoorAccess({
      mode: 'simulator',
      deviceId: 'SIM-GATE-01',
      deviceStatus: 'online',
      antiPassbackEnabled: true,
      direction: 'exit',
      fingerprintId: 'FP-101',
      student: baseStudent,
      isCurrentlyInside: true,
      minutesSinceLastEvent: 60,
      policy: { gracePeriodDays: 5, antiPassbackMinutes: 10 },
      simulatedTimeHHMM: '11:45',
    });
    assert.equal(res.decision, 'GRANTED');
    assert.equal(res.attendanceAction, 'CHECK_OUT');
  });

  console.log('\n3. Live Express Backend HTTP Security & Route Checks');
  await test('GET /api/health returns 200 with 120-seat capacity metadata', async () => {
    const r = await fetch(`${BASE_URL}/api/health`);
    assert.equal(r.status, 200);
    const body = (await r.json()) as {
      library?: { capacity?: { totalSeats?: number; hall1Seats?: number; hall2Seats?: number } };
    };
    assert.equal(body.library?.capacity?.totalSeats, 120);
    assert.equal(body.library?.capacity?.hall1Seats, 80);
    assert.equal(body.library?.capacity?.hall2Seats, 40);
  });

  await test('GET /api/auth/session rejects unauthenticated callers with 401', async () => {
    const r = await fetch(`${BASE_URL}/api/auth/session`);
    assert.equal(r.status, 401);
  });

  await test('GET /api/iot/diagnostics rejects unauthenticated callers with 401', async () => {
    const r = await fetch(`${BASE_URL}/api/iot/diagnostics`);
    assert.equal(r.status, 401);
  });

  await test('POST /api/iot/simulator/authorize rejects forged Bearer token with 401', async () => {
    const r = await fetch(`${BASE_URL}/api/iot/simulator/authorize`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid.forged.token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'simulator' }),
    });
    assert.equal(r.status, 401);
  });

  await test('POST /api/iot/hardware/authorize rejects unsigned hardware payload (401/503)', async () => {
    const r = await fetch(`${BASE_URL}/api/iot/hardware/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: 'entry' }),
    });
    assert.ok(r.status === 401 || r.status === 503, `Expected 401 or 503, got ${r.status}`);
  });

  await test('Unknown /api/* routes return JSON 404 without leaking stack traces', async () => {
    const r = await fetch(`${BASE_URL}/api/does-not-exist`);
    assert.equal(r.status, 404);
    const body = (await r.json()) as { error?: string };
    assert.equal(body.error, 'NOT_FOUND');
  });

  console.log('\n4. Student Profile Photo Magic-Byte Validation & ID Card Policy Suite');
  await test('Accepts genuine JPEG, PNG, and WebP binary signatures', () => {
    const jpegBuf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 0x11)]);
    const pngBuf = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0x22),
    ]);
    const webpBuf = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.alloc(4, 0x00),
      Buffer.from('WEBP', 'ascii'),
      Buffer.alloc(32, 0x33),
    ]);

    const jpegRes = validateProfilePhotoDataUrl(`data:image/jpeg;base64,${jpegBuf.toString('base64')}`);
    const pngRes = validateProfilePhotoDataUrl(`data:image/png;base64,${pngBuf.toString('base64')}`);
    const webpRes = validateProfilePhotoDataUrl(`data:image/webp;base64,${webpBuf.toString('base64')}`);

    assert.equal(jpegRes.ok, true);
    assert.equal(pngRes.ok, true);
    assert.equal(webpRes.ok, true);
  });

  await test('Rejects SVG XSS payloads, mismatched MIME headers, and oversized images', () => {
    const svgRes = validateProfilePhotoDataUrl(
      `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`,
    );
    assert.equal(svgRes.ok, false);

    const fakeJpeg = validateProfilePhotoDataUrl(
      `data:image/jpeg;base64,${Buffer.from('<html><script>alert(1)</script></html>').toString('base64')}`,
    );
    assert.equal(fakeJpeg.ok, false);

    const huge = `data:image/jpeg;base64,${Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(130 * 1024, 0xaa),
    ]).toString('base64')}`;
    const hugeRes = validateProfilePhotoDataUrl(huge);
    assert.equal(hugeRes.ok, false);
  });

  await test('Evaluates ID card verification verdicts: VALID, EXPIRED, INACTIVE, REVOKED, SUPERSEDED, INVALID', () => {
    const refNow = new Date('2026-06-15T12:00:00Z');
    const validCard = {
      cardNumber: 'NLV-2026-TEST0001',
      registrationNo: 'NL-2606-ABCD',
      studentName: 'Priya Kumari',
      membershipType: 'fixed',
      shiftLabel: 'Morning Shift',
      hall: 'Hall 1',
      seatId: 'H1-18',
      membershipExpiry: '2026-07-15',
      studentStatus: 'active',
      cardStatus: 'active',
    };

    assert.equal(evaluateCardVerificationStatus(validCard, refNow).verdict, 'VALID');
    assert.equal(evaluateCardVerificationStatus(validCard, refNow).valid, true);

    assert.equal(
      evaluateCardVerificationStatus({ ...validCard, membershipExpiry: '2026-06-01' }, refNow)
        .verdict,
      'EXPIRED',
    );
    assert.equal(
      evaluateCardVerificationStatus({ ...validCard, studentStatus: 'inactive' }, refNow).verdict,
      'INACTIVE',
    );
    assert.equal(
      evaluateCardVerificationStatus({ ...validCard, cardStatus: 'revoked' }, refNow).verdict,
      'REVOKED',
    );
    assert.equal(
      evaluateCardVerificationStatus({ ...validCard, cardStatus: 'superseded' }, refNow).verdict,
      'REVOKED',
    );
    assert.equal(evaluateCardVerificationStatus(null, refNow).verdict, 'INVALID');
  });

  console.log('\n5. Live Student Photo & ID Card HTTP Security Checks');
  await test('POST /api/students/profile-photo/validate rejects unauthenticated calls with 401', async () => {
    const r = await fetch(`${BASE_URL}/api/students/profile-photo/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'stu_1', photoDataUrl: 'data:image/jpeg;base64,test' }),
    });
    assert.equal(r.status, 401);
  });

  await test('POST /api/id-cards/prepare rejects unauthenticated calls with 401', async () => {
    const r = await fetch(`${BASE_URL}/api/id-cards/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'stu_1', registrationNo: 'NL-2606-0001' }),
    });
    assert.equal(r.status, 401);
  });

  await test('GET /api/id-cards/verify/:cardNumber returns non-PII INVALID for nonexistent card', async () => {
    const r = await fetch(`${BASE_URL}/api/id-cards/verify/NLV-TEST-DOESNOTEXIST`);
    assert.equal(r.status, 200);
    const body = (await r.json()) as {
      verdict?: string;
      valid?: boolean;
      card?: Record<string, unknown> | null;
    };
    assert.equal(body.verdict, 'INVALID');
    assert.equal(body.valid, false);
    assert.equal(body.card ?? null, null);
    assert.equal('phone' in body, false);
    assert.equal('email' in body, false);
  });

  console.log(`\nAll ${results.length} security and integration tests passed.\n`);
}

runTests().catch(() => {
  process.exit(1);
});
