import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, KeyRound, RefreshCw, X } from 'lucide-react';
import {
  GENDER_OPTIONS,
  SHIFT_DEFINITIONS,
  type AdmissionType,
  type BatchRecord,
  type HallName,
  type SeatMode,
  type ShiftType,
  type StudentGender,
  type StudentRecord,
  type StudentStatus,
} from '../../types/domain';
import {
  addDaysIsoDate,
  createStudentRecord,
  studentFormSchema,
  updateStudentRecord,
} from '../../services/studentService';
import { subscribeBatches } from '../../services/batchService';
import { generateTemporaryPassword } from '../../lib/authProvisioning';
import { setStudentPortalPassword } from '../../lib/studentSessionToken';
import { useAuth } from '../../context/AuthContext';
import { StudentAvatar } from '../common/StudentAvatar';
import { BatchCourseSelector } from '../common/BatchCourseSelector';

export type AdmissionModalMode = AdmissionType | 'edit';

interface StudentAdmissionModalProps {
  open: boolean;
  initialMode: AdmissionModalMode;
  editingStudent?: StudentRecord | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

function getDefaultFee(shiftType: ShiftType, seatMode: SeatMode): number {
  const def = SHIFT_DEFINITIONS.find((s) => s.id === shiftType) || SHIFT_DEFINITIONS[0];
  return seatMode === 'fixed' ? def.defaultFeeFixed : def.defaultFeeNonFixed;
}

export function StudentAdmissionModal({
  open,
  initialMode,
  editingStudent = null,
  onClose,
  onSuccess,
}: StudentAdmissionModalProps) {
  const { adminProfile } = useAuth();
  const isEditing = initialMode === 'edit' && Boolean(editingStudent);

  const [tabMode, setTabMode] = useState<AdmissionType>(
    initialMode === 'edit' ? (editingStudent?.admissionType || 'regular') : initialMode,
  );
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<StudentGender | ''>('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [batchId, setBatchId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [createPortalLogin, setCreatePortalLogin] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [showPortalPassword, setShowPortalPassword] = useState(true);
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [address, setAddress] = useState('');
  const [shiftType, setShiftType] = useState<ShiftType>('morning');
  const [seatMode, setSeatMode] = useState<SeatMode>('unseated');
  const [hall, setHall] = useState<HallName>('Unassigned');
  const [seatId, setSeatId] = useState('');
  const [status, setStatus] = useState<StudentStatus>('active');
  const [monthlyFee, setMonthlyFee] = useState<number>(500);
  const [pendingAmount, setPendingAmount] = useState<number>(500);
  const [membershipExpiry, setMembershipExpiry] = useState<string>(addDaysIsoDate(30));
  const [demoDays, setDemoDays] = useState<number>(3);
  const [fingerprintTemplateId, setFingerprintTemplateId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeBatches(setBatches);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (initialMode === 'edit' && editingStudent) {
      setTabMode(editingStudent.admissionType);
      setFullName(editingStudent.fullName);
      setPhone(editingStudent.phone);
      setEmail(editingStudent.email || '');
      setGender(editingStudent.gender || '');
      setDateOfBirth(editingStudent.dateOfBirth || '');
      setBatchId(editingStudent.batchId || '');
      setBatchName(editingStudent.batchName || '');
      setCreatePortalLogin(false);
      setPortalPassword('');
      setGuardianName(editingStudent.guardianName || '');
      setGuardianPhone(editingStudent.guardianPhone || '');
      setAddress(editingStudent.address || '');
      setShiftType(editingStudent.shiftType);
      setSeatMode(editingStudent.seatMode);
      setHall(editingStudent.hall);
      setSeatId(editingStudent.seatId || '');
      setStatus(editingStudent.status);
      setMonthlyFee(editingStudent.monthlyFee);
      setPendingAmount(editingStudent.pendingAmount);
      setMembershipExpiry(editingStudent.membershipExpiry || addDaysIsoDate(30));
      setFingerprintTemplateId(editingStudent.fingerprintTemplateId || '');
      return;
    }

    const nextTab: AdmissionType = initialMode === 'edit' ? 'regular' : initialMode;
    setTabMode(nextTab);
    setFullName('');
    setPhone('');
    setEmail('');
    setGender('');
    setDateOfBirth('');
    setBatchId('');
    setBatchName('');
    setCreatePortalLogin(false);
    setPortalPassword(generateTemporaryPassword(10));
    setShowPortalPassword(true);
    setGuardianName('');
    setGuardianPhone('');
    setAddress('');
    setShiftType('morning');
    setSeatMode(nextTab === 'demo' ? 'non_fixed' : 'unseated');
    setHall(nextTab === 'demo' ? 'Hall 1' : 'Unassigned');
    setSeatId('');
    setStatus(nextTab === 'demo' ? 'demo' : 'active');
    setDemoDays(3);
    const defaultFee = nextTab === 'demo' ? 0 : getDefaultFee('morning', 'unseated');
    setMonthlyFee(defaultFee);
    setPendingAmount(defaultFee);
    setMembershipExpiry(nextTab === 'demo' ? addDaysIsoDate(3) : addDaysIsoDate(30));
    setFingerprintTemplateId('');
  }, [open, initialMode, editingStudent]);

  const handleTabSwitch = (nextTab: AdmissionType) => {
    setTabMode(nextTab);
    setError(null);
    if (nextTab === 'demo') {
      setStatus('demo');
      setMonthlyFee(0);
      setPendingAmount(0);
      setMembershipExpiry(addDaysIsoDate(demoDays));
      if (seatMode === 'fixed') {
        setSeatMode('non_fixed');
      }
    } else {
      setStatus('active');
      const suggested = getDefaultFee(shiftType, seatMode);
      setMonthlyFee(suggested);
      setPendingAmount(suggested);
      setMembershipExpiry(addDaysIsoDate(30));
    }
  };

  const handleShiftOrSeatModeChange = (nextShift: ShiftType, nextSeatMode: SeatMode) => {
    setShiftType(nextShift);
    setSeatMode(nextSeatMode);
    if (nextSeatMode === 'unseated') {
      setHall('Unassigned');
      setSeatId('');
    } else if (hall === 'Unassigned') {
      setHall('Hall 1');
    }
    if (!isEditing && tabMode !== 'demo') {
      const suggested = getDefaultFee(nextShift, nextSeatMode);
      setMonthlyFee(suggested);
      setPendingAmount(suggested);
    }
  };

  const handleDemoDaysChange = (days: number) => {
    setDemoDays(days);
    setMembershipExpiry(addDaysIsoDate(days));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) {
      setError('Administrator session required to save records.');
      return;
    }

    setError(null);

    const selectedBatch = batches.find((b) => b.id === batchId);
    const trimmedBatchName = batchName.trim();
    if (batchId === 'other' && !trimmedBatchName) {
      setError('Please enter the custom exam or course name for "Other".');
      return;
    }
    const resolvedBatchName = selectedBatch
      ? selectedBatch.name
      : batchId
        ? trimmedBatchName
        : '';

    const candidate = {
      fullName,
      phone,
      email,
      gender,
      dateOfBirth,
      batchId,
      batchName: resolvedBatchName,
      guardianName,
      guardianPhone,
      address,
      admissionType: tabMode,
      status: isEditing ? status : tabMode === 'demo' ? 'demo' : 'active',
      seatMode,
      seatId,
      hall: seatMode === 'unseated' ? 'Unassigned' : hall,
      shiftType,
      membershipExpiry,
      monthlyFee: tabMode === 'demo' && !isEditing ? 0 : Number(monthlyFee),
      pendingAmount: tabMode === 'demo' && !isEditing ? 0 : Number(pendingAmount),
      fingerprintTemplateId,
    };

    const validation = studentFormSchema.safeParse(candidate);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || 'Please check the highlighted form fields.');
      return;
    }

    if (!isEditing && createPortalLogin) {
      if (!portalPassword || portalPassword.length < 6) {
        setError('Portal password must be at least 6 characters.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEditing && editingStudent) {
        await updateStudentRecord(editingStudent.id, validation.data, adminProfile, editingStudent);
        onSuccess?.(`Updated ${validation.data.fullName} (${editingStudent.registrationNo}).`);
      } else {
        const result = await createStudentRecord(validation.data, adminProfile);
        if (createPortalLogin) {
          await setStudentPortalPassword({
            studentId: result.id,
            registrationNo: result.registrationNo,
            email: validation.data.email || '',
            password: portalPassword,
            studentSnapshot: {
              id: result.id,
              uid: '',
              registrationNo: result.registrationNo,
              fullName: validation.data.fullName,
              phone: validation.data.phone,
              email: (validation.data.email || '').trim().toLowerCase(),
              gender: validation.data.gender || undefined,
              dateOfBirth: validation.data.dateOfBirth || '',
              batchId: validation.data.batchId || '',
              batchName: validation.data.batchName || '',
              guardianName: validation.data.guardianName || '',
              guardianPhone: validation.data.guardianPhone || '',
              address: validation.data.address || '',
              admissionType: validation.data.admissionType,
              status: validation.data.status,
              seatMode: validation.data.seatMode,
              seatId: validation.data.seatId || '',
              hall: validation.data.hall,
              shiftType: validation.data.shiftType,
              membershipExpiry: validation.data.membershipExpiry || '',
              monthlyFee: Number(validation.data.monthlyFee),
              pendingAmount: Number(validation.data.pendingAmount),
              fingerprintTemplateId: validation.data.fingerprintTemplateId || '',
            },
          });
        }
        onSuccess?.(
          createPortalLogin
            ? `Registered ${validation.data.fullName} (${result.registrationNo}) with Student Portal password (${validation.data.email || result.registrationNo} / ${portalPassword}).`
            : `Registered ${validation.data.fullName} as ${result.registrationNo} (${tabMode} admission).`,
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save student record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-modal-title"
            className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <StudentAvatar
                  name={fullName || editingStudent?.fullName || 'New Student'}
                  photoUrl={isEditing ? editingStudent?.profilePhotoUrl : undefined}
                  gender={gender || undefined}
                  size="md"
                />
                <div className="min-w-0">
                  <h2
                    id="student-modal-title"
                    className="font-display text-lg font-bold text-[#0B1F3A] dark:text-white truncate"
                  >
                    {isEditing
                      ? `Edit Student · ${editingStudent?.registrationNo}`
                      : 'Student Admission & Registration'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isEditing
                      ? 'Updates persist immediately to Cloud Firestore and append an audit log.'
                      : 'Choose full admission, quick desk intake, or trial demo registration.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Segmented Mode Selector (Create Mode Only) */}
            {!isEditing && (
              <div className="px-6 pt-4">
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
                  {(
                    [
                      { id: 'regular', label: 'Full Admission' },
                      { id: 'quick', label: 'Quick Register' },
                      { id: 'demo', label: 'Demo Trial' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTabSwitch(item.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        tabMode === item.id
                          ? 'bg-white dark:bg-slate-900 text-[#0B1F3A] dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5" noValidate>
              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              {/* Core Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Rahul Kumar Verma"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as StudentGender | '')}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Select gender (optional)</option>
                    {GENDER_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Student Email (links to Student Portal)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@gmail.com (optional)"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <BatchCourseSelector
                    batches={batches}
                    batchId={batchId}
                    batchName={batchName}
                    onChange={({ batchId: nextId, batchName: nextName }) => {
                      setBatchId(nextId);
                      setBatchName(nextName);
                    }}
                    label="Exam Batch / Course (Select or choose Other to enter manually)"
                  />
                </div>
              </div>

              {/* Optional One-Step Student Portal Password Provisioning (Create Mode) */}
              {!isEditing && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <KeyRound className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                      Create Student Portal Email &amp; Password Login Now
                    </span>
                    <input
                      type="checkbox"
                      checked={createPortalLogin}
                      onChange={(e) => setCreatePortalLogin(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#0B1F3A]"
                    />
                  </label>

                  {createPortalLogin && (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                      <div className="sm:col-span-8">
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Initial Portal Password (min 6 chars)
                        </label>
                        <div className="relative">
                          <input
                            type={showPortalPassword ? 'text' : 'password'}
                            value={portalPassword}
                            onChange={(e) => setPortalPassword(e.target.value)}
                            placeholder="Temporary password"
                            className="w-full min-h-[38px] pl-3 pr-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPortalPassword((v) => !v)}
                            aria-label="Toggle password visibility"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          >
                            {showPortalPassword ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="sm:col-span-4 flex items-end">
                        <button
                          type="button"
                          onClick={() => setPortalPassword(generateTemporaryPassword(10))}
                          className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Regenerate
                        </button>
                      </div>
                      <p className="sm:col-span-12 text-[11px] text-slate-500 dark:text-slate-400">
                        Provisions a real Student Portal login for the email above without signing you out. You can also manage or reset student passwords anytime from the Student Directory.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Extended Profile Fields (Full Admission or Edit) */}
              {(tabMode === 'regular' || isEditing) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Guardian Name
                    </label>
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="Parent / Guardian name"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Guardian Phone
                    </label>
                    <input
                      type="tel"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      placeholder="Emergency contact number"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Local Address
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Phase 1 / Phase 2, Electronic City, Bangalore"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              )}

              {/* Shift, Seat Mode & Hall */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Shift Plan *
                  </label>
                  <select
                    value={shiftType}
                    onChange={(e) =>
                      handleShiftOrSeatModeChange(e.target.value as ShiftType, seatMode)
                    }
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {SHIFT_DEFINITIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.window})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Seat Mode *
                  </label>
                  <select
                    value={seatMode}
                    onChange={(e) =>
                      handleShiftOrSeatModeChange(shiftType, e.target.value as SeatMode)
                    }
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="unseated">Unseated (Assign later)</option>
                    <option value="non_fixed">Non-Fixed Seat</option>
                    <option value="fixed">Fixed Reserved Seat</option>
                  </select>
                </div>

                {seatMode !== 'unseated' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Study Hall
                      </label>
                      <select
                        value={hall === 'Unassigned' ? 'Hall 1' : hall}
                        onChange={(e) => setHall(e.target.value as HallName)}
                        className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="Hall 1">Hall 1 (80 seats)</option>
                        <option value="Hall 2">Hall 2 (40 seats)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Seat Reference (optional)
                      </label>
                      <input
                        type="text"
                        value={seatId}
                        onChange={(e) => setSeatId(e.target.value.toUpperCase())}
                        placeholder={hall === 'Hall 2' ? 'e.g. H2-04' : 'e.g. H1-12'}
                        className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Fee & Expiry Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                {tabMode === 'demo' && !isEditing ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Demo Trial Length
                      </label>
                      <select
                        value={demoDays}
                        onChange={(e) => handleDemoDaysChange(Number(e.target.value))}
                        className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value={1}>1 Day Trial</option>
                        <option value={2}>2 Days Trial</option>
                        <option value={3}>3 Days Trial</option>
                        <option value={7}>7 Days Trial</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Trial Expiry Date
                      </label>
                      <input
                        type="date"
                        value={membershipExpiry}
                        onChange={(e) => setMembershipExpiry(e.target.value)}
                        className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Monthly Fee (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        value={monthlyFee}
                        onChange={(e) => setMonthlyFee(Number(e.target.value))}
                        className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Pending Balance (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={500000}
                        value={pendingAmount}
                        onChange={(e) => setPendingAmount(Number(e.target.value))}
                        className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Membership Expiry
                      </label>
                      <input
                        type="date"
                        value={membershipExpiry}
                        onChange={(e) => setMembershipExpiry(e.target.value)}
                        className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </>
                )}

                {isEditing && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Account Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as StudentStatus)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="active">Active</option>
                      <option value="demo">Demo Trial</option>
                      <option value="expired">Expired</option>
                      <option value="suspended">Suspended</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}

                {(tabMode === 'regular' || isEditing) && (
                  <div className={isEditing ? 'sm:col-span-2' : 'sm:col-span-3'}>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Biometric / R307 Fingerprint Slot ID (optional)
                    </label>
                    <input
                      type="text"
                      value={fingerprintTemplateId}
                      onChange={(e) => setFingerprintTemplateId(e.target.value)}
                      placeholder="e.g. FP-042"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  {submitting
                    ? 'Saving...'
                    : isEditing
                      ? 'Save Changes'
                      : tabMode === 'demo'
                        ? 'Create Demo Trial'
                        : tabMode === 'quick'
                          ? 'Complete Quick Register'
                          : 'Confirm Full Admission'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
