import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Armchair,
  Building2,
  Cake,
  CalendarClock,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  IdCard,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Save,
  Shield,
  Trash2,
  Upload,
  UserCircle2,
  ZoomIn,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../../components/common/ThemeToggle';
import { formatGenderLabel, StudentAvatar } from '../../components/common/StudentAvatar';
import {
  formatBytes,
  loadImageFromFile,
  renderCroppedAvatarDataUrl,
  validateImageFile,
} from '../../lib/imageProcessor';
import { changeOwnStudentPassword } from '../../lib/studentSessionToken';
import {
  subscribeLibraryInfo,
  subscribeOwnMemberships,
  subscribeOwnStudentProfile,
  updateOwnStudentProfile,
} from '../../services/studentPortalService';
import {
  GENDER_OPTIONS,
  SHIFT_DEFINITIONS,
  type LibrarySettings,
  type MembershipRecord,
  type StudentGender,
  type StudentRecord,
} from '../../types/domain';

export function StudentProfilePage() {
  const { firebaseUser, studentProfile, studentAuthMode, requestPasswordReset, logout } = useAuth();
  const navigate = useNavigate();

  const [liveProfile, setLiveProfile] = useState<StudentRecord | null>(studentProfile);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [libraryInfo, setLibraryInfo] = useState<LibrarySettings | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Self-service password change state (active when signed in with Admin-set portal password)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Profile photo & gender self-service state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedGender, setSelectedGender] = useState<StudentGender | ''>(
    studentProfile?.gender || '',
  );
  const [dateOfBirth, setDateOfBirth] = useState<string>(studentProfile?.dateOfBirth || '');
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewBytes, setPreviewBytes] = useState<number>(0);
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [profileNotice, setProfileNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if ((!firebaseUser && studentAuthMode !== 'password') || !studentProfile) return;
    const uid = firebaseUser?.uid || studentProfile.uid || studentProfile.id;
    const unsubProfile = subscribeOwnStudentProfile(studentProfile.id, (docData) => {
      if (docData) {
        setLiveProfile(docData);
        setSelectedGender((prev) => (prev ? prev : docData.gender || ''));
      }
    });
    const unsubMemberships = subscribeOwnMemberships(uid, setMemberships);
    const unsubSettings = subscribeLibraryInfo(setLibraryInfo);

    return () => {
      unsubProfile();
      unsubMemberships();
      unsubSettings();
    };
  }, [firebaseUser, studentProfile, studentAuthMode]);

  const profile = liveProfile || studentProfile;

  useEffect(() => {
    if (profile?.gender) {
      setSelectedGender(profile.gender);
    }
    if (typeof profile?.dateOfBirth === 'string') {
      setDateOfBirth(profile.dateOfBirth);
    }
  }, [profile?.gender, profile?.dateOfBirth]);

  // Re-render optimized cropped preview whenever zoom/offset changes
  useEffect(() => {
    if (!loadedImage) return;
    try {
      const rendered = renderCroppedAvatarDataUrl(loadedImage, {
        zoom,
        offsetX,
        offsetY,
        outputSize: 256,
      });
      setPreviewDataUrl(rendered.dataUrl);
      setPreviewBytes(rendered.sizeBytes);
      setPendingRemoval(false);
    } catch (err) {
      setProfileNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to crop image.',
      });
    }
  }, [loadedImage, zoom, offsetX, offsetY]);

  const shiftInfo = useMemo(
    () => SHIFT_DEFINITIONS.find((s) => s.id === profile?.shiftType),
    [profile?.shiftType],
  );

  const handleChooseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProfileNotice(null);
    const validationErr = validateImageFile(file);
    if (validationErr) {
      setProfileNotice({ type: 'error', text: validationErr });
      return;
    }

    try {
      const img = await loadImageFromFile(file);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setLoadedImage(img);
    } catch (err) {
      setProfileNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not open image file.',
      });
    }
  };

  const handleStageRemovePhoto = () => {
    setLoadedImage(null);
    setPreviewDataUrl(null);
    setPreviewBytes(0);
    setPendingRemoval(true);
    setProfileNotice(null);
  };

  const handleDiscardPhotoEdit = () => {
    setLoadedImage(null);
    setPreviewDataUrl(null);
    setPreviewBytes(0);
    setPendingRemoval(false);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setProfileNotice(null);
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!profile) return false;
    const genderChanged = selectedGender !== (profile.gender || '');
    const dobChanged = dateOfBirth !== (profile.dateOfBirth || '');
    return (
      genderChanged ||
      dobChanged ||
      Boolean(previewDataUrl) ||
      (pendingRemoval && Boolean(profile.profilePhotoUrl))
    );
  }, [profile, selectedGender, dateOfBirth, previewDataUrl, pendingRemoval]);

  const handleSaveProfileChanges = async () => {
    if (!profile || (!firebaseUser && studentAuthMode !== 'password')) return;
    if (!hasUnsavedChanges) return;

    setProfileNotice(null);
    setSavingProfile(true);
    setUploadProgress(10);

    try {
      const uid = firebaseUser?.uid || profile.uid || profile.id;
      await updateOwnStudentProfile(
        profile.id,
        uid,
        {
          gender: selectedGender || undefined,
          dateOfBirth,
          photoDataUrl: previewDataUrl || undefined,
          removePhoto: pendingRemoval,
        },
        setUploadProgress,
      );
      setLoadedImage(null);
      setPreviewDataUrl(null);
      setPreviewBytes(0);
      setPendingRemoval(false);
      setProfileNotice({
        type: 'success',
        text: pendingRemoval
          ? 'Profile photograph removed and preferences saved.'
          : previewDataUrl
            ? 'Profile photograph optimized, validated, and saved to your student record.'
            : 'Profile preferences saved successfully.',
      });
    } catch (err) {
      setProfileNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save profile changes.',
      });
    } finally {
      setSavingProfile(false);
      setTimeout(() => setUploadProgress(0), 600);
    }
  };

  const handleChangePortalPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage(null);
    if (newPassword.length < 6) {
      setResetMessage({
        type: 'error',
        text: 'New password must be at least 6 characters long.',
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setResetMessage({
        type: 'error',
        text: 'New password and confirmation do not match.',
      });
      return;
    }

    setChangingPassword(true);
    try {
      const msg = await changeOwnStudentPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setResetMessage({ type: 'success', text: msg });
    } catch (err) {
      setResetMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update portal password.',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendPasswordReset = async () => {
    const email = firebaseUser?.email || profile?.email;
    if (!email) {
      setResetMessage({
        type: 'error',
        text: 'No email address is attached to your account. Contact the front desk.',
      });
      return;
    }

    setResetMessage(null);
    setSendingReset(true);
    try {
      await requestPasswordReset(email);
      setResetMessage({
        type: 'success',
        text: `Password reset link sent to ${email}. Check your inbox and spam folder.`,
      });
    } catch (err) {
      setResetMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not send reset email.',
      });
    } finally {
      setSendingReset(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/student/login');
  };

  if (!profile) {
    return (
      <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
        Loading your profile...
      </div>
    );
  }

  const displayedPhotoUrl = pendingRemoval
    ? null
    : previewDataUrl || profile.profilePhotoUrl || null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          My Profile &amp; Membership
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage your profile photograph, gender preference, shift allocation, and account security.
        </p>
      </div>

      {/* Digital Identity & Seat Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <StudentAvatar
              name={profile.fullName}
              photoUrl={displayedPhotoUrl}
              gender={selectedGender || profile.gender}
              size="lg"
              ring
            />
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {profile.fullName}
              </h2>
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {profile.registrationNo} · <span className="capitalize">{profile.status}</span> ·{' '}
                <span className="capitalize">{profile.admissionType} Admission</span>
              </p>
              {profile.cardNumber && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-blue-700 dark:text-sky-400 font-mono">
                  <IdCard className="w-3.5 h-3.5" />
                  <span>ID Card: {profile.cardNumber}</span>
                  <Link
                    to={`/verify/${encodeURIComponent(profile.cardNumber)}`}
                    className="underline font-sans font-medium ml-1"
                  >
                    Verify
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Monthly Plan
            </p>
            <p className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              ₹{Number(profile.monthlyFee || 0).toLocaleString('en-IN')}/mo
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Armchair className="w-3.5 h-3.5" />
              Assigned Seat
            </p>
            <p className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">
              {profile.seatId || 'Unseated'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {profile.hall} ·{' '}
              {profile.seatMode === 'fixed'
                ? 'Fixed Seat'
                : profile.seatMode === 'non_fixed'
                  ? 'Non-Fixed Seat'
                  : 'Pending Assignment'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              Shift Schedule
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
              {shiftInfo?.label || profile.shiftType}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {shiftInfo?.window || '24/7 Library'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Valid Until
            </p>
            <p className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">
              {profile.membershipExpiry || 'Not set'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Grace period: {libraryInfo?.gracePeriodDays ?? 5} days
            </p>
          </div>
        </div>
      </section>

      {/* Self-Service Profile Photograph & Gender Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
              Profile Photograph &amp; Personal Preferences
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Your photo appears on your digital profile and printed Av_eSAFE Library ID card. Supports JPG, PNG, and WebP up to 5 MB.
            </p>
          </div>
        </div>

        {profileNotice && (
          <div
            role="status"
            className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs ${
              profileNotice.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {profileNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{profileNotice.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Circular Preview + Controls */}
          <div className="md:col-span-5 flex flex-col items-center text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-3.5">
            <StudentAvatar
              name={profile.fullName}
              photoUrl={displayedPhotoUrl}
              gender={selectedGender || profile.gender}
              size="2xl"
              ring
            />

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {previewDataUrl ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  Cropped &amp; optimized ({formatBytes(previewBytes)}) · Ready to save
                </span>
              ) : pendingRemoval ? (
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  Photo marked for removal · Default {formatGenderLabel(selectedGender || profile.gender)} avatar will appear
                </span>
              ) : profile.profilePhotoUrl ? (
                <span>Custom photograph active on your student profile</span>
              ) : (
                <span>Using default avatar ({formatGenderLabel(selectedGender || profile.gender)})</span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(e) => void handleChooseFile(e)}
              className="hidden"
            />

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={savingProfile}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {profile.profilePhotoUrl || previewDataUrl ? 'Change Photo' : 'Upload Photo'}
              </button>

              {(profile.profilePhotoUrl || previewDataUrl) && !pendingRemoval && (
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={handleStageRemovePhoto}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}

              {(previewDataUrl || pendingRemoval) && (
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={handleDiscardPhotoEdit}
                  className="inline-flex items-center min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Crop Sliders + Gender Selector + Save */}
          <div className="md:col-span-7 space-y-4">
            {loadedImage && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5" />
                    Adjust Circular Crop Framing
                  </p>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {zoom.toFixed(1)}× zoom
                  </span>
                </div>

                <div className="space-y-2.5">
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400">
                    Zoom
                    <input
                      type="range"
                      min={1}
                      max={2.4}
                      step={0.05}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full mt-1 accent-[#0B1F3A] dark:accent-sky-400"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400">
                      Horizontal Position
                      <input
                        type="range"
                        min={-0.45}
                        max={0.45}
                        step={0.03}
                        value={offsetX}
                        onChange={(e) => setOffsetX(Number(e.target.value))}
                        className="w-full mt-1 accent-[#0B1F3A] dark:accent-sky-400"
                      />
                    </label>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400">
                      Vertical Position
                      <input
                        type="range"
                        min={-0.45}
                        max={0.45}
                        step={0.03}
                        value={offsetY}
                        onChange={(e) => setOffsetY(Number(e.target.value))}
                        className="w-full mt-1 accent-[#0B1F3A] dark:accent-sky-400"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="student-portal-gender"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Gender
                </label>
                <select
                  id="student-portal-gender"
                  value={selectedGender}
                  onChange={(e) => setSelectedGender(e.target.value as StudentGender | '')}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Sets your default library avatar when no photo is uploaded.
                </p>
              </div>

              <div>
                <label
                  htmlFor="student-portal-dob"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Date of Birth
                </label>
                <input
                  id="student-portal-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Optional · lets Av_eSAFE Library celebrate your birthday.
                </p>
              </div>
            </div>

            {savingProfile && uploadProgress > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Validating &amp; saving profile changes...</span>
                  <span className="font-mono tabular-nums">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-[#0B1F3A] dark:bg-sky-400 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                disabled={savingProfile || !hasUnsavedChanges}
                onClick={() => void handleSaveProfileChanges()}
                className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-45 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Personal & Contact Details (Admin-controlled read-only) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Registered Details
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Admin-verified record
          </span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2.5">
            <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Phone Number</dt>
              <dd className="font-mono text-slate-900 dark:text-white mt-0.5">{profile.phone}</dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Portal Email</dt>
              <dd className="text-slate-900 dark:text-white mt-0.5 break-all">
                {firebaseUser?.email || profile.email || '—'}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Cake className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Date of Birth</dt>
              <dd className="font-mono text-slate-900 dark:text-white mt-0.5">
                {profile.dateOfBirth || 'Not provided'}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <GraduationCap className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Exam / Study Batch</dt>
              <dd className="text-slate-900 dark:text-white mt-0.5 font-medium">
                {profile.batchName || 'General Reading Hall'}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <UserCircle2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Guardian</dt>
              <dd className="text-slate-900 dark:text-white mt-0.5">
                {profile.guardianName || 'Not provided'}
                {profile.guardianPhone ? ` (${profile.guardianPhone})` : ''}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Address</dt>
              <dd className="text-slate-900 dark:text-white mt-0.5">
                {profile.address || 'Not provided'}
              </dd>
            </div>
          </div>
        </dl>
      </section>

      {/* Membership History */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Membership History ({memberships.length})
        </h2>
        {memberships.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
            Your active enrollment details are shown in the summary above.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {memberships.map((m) => {
              const label =
                SHIFT_DEFINITIONS.find((s) => s.id === m.shiftType)?.label || m.shiftType;
              return (
                <div
                  key={m.id}
                  className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {label} · {m.seatMode === 'fixed' ? 'Fixed' : 'Non-Fixed'}{' '}
                      {m.seatId ? `(${m.seatId})` : ''}
                    </p>
                    <p className="font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {m.startDate} → {m.endDate}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                      ₹{m.monthlyFee.toLocaleString('en-IN')}/mo
                    </p>
                    <p className="capitalize text-slate-500 dark:text-slate-400">
                      {m.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Account Controls & Library Info */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Account &amp; Security
        </h2>

        {resetMessage && (
          <div
            className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs ${
              resetMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {resetMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{resetMessage.text}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Appearance</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch between light and dark mode
            </p>
          </div>
          <ThemeToggle />
        </div>

        {studentAuthMode === 'password' ? (
          <form
            onSubmit={(e) => void handleChangePortalPassword(e)}
            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Change Portal Password
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPasswords ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 6 chars)"
                autoComplete="new-password"
                className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="submit"
                disabled={changingPassword}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {changingPassword ? 'Updating Password...' : 'Update Portal Password'}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSendPasswordReset}
              disabled={sendingReset}
              className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              {sendingReset ? 'Sending Reset Email...' : 'Send Password Reset Email'}
            </button>

            <Link
              to="/student/forgot-password"
              className="inline-flex items-center px-3.5 min-h-[42px] rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline"
            >
              Password Recovery Page
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="ml-auto inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
          <Building2 className="w-4 h-4 shrink-0" />
          <span>
            {!libraryInfo?.libraryName || libraryInfo.libraryName === 'Nirvana Library'
              ? 'Av_eSAFE Library'
              : libraryInfo.libraryName}{' '}
            ·{' '}
            {!libraryInfo?.location || /narkatiaganj|bihar/i.test(libraryInfo.location)
              ? 'Electronic City, Bangalore'
              : libraryInfo.location}{' '}
            · Open {libraryInfo?.operatingHours || '24/7'} (120 Seats)
          </span>
        </div>
      </section>
    </div>
  );
}
