import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Armchair,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { BatchCourseSelector } from '../../components/common/BatchCourseSelector';
import { InteractiveSeatPicker } from '../../components/common/InteractiveSeatPicker';
import {
  checkPublicApplicationStatus,
  fetchPublicRegistrationCatalog,
  submitPublicStudentRegistration,
  type PublicApplicationStatusResponse,
  type PublicRegistrationCatalog,
} from '../../lib/adminSessionToken';
import { DOUBLE_SHIFT_PRESETS } from '../../services/seatService';
import { getDefaultMonthlyFee } from '../../services/approvalService';
import {
  GENDER_OPTIONS,
  SHIFT_DEFINITIONS,
  type HallName,
  type SeatMode,
  type ShiftType,
  type StudentGender,
} from '../../types/domain';

export function StudentRegisterPage() {
  const [activeTab, setActiveTab] = useState<'register' | 'track'>('register');
  const [catalog, setCatalog] = useState<PublicRegistrationCatalog>({ seats: [], batches: [] });
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Registration Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<StudentGender | ''>('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [address, setAddress] = useState('');
  const [batchId, setBatchId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Seat & Shift State
  const [seatMode, setSeatMode] = useState<SeatMode>('fixed');
  const [shiftType, setShiftType] = useState<ShiftType>('morning');
  const [doublePresetId, setDoublePresetId] = useState('morning_noon');
  const [selectedSeatId, setSelectedSeatId] = useState('');
  const [selectedHall, setSelectedHall] = useState<HallName>('Hall 1');
  const [reason, setReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    referenceNo: string;
    seatId: string;
    hall: HallName;
    shiftType: ShiftType;
    batchName: string;
    estimatedMonthlyFee: number;
  } | null>(null);

  // Application Status Tracker State
  const [trackRefInput, setTrackRefInput] = useState('');
  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackedStatus, setTrackedStatus] = useState<PublicApplicationStatusResponse | null>(null);

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const data = await fetchPublicRegistrationCatalog();
      setCatalog(data);
    } catch (err) {
      setCatalogError(
        err instanceof Error ? err.message : 'Unable to load live seat availability.',
      );
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const estimatedMonthlyFee = useMemo(
    () => getDefaultMonthlyFee(shiftType, seatMode),
    [shiftType, seatMode],
  );

  const handleSeatModeChange = (nextMode: SeatMode) => {
    setSeatMode(nextMode);
    if (nextMode === 'unseated') {
      setSelectedSeatId('');
      setSelectedHall('Unassigned');
    } else if (selectedHall === 'Unassigned') {
      setSelectedHall('Hall 1');
    }
  };

  const handleShiftChange = (nextShift: ShiftType) => {
    setShiftType(nextShift);
    // Clear selected seat when shift changes so student confirms availability for new shift
    setSelectedSeatId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (fullName.trim().length < 2) {
      setSubmitError('Please enter your full name.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setSubmitError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (batchName.trim().length < 2) {
      setSubmitError('Please select your Exam Batch / Course or enter it manually under Other.');
      return;
    }
    if (portalPassword.length < 6) {
      setSubmitError('Portal password must be at least 6 characters.');
      return;
    }
    if (portalPassword !== confirmPassword) {
      setSubmitError('Portal password and confirm password do not match.');
      return;
    }
    if ((seatMode === 'fixed' || seatMode === 'non_fixed') && !selectedSeatId) {
      setSubmitError(
        'Please select an available seat from the Hall 1 / Hall 2 map below, or switch Seat Mode to Unseated.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitPublicStudentRegistration({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        gender: gender || undefined,
        dateOfBirth: dateOfBirth || '',
        guardianName: guardianName.trim(),
        guardianPhone: guardianPhone.trim(),
        address: address.trim(),
        batchId: batchId || 'other',
        batchName: batchName.trim(),
        requestedSeatMode: seatMode,
        requestedHall: seatMode === 'unseated' ? 'Unassigned' : selectedHall,
        requestedSeatId: seatMode === 'unseated' ? '' : selectedSeatId,
        requestedShiftType: shiftType,
        doublePresetId: shiftType === 'double' ? doublePresetId : 'morning_noon',
        portalPassword,
        reason: reason.trim(),
      });

      setSubmittedResult({
        referenceNo: res.referenceNo,
        seatId: res.request.requestedSeatId,
        hall: res.request.requestedHall,
        shiftType: res.request.requestedShiftType,
        batchName: res.request.batchName,
        estimatedMonthlyFee: res.request.estimatedMonthlyFee,
      });
      setTrackRefInput(res.referenceNo);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackRefInput.trim()) return;
    setTracking(true);
    setTrackError(null);
    setTrackedStatus(null);
    try {
      const res = await checkPublicApplicationStatus(trackRefInput.trim());
      setTrackedStatus(res);
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : 'Application not found.');
    } finally {
      setTracking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl">
        {/* Top Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/student/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-[#0E2A47] dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Student Login
          </Link>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Av_eSAFE Library · Electronic City, Bangalore
          </div>
        </div>

        {/* Hero Banner */}
        <div className="mb-6 overflow-hidden rounded-2xl bg-[#0E2A47] p-6 text-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#F6D57A]">
                Online Student Self-Registration
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                Join Av_eSAFE Library & Pick Your Preferred Seat
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-200">
                Choose your exam course/batch, preferred shift timing, and an available seat in Hall 1 or Hall 2.
                Every application is verified & approved by the Admin desk before activation.
              </p>
            </div>
            <div className="flex shrink-0 gap-2 rounded-xl bg-white/10 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('register')}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === 'register'
                    ? 'bg-[#C99A2E] text-slate-950'
                    : 'text-white/90 hover:bg-white/10'
                }`}
              >
                New Registration
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('track')}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === 'track'
                    ? 'bg-[#C99A2E] text-slate-950'
                    : 'text-white/90 hover:bg-white/10'
                }`}
              >
                Track Application
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'track' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-bold">Track Registration Approval Status</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Enter your Application Reference Number (e.g., <code className="font-mono">APP-2026-AB12</code>) to check live approval status.
            </p>

            <form onSubmit={handleTrackSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={trackRefInput}
                onChange={(e) => setTrackRefInput(e.target.value.toUpperCase())}
                placeholder="APP-2026-XXXX"
                required
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm uppercase focus:border-[#0E2A47] focus:outline-none focus:ring-2 focus:ring-[#0E2A47]/15 dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="submit"
                disabled={tracking}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0E2A47] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173d66] disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                {tracking ? 'Checking…' : 'Check Status'}
              </button>
            </form>

            {trackError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {trackError}
              </div>
            )}

            {trackedStatus && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-slate-500">{trackedStatus.referenceNo}</p>
                    <h3 className="text-base font-bold">{trackedStatus.batchName || 'Library Membership'}</h3>
                  </div>
                  <span
                    className={`rounded-md px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      trackedStatus.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : trackedStatus.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {trackedStatus.status === 'pending'
                      ? 'Pending Admin Approval'
                      : trackedStatus.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">Requested Seat</p>
                    <p className="font-semibold">
                      {trackedStatus.requestedSeatId || 'Unseated'} ({trackedStatus.requestedHall})
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Shift Timing</p>
                    <p className="font-semibold capitalize">
                      {trackedStatus.requestedShiftType.replace('_', ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Estimated Monthly Fee</p>
                    <p className="font-semibold">
                      ₹{Number(trackedStatus.estimatedMonthlyFee || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                  {trackedStatus.approvedRegistrationNo && (
                    <div>
                      <p className="text-xs text-slate-500">Official Reg ID</p>
                      <p className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {trackedStatus.approvedRegistrationNo}
                      </p>
                    </div>
                  )}
                </div>

                {trackedStatus.reviewNote && (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <strong>Admin Note:</strong> {trackedStatus.reviewNote}
                  </p>
                )}

                {trackedStatus.status === 'approved' && (
                  <div className="mt-4">
                    <Link
                      to="/student/login"
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0E2A47] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173d66]"
                    >
                      Sign In to Student Portal Now
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : submittedResult ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-xs dark:border-emerald-900/50 dark:bg-slate-900">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
              Registration Submitted for Admin Approval!
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-300">
              Your seat & shift request has been sent to the Av_eSAFE Library Admin Portal. Once
              approved, you can sign in immediately using your email/Registration ID and the portal
              password you just created.
            </p>

            <div className="mx-auto mt-6 max-w-md rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 dark:border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Application Reference
                </span>
                <span className="font-mono text-base font-bold text-[#0E2A47] dark:text-[#F6D57A]">
                  {submittedResult.referenceNo}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Course / Batch</dt>
                  <dd className="font-semibold">{submittedResult.batchName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Requested Seat</dt>
                  <dd className="font-semibold">
                    {submittedResult.seatId ? `${submittedResult.seatId} (${submittedResult.hall})` : 'Unseated'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Shift Plan</dt>
                  <dd className="font-semibold capitalize">
                    {submittedResult.shiftType.replace('_', ' ')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Estimated Monthly Fee</dt>
                  <dd className="font-semibold">
                    ₹{submittedResult.estimatedMonthlyFee.toLocaleString('en-IN')}/month
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('track')}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Track Application Status
              </button>
              <Link
                to="/student/login"
                className="rounded-lg bg-[#0E2A47] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#173d66]"
              >
                Go to Student Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {submitError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Section 1: Personal Info & Exam Batch */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <UserPlus className="h-5 w-5 text-[#0E2A47] dark:text-[#DFB55B]" />
                <h2 className="text-base font-bold">1. Student Details & Exam Course</h2>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none focus:ring-2 focus:ring-[#0E2A47]/15 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Mobile / WhatsApp Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none focus:ring-2 focus:ring-[#0E2A47]/15 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Email Address (For Portal Login)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none focus:ring-2 focus:ring-[#0E2A47]/15 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Gender
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as StudentGender | '')}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="">Select…</option>
                      {GENDER_OPTIONS.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <BatchCourseSelector
                    batches={catalog.batches}
                    batchId={batchId}
                    batchName={batchName}
                    required
                    onChange={({ batchId: nextId, batchName: nextName }) => {
                      setBatchId(nextId);
                      setBatchName(nextName);
                    }}
                    helperText="Select your exam/course batch, or choose Other to enter your custom course manually."
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Guardian Name
                  </label>
                  <input
                    type="text"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="Parent / Guardian name"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Guardian Phone
                  </label>
                  <input
                    type="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="Emergency contact number"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Local Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="PG / Flat / Street in Electronic City, Bangalore"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>

              {/* Portal Password */}
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0E2A47] dark:text-[#DFB55B]">
                  <KeyRound className="h-4 w-4" />
                  Create Your Student Portal Login Password
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={portalPassword}
                      onChange={(e) => setPortalPassword(e.target.value)}
                      placeholder="Set portal password (min 6 chars)"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm portal password"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Your password is securely hashed immediately and activates automatically once the Admin approves your admission.
                </p>
              </div>
            </div>

            {/* Section 2: Shift Timing & Seat Mode */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#0E2A47] dark:text-[#DFB55B]" />
                  <h2 className="text-base font-bold">2. Choose Shift Timing & Seat Mode</h2>
                </div>
                <div className="rounded-lg bg-[#0E2A47]/10 px-3 py-1 text-xs font-bold text-[#0E2A47] dark:bg-[#C99A2E]/20 dark:text-[#F6D57A]">
                  Estimated Plan: ₹{estimatedMonthlyFee.toLocaleString('en-IN')}/month
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(
                  [
                    {
                      id: 'fixed' as const,
                      title: 'Fixed Seat (Dedicated)',
                      desc: 'Your own dedicated desk reserved exclusively for you.',
                    },
                    {
                      id: 'non_fixed' as const,
                      title: 'Non-Fixed Shift Seat',
                      desc: 'Numbered desk reserved for your chosen shift slot.',
                    },
                    {
                      id: 'unseated' as const,
                      title: 'Unseated / Flexible',
                      desc: 'No numbered desk locked; Admin allocates as needed.',
                    },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleSeatModeChange(mode.id)}
                    className={`rounded-xl border p-3.5 text-left transition ${
                      seatMode === mode.id
                        ? 'border-[#0E2A47] bg-[#0E2A47]/5 ring-2 ring-[#0E2A47]/15 dark:border-[#C99A2E] dark:bg-[#C99A2E]/10'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    <p className="text-sm font-bold">{mode.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{mode.desc}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SHIFT_DEFINITIONS.map((shift) => {
                  const fee =
                    seatMode === 'fixed' ? shift.defaultFeeFixed : shift.defaultFeeNonFixed;
                  const active = shiftType === shift.id;
                  return (
                    <button
                      key={shift.id}
                      type="button"
                      onClick={() => handleShiftChange(shift.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-[#0E2A47] bg-[#0E2A47] text-white dark:border-[#C99A2E] dark:bg-[#C99A2E] dark:text-slate-950'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold">{shift.label}</span>
                        <span className="text-xs font-bold">₹{fee}</span>
                      </div>
                      <p
                        className={`mt-0.5 text-xs ${
                          active ? 'opacity-85' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {shift.window}
                      </p>
                    </button>
                  );
                })}
              </div>

              {shiftType === 'double' && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Choose Double-Shift Time Window
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DOUBLE_SHIFT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setDoublePresetId(preset.id);
                          setSelectedSeatId('');
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          doublePresetId === preset.id
                            ? 'border-[#0E2A47] bg-[#0E2A47] text-white dark:border-[#C99A2E] dark:bg-[#C99A2E] dark:text-slate-950'
                            : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Live Visual Seat Picker */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Armchair className="h-5 w-5 text-[#0E2A47] dark:text-[#DFB55B]" />
                  <h2 className="text-base font-bold">3. Select Available Seat (Hall 1 & Hall 2)</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void loadCatalog()}
                  disabled={loadingCatalog}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
                  Refresh Live Seats
                </button>
              </div>

              {catalogError && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  {catalogError}
                </div>
              )}

              <InteractiveSeatPicker
                seats={catalog.seats}
                shiftType={shiftType}
                doublePresetId={doublePresetId}
                seatMode={seatMode}
                selectedSeatId={selectedSeatId}
                onSelectSeat={(seatCode, hall) => {
                  setSelectedSeatId(seatCode);
                  setSelectedHall(hall);
                }}
              />

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Additional Note for Admin (Optional)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Any preference or starting date note for the Admin desk…"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            {/* Submit Bar */}
            <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Admin Approval Required
                </p>
                <p>
                  Submitting sends your registration and seat preference directly to the Admin Approval Queue.
                </p>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E2A47] px-6 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-[#173d66] disabled:opacity-60 sm:w-auto dark:bg-[#C99A2E] dark:text-slate-950 dark:hover:bg-[#d7a93e]"
              >
                <BookOpenCheck className="h-4 w-4" />
                {submitting ? 'Submitting Application…' : 'Submit Registration for Approval'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
