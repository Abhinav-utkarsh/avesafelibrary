import { useEffect, useRef } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { apiRequest } from '../lib/api';
import { isPasswordAdminSessionActive } from '../lib/adminSessionToken';
import { serializeRecordForMirror } from '../lib/studentSessionToken';
import type { AdminProfile } from '../types/domain';

interface PendingAction {
  id: string;
  type:
    | 'profile_update'
    | 'notification_read'
    | 'payment_proof_create'
    | 'ticket_create'
    | 'ticket_close'
    | 'approval_request_create'
    | 'admin_notice_create'
    | 'admin_notification_create'
    | 'admin_batch_upsert'
    | 'admin_student_upsert'
    | 'admin_approval_update';
  studentId: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

/**
 * Runs silently inside AdminLayout while a Firebase-authenticated administrator is signed in:
 * 1. Mirrors live Firestore collections to the Express backend so students signed in
 *    with Admin-set passwords, Password-authenticated Admins, and the Public Registration
 *    Seat Picker always see fresh records without weakening Firestore security rules.
 * 2. Flushes queued student self-service actions, public registration applications,
 *    and Password-Admin actions back into Cloud Firestore.
 */
export function useStudentPortalMirrorSync(adminProfile: AdminProfile | null): void {
  const stateRef = useRef<{
    admins?: Record<string, unknown>[];
    students?: Record<string, unknown>[];
    seats?: Record<string, unknown>[];
    batches?: Record<string, unknown>[];
    payments?: Record<string, unknown>[];
    memberships?: Record<string, unknown>[];
    expenses?: Record<string, unknown>[];
    attendance?: Record<string, unknown>[];
    notices?: Record<string, unknown>[];
    notifications?: Record<string, unknown>[];
    verifications?: Record<string, unknown>[];
    tickets?: Record<string, unknown>[];
    messageTemplates?: Record<string, unknown>[];
    approvalRequests?: Record<string, unknown>[];
    auditLogs?: Record<string, unknown>[];
    libraryInfo?: Record<string, unknown> | null;
  }>({});

  const timerRef = useRef<number | null>(null);
  const flushingRef = useRef(false);
  const failedAttemptsRef = useRef<Map<string, { count: number; nextRetryAt: number }>>(new Map());
  const adminUid = adminProfile?.uid || '';
  const adminUidRef = useRef(adminUid);
  adminUidRef.current = adminUid;

  useEffect(() => {
    // Only a Firebase-authenticated Admin has direct Firestore SDK read/write access
    if (!adminUid || isPasswordAdminSessionActive()) return;

    const drainPendingActions = async (actions: PendingAction[]) => {
      if (flushingRef.current || actions.length === 0) return;
      flushingRef.current = true;
      const completedIds: string[] = [];
      const now = Date.now();

      try {
        for (const action of actions) {
          const failureState = failedAttemptsRef.current.get(action.id);
          if (failureState && now < failureState.nextRetryAt) {
            continue;
          }
          try {
            const p = action.payload || {};
            if (action.type === 'profile_update' && action.studentId) {
              const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
              if (typeof p.gender === 'string' && p.gender) updates.gender = p.gender;
              if (typeof p.dateOfBirth === 'string') updates.dateOfBirth = p.dateOfBirth;
              if (typeof p.profilePhotoUrl === 'string') {
                updates.profilePhotoUrl = p.profilePhotoUrl;
                updates.profilePhotoUpdatedAt = serverTimestamp();
              }
              await updateDoc(doc(db, 'students', action.studentId), updates);
              completedIds.push(action.id);
            } else if (action.type === 'notification_read') {
              const notifId = String(p.notificationId || '');
              if (notifId && !notifId.startsWith('ntf_')) {
                await updateDoc(doc(db, 'notifications', notifId), {
                  read: true,
                  updatedAt: serverTimestamp(),
                });
              }
              completedIds.push(action.id);
            } else if (action.type === 'payment_proof_create') {
              await addDoc(collection(db, 'online_payment_verifications'), {
                studentId: String(p.studentId || action.studentId),
                studentUid: String(p.studentUid || ''),
                studentName: String(p.studentName || ''),
                registrationNo: String(p.registrationNo || ''),
                phone: String(p.studentPhone || p.phone || ''),
                billingMonth: String(p.billingMonth || ''),
                amount: Number(p.amount || 0),
                paymentMethod: String(p.paymentMethod || 'upi'),
                utrReference: String(p.utrReference || ''),
                payerName: String(p.payerName || ''),
                notes: String(p.notes || ''),
                status: 'pending',
                receiptNo: '',
                reviewedBy: '',
                reviewNote: '',
                submittedByRole: 'student',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              completedIds.push(action.id);
            } else if (action.type === 'ticket_create') {
              await addDoc(collection(db, 'student_tickets'), {
                ticketNo: String(p.ticketNo || `TKT-${Date.now()}`),
                studentId: String(p.studentId || action.studentId),
                studentUid: String(p.studentUid || ''),
                studentName: String(p.studentName || ''),
                registrationNo: String(p.registrationNo || ''),
                phone: String(p.studentPhone || p.phone || ''),
                category: String(p.category || 'other'),
                priority: String(p.priority || 'normal'),
                subject: String(p.subject || ''),
                description: String(p.description || ''),
                status: 'open',
                adminReply: '',
                repliedBy: '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              completedIds.push(action.id);
            } else if (action.type === 'ticket_close') {
              const ticketId = String(p.ticketId || '');
              if (ticketId && !ticketId.startsWith('tkt_')) {
                await updateDoc(doc(db, 'student_tickets', ticketId), {
                  status: 'closed',
                  updatedAt: serverTimestamp(),
                });
              }
              completedIds.push(action.id);
            } else if (action.type === 'approval_request_create') {
              const reqDocId = String(p.id || `req_${Date.now().toString(36)}`)
                .trim()
                .replace(/[^a-zA-Z0-9_\-]/g, '_')
                .slice(0, 128);
              const refNo = String(p.referenceNo || reqDocId)
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9_\-]/g, '-')
                .slice(0, 40);
              const alreadySynced = (stateRef.current.approvalRequests || []).some(
                (r) =>
                  String(r.id || '') === reqDocId ||
                  String(r.referenceNo || '').toUpperCase() === refNo,
              );
              if (!alreadySynced) {
                const genderVal = String(p.gender || '').trim();
                const currentHallVal = String(p.currentHall || '').trim();
                const currentSeatModeVal = String(p.currentSeatMode || '').trim();
                const currentShiftVal = String(p.currentShiftType || '').trim();

                const docData: Record<string, unknown> = {
                  referenceNo: refNo,
                  requestType: String(p.requestType || 'new_registration'),
                  status: String(p.status || 'pending'),
                  studentId: String(p.studentId || ''),
                  studentUid: String(p.studentUid || ''),
                  registrationNo: String(p.registrationNo || ''),
                  fullName: String(p.fullName || '').trim().slice(0, 120),
                  phone: String(p.phone || '').trim().slice(0, 20),
                  email: String(p.email || '').trim().slice(0, 160),
                  dateOfBirth: String(p.dateOfBirth || '').trim().slice(0, 20),
                  guardianName: String(p.guardianName || '').trim().slice(0, 120),
                  guardianPhone: String(p.guardianPhone || '').trim().slice(0, 20),
                  address: String(p.address || '').trim().slice(0, 300),
                  batchId: String(p.batchId || '').trim().slice(0, 128),
                  batchName: String(p.batchName || '').trim().slice(0, 100),
                  currentSeatId: String(p.currentSeatId || '').trim().slice(0, 40),
                  requestedHall: String(p.requestedHall || 'Unassigned'),
                  requestedSeatId: String(p.requestedSeatId || '').trim().slice(0, 40),
                  requestedSeatMode: String(p.requestedSeatMode || 'unseated'),
                  requestedShiftType: String(p.requestedShiftType || 'morning'),
                  doublePresetId: String(p.doublePresetId || 'morning_noon').slice(0, 40),
                  estimatedMonthlyFee: Number(p.estimatedMonthlyFee || 0),
                  hasPortalPassword: Boolean(p.hasPortalPassword),
                  reason: String(p.reason || '').trim().slice(0, 500),
                  reviewedBy: String(p.reviewedBy || '').slice(0, 128),
                  reviewNote: String(p.reviewNote || '').slice(0, 400),
                  approvedStudentId: String(p.approvedStudentId || '').slice(0, 128),
                  approvedRegistrationNo: String(p.approvedRegistrationNo || '').slice(0, 40),
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                };
                if (genderVal) docData.gender = genderVal;
                if (currentHallVal) docData.currentHall = currentHallVal;
                if (currentSeatModeVal) docData.currentSeatMode = currentSeatModeVal;
                if (currentShiftVal) docData.currentShiftType = currentShiftVal;

                await setDoc(doc(db, 'student_approval_requests', reqDocId), docData);
              }
              completedIds.push(action.id);
            } else if (action.type === 'admin_notice_create') {
              await addDoc(collection(db, 'notices'), {
                title: String(p.title || ''),
                body: String(p.body || ''),
                category: String(p.category || 'general'),
                priority: String(p.priority || 'normal'),
                audience: String(p.audience || 'all'),
                published: p.published !== false,
                publishedBy: String(p.publishedBy || adminUidRef.current),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              completedIds.push(action.id);
            } else if (action.type === 'admin_notification_create') {
              await addDoc(collection(db, 'notifications'), {
                recipientUid: String(p.recipientUid || ''),
                recipientRole: String(p.recipientRole || 'student'),
                title: String(p.title || ''),
                message: String(p.message || ''),
                type: String(p.type || 'info'),
                read: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              completedIds.push(action.id);
            } else if (action.type === 'admin_batch_upsert') {
              const batchId = String(p.id || '');
              const docPayload = {
                name: String(p.name || ''),
                code: String(p.code || 'BATCH'),
                category: String(p.category || 'general'),
                targetExam: String(p.targetExam || ''),
                description: String(p.description || ''),
                active: p.active !== false,
                createdBy: String(p.createdBy || adminUidRef.current),
                updatedAt: serverTimestamp(),
              };
              if (batchId && !batchId.startsWith('bat_')) {
                await updateDoc(doc(db, 'batches', batchId), docPayload);
              } else {
                await addDoc(collection(db, 'batches'), {
                  ...docPayload,
                  createdAt: serverTimestamp(),
                });
              }
              completedIds.push(action.id);
            } else if (action.type === 'admin_approval_update') {
              const reqId = String(p.id || '');
              if (reqId) {
                await updateDoc(doc(db, 'student_approval_requests', reqId), {
                  status: String(p.status || 'pending'),
                  reviewedBy: String(p.reviewedBy || adminUidRef.current),
                  reviewNote: String(p.reviewNote || ''),
                  approvedStudentId: String(p.approvedStudentId || ''),
                  approvedRegistrationNo: String(p.approvedRegistrationNo || ''),
                  updatedAt: serverTimestamp(),
                });
              }
              completedIds.push(action.id);
            } else if (action.type === 'admin_student_upsert') {
              const studentId = String(p.id || '');
              if (studentId && !studentId.startsWith('stu_')) {
                const { id: _ignored, createdAt: _c, updatedAt: _u, ...rest } = p;
                await updateDoc(doc(db, 'students', studentId), {
                  ...rest,
                  updatedAt: serverTimestamp(),
                });
              }
              completedIds.push(action.id);
            }
            failedAttemptsRef.current.delete(action.id);
          } catch (actionErr) {
            const prev = failedAttemptsRef.current.get(action.id)?.count || 0;
            const nextCount = prev + 1;
            const backoffMs = Math.min(60000, 5000 * Math.pow(2, nextCount - 1));
            failedAttemptsRef.current.set(action.id, {
              count: nextCount,
              nextRetryAt: Date.now() + backoffMs,
            });
            console.warn(
              `[mirror-sync] Failed to flush queued action "${action.type}" (${action.id}); retrying in ${Math.round(backoffMs / 1000)}s:`,
              actionErr,
            );
          }
        }

        if (completedIds.length > 0) {
          await apiRequest('/api/student-auth/ack-actions', {
            method: 'POST',
            requireAuth: true,
            body: JSON.stringify({ actionIds: completedIds }),
          }).catch(() => undefined);
        }
      } finally {
        flushingRef.current = false;
      }
    };

    const scheduleSync = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(async () => {
        timerRef.current = null;
        try {
          const res = await apiRequest<{
            ok: boolean;
            pendingActions?: PendingAction[];
          }>('/api/student-auth/sync-snapshot', {
            method: 'POST',
            requireAuth: true,
            body: JSON.stringify(stateRef.current),
          });
          if (res.pendingActions && res.pendingActions.length > 0) {
            await drainPendingActions(res.pendingActions);
          }
        } catch {
          // Ignore transient network errors during background mirror sync
        }
      }, 900);
    };

    // Poll periodically as well so public registrations submitted while no Firestore edits occurred
    // are drained into Firestore within seconds.
    const periodicTimer = window.setInterval(() => {
      scheduleSync();
    }, 10000);

    const subscribeCol = (
      colName: string,
      targetKey: keyof typeof stateRef.current,
    ) =>
      onSnapshot(
        collection(db, colName),
        (snap) => {
          // Ignore latency-compensated local writes so optimistic updates/rollbacks
          // never trigger redundant sync storms.
          if (snap.metadata.hasPendingWrites) return;
          const rows = snap.docs.map((d) =>
            serializeRecordForMirror({ id: d.id, ...(d.data() as Record<string, unknown>) }),
          );
          (stateRef.current as Record<string, unknown>)[targetKey] = rows;
          scheduleSync();
        },
        () => {
          // Ignore permission errors for collections outside a restricted role's scope
        },
      );

    const unsubs = [
      subscribeCol('admins', 'admins'),
      subscribeCol('students', 'students'),
      subscribeCol('seats', 'seats'),
      subscribeCol('batches', 'batches'),
      subscribeCol('payments', 'payments'),
      subscribeCol('memberships', 'memberships'),
      subscribeCol('expenses', 'expenses'),
      subscribeCol('attendance', 'attendance'),
      subscribeCol('notices', 'notices'),
      subscribeCol('notifications', 'notifications'),
      subscribeCol('online_payment_verifications', 'verifications'),
      subscribeCol('student_tickets', 'tickets'),
      subscribeCol('message_templates', 'messageTemplates'),
      subscribeCol('student_approval_requests', 'approvalRequests'),
      subscribeCol('audit_logs', 'auditLogs'),
      onSnapshot(
        doc(db, 'settings', 'library_config'),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          stateRef.current.libraryInfo = snap.exists()
            ? serializeRecordForMirror(snap.data() as Record<string, unknown>)
            : null;
          scheduleSync();
        },
        () => undefined,
      ),
    ];

    return () => {
      window.clearInterval(periodicTimer);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      unsubs.forEach((u) => u());
    };
  }, [adminUid]);
}
