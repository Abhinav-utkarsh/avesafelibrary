import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Edit3, IdCard, KeyRound, Trash2, X } from 'lucide-react';
import { SHIFT_DEFINITIONS, type StudentRecord, type StudentStatus } from '../../types/domain';
import {
  addDaysIsoDate,
  convertDemoStudentToRegular,
  deleteStudentRecord,
  getDaysUntilExpiry,
  updateStudentStatus,
} from '../../services/studentService';
import { useAuth } from '../../context/AuthContext';
import { formatGenderLabel, StudentAvatar } from '../common/StudentAvatar';
import { WhatsAppButton } from '../common/WhatsAppButton';

interface StudentDetailDrawerProps {
  student: StudentRecord | null;
  onClose: () => void;
  onEdit: (student: StudentRecord) => void;
  onManageCredentials?: (student: StudentRecord) => void;
  onActionComplete: (message: string) => void;
}

export function StudentDetailDrawer({
  student,
  onClose,
  onEdit,
  onManageCredentials,
  onActionComplete,
}: StudentDetailDrawerProps) {
  const { adminProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shiftInfo = student
    ? SHIFT_DEFINITIONS.find((s) => s.id === student.shiftType)
    : undefined;
  const daysLeft = student ? getDaysUntilExpiry(student.membershipExpiry) : null;

  const handleStatusChange = async (nextStatus: StudentStatus) => {
    if (!student || !adminProfile) return;
    setBusy(true);
    setError(null);
    try {
      await updateStudentStatus(student.id, student.fullName, nextStatus, adminProfile, student);
      onActionComplete(`Updated ${student.fullName} status to ${nextStatus}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    } finally {
      setBusy(false);
    }
  };

  const handleConvertDemo = async () => {
    if (!student || !adminProfile) return;
    setBusy(true);
    setError(null);
    try {
      const defaultFee =
        student.seatMode === 'fixed'
          ? (shiftInfo?.defaultFeeFixed ?? 650)
          : (shiftInfo?.defaultFeeNonFixed ?? 500);
      await convertDemoStudentToRegular(student, defaultFee, addDaysIsoDate(30), adminProfile);
      onActionComplete(`Converted ${student.fullName} from Demo to Active Regular admission.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to convert demo student.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!student || !adminProfile) return;
    setBusy(true);
    setError(null);
    try {
      await deleteStudentRecord(student.id, student.fullName, student.registrationNo, adminProfile);
      setConfirmDelete(false);
      onActionComplete(`Removed student record for ${student.fullName} (${student.registrationNo}).`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete record.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {student && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => {
              setConfirmDelete(false);
              onClose();
            }}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
          />

          <motion.aside
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col"
          >
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <StudentAvatar
                  name={student.fullName}
                  photoUrl={student.profilePhotoUrl}
                  gender={student.gender}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {student.registrationNo} · {student.admissionType} admission
                  </p>
                  <h2 className="font-display text-xl font-bold text-[#0B1F3A] dark:text-white mt-0.5 truncate">
                    {student.fullName}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onClose();
                }}
                aria-label="Close student drawer"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              {/* Quick Conversion Banner for Demo Trials */}
              {student.admissionType === 'demo' && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/60 space-y-3">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Active Demo Trial Admission
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                    Convert this trial student directly into a 30-day regular membership with standard shift fee billing.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleConvertDemo}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold hover:bg-[#132E54] transition-colors cursor-pointer"
                  >
                    Convert to Regular Admission
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Status Control */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Membership Status
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['active', 'demo', 'expired', 'suspended', 'inactive'] as StudentStatus[]).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={busy}
                        onClick={() => void handleStatusChange(st)}
                        className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors cursor-pointer ${
                          student.status === st
                            ? 'bg-[#0B1F3A] dark:bg-blue-600 text-white border-[#0B1F3A] dark:border-blue-600'
                            : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {st}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Structured Details List */}
              <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Gender</dt>
                  <dd className="text-slate-900 dark:text-white text-right">
                    {formatGenderLabel(student.gender)}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Date of Birth</dt>
                  <dd className="font-mono text-slate-900 dark:text-white text-right">
                    {student.dateOfBirth || 'Not recorded'}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Exam / Study Batch</dt>
                  <dd className="text-slate-900 dark:text-white text-right font-medium">
                    {student.batchName || 'General (Unassigned)'}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Library ID Card</dt>
                  <dd className="text-right">
                    <span className="font-mono text-xs text-slate-900 dark:text-white block">
                      {student.cardNumber || 'Not issued yet'}
                    </span>
                    <Link
                      to={`/admin/students/id-cards?studentId=${encodeURIComponent(student.id)}`}
                      onClick={onClose}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-sky-400 hover:underline mt-0.5"
                    >
                      <IdCard className="w-3.5 h-3.5" />
                      {student.cardNumber ? 'Preview / Reprint Card' : 'Generate ID Card'}
                    </Link>
                  </dd>
                </div>
                <div className="py-3 flex justify-between items-center gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                      {student.phone}
                    </span>
                    <WhatsAppButton
                      phone={student.phone}
                      label="Chat"
                      size="xs"
                      variant="outline"
                      message={`Hello ${student.fullName}, this is Av_eSAFE Library (Electronic City, Bangalore).`}
                    />
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Portal Account</dt>
                  <dd className="text-right">
                    <span className="text-slate-900 dark:text-white block break-all">
                      {student.email || 'No email set'}
                    </span>
                    <span
                      className={`block text-[11px] font-semibold mt-0.5 ${
                        student.uid
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {student.uid ? 'Login Linked' : 'Login Not Provisioned'}
                    </span>
                    {onManageCredentials && (
                      <button
                        type="button"
                        onClick={() => onManageCredentials(student)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-sky-400 hover:underline mt-1 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Manage Email &amp; Password
                      </button>
                    )}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Shift Plan</dt>
                  <dd className="text-slate-900 dark:text-white text-right">
                    {shiftInfo ? `${shiftInfo.label} (${shiftInfo.window})` : student.shiftType}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Seat Allocation</dt>
                  <dd className="text-slate-900 dark:text-white text-right">
                    {student.seatMode === 'unseated'
                      ? 'Unseated'
                      : `${student.hall} · ${student.seatId || 'No code'} (${student.seatMode.replace('_', ' ')})`}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Membership Expiry</dt>
                  <dd className="font-mono tabular-nums text-right">
                    <span className="text-slate-900 dark:text-white">
                      {student.membershipExpiry || 'Not set'}
                    </span>
                    {daysLeft !== null && (
                      <span
                        className={`block text-xs mt-0.5 ${
                          daysLeft < 0
                            ? 'text-red-600 dark:text-red-400'
                            : daysLeft <= 7
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {daysLeft < 0
                          ? `Overdue by ${Math.abs(daysLeft)} days`
                          : daysLeft === 0
                            ? 'Expires today'
                            : `${daysLeft} days remaining`}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Monthly Fee / Pending</dt>
                  <dd className="font-mono tabular-nums text-right">
                    <span className="text-slate-900 dark:text-white">
                      ₹{student.monthlyFee.toLocaleString('en-IN')}
                    </span>
                    <span
                      className={`block text-xs mt-0.5 ${
                        student.pendingAmount > 0
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {student.pendingAmount > 0
                        ? `Due: ₹${student.pendingAmount.toLocaleString('en-IN')}`
                        : 'No pending dues'}
                    </span>
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Guardian</dt>
                  <dd className="text-slate-900 dark:text-white text-right">
                    {student.guardianName || '—'}
                    {student.guardianPhone ? ` · ${student.guardianPhone}` : ''}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Address</dt>
                  <dd className="text-slate-900 dark:text-white text-right max-w-[240px]">
                    {student.address || '—'}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Biometric Slot</dt>
                  <dd className="font-mono text-slate-900 dark:text-white text-right">
                    {student.fingerprintTemplateId || 'Not enrolled'}
                  </dd>
                </div>
              </dl>

              {/* Delete Confirmation Box */}
              {confirmDelete && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 space-y-3">
                  <p className="text-xs font-semibold text-red-900 dark:text-red-200">
                    Confirm Permanent Deletion
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                    Delete <span className="font-semibold">{student.fullName}</span> ({student.registrationNo}) from Cloud Firestore? This action will be recorded in the audit log.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete()}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      {busy ? 'Deleting...' : 'Yes, Delete Record'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>

              <button
                type="button"
                onClick={() => onEdit(student)}
                className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                Edit Student
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
