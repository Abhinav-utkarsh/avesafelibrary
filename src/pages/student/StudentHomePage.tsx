import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Armchair,
  ArrowRight,
  Bell,
  Cake,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Megaphone,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FeeReceiptModal } from '../../components/common/FeeReceiptModal';
import { StudentAvatar } from '../../components/common/StudentAvatar';
import { getDaysUntilExpiry } from '../../services/studentService';
import {
  computeElapsedMinutes,
  formatDurationMinutes,
} from '../../services/attendanceService';
import {
  subscribeOwnAttendance,
  subscribeOwnNotifications,
  subscribeOwnPayments,
  subscribeOwnStudentProfile,
  subscribePublishedNotices,
} from '../../services/studentPortalService';
import {
  SHIFT_DEFINITIONS,
  type AttendanceRecord,
  type NoticeRecord,
  type NotificationRecord,
  type PaymentRecord,
  type StudentRecord,
} from '../../types/domain';

function formatTimeShort(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function StudentHomePage() {
  const { firebaseUser, studentProfile, studentAuthMode } = useAuth();
  const [liveProfile, setLiveProfile] = useState<StudentRecord | null>(studentProfile);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if ((!firebaseUser && studentAuthMode !== 'password') || !studentProfile) return;
    const uid = firebaseUser?.uid || studentProfile.uid || studentProfile.id;
    const unsubProfile = subscribeOwnStudentProfile(studentProfile.id, (docData) => {
      if (docData) setLiveProfile(docData);
    });
    const unsubPayments = subscribeOwnPayments(uid, setPayments);
    const unsubAttendance = subscribeOwnAttendance(uid, setAttendance);
    const unsubNotices = subscribePublishedNotices(setNotices);
    const unsubNotifs = subscribeOwnNotifications(uid, setNotifications);

    return () => {
      unsubProfile();
      unsubPayments();
      unsubAttendance();
      unsubNotices();
      unsubNotifs();
    };
  }, [firebaseUser, studentProfile, studentAuthMode]);

  const profile = liveProfile || studentProfile;

  const shiftInfo = useMemo(
    () => SHIFT_DEFINITIONS.find((s) => s.id === profile?.shiftType),
    [profile?.shiftType],
  );

  const daysUntilExpiry = useMemo(
    () => getDaysUntilExpiry(profile?.membershipExpiry),
    [profile?.membershipExpiry],
  );

  const activeInsideSession = useMemo(
    () => attendance.find((a) => a.isInside) || null,
    [attendance],
  );

  const currentMonthPrefix = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const monthlyStats = useMemo(() => {
    const thisMonth = attendance.filter((a) => a.date.startsWith(currentMonthPrefix));
    const totalMins = thisMonth.reduce((sum, rec) => {
      if (rec.isInside) {
        const entryMs = rec.entryTime?.toMillis ? rec.entryTime.toMillis() : nowMs;
        return sum + computeElapsedMinutes(entryMs, nowMs);
      }
      return sum + (rec.durationMinutes || 0);
    }, 0);
    return {
      visits: thisMonth.length,
      totalMinutes: totalMins,
    };
  }, [attendance, currentMonthPrefix, nowMs]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const relevantNotices = useMemo(() => {
    if (!profile) return notices.slice(0, 3);
    return notices
      .filter((n) => {
        if (n.audience === 'all') return true;
        if (n.audience === 'hall_1') return profile.hall === 'Hall 1';
        if (n.audience === 'hall_2') return profile.hall === 'Hall 2';
        if (n.audience === 'unseated') return profile.seatMode === 'unseated' || !profile.seatId;
        if (n.audience === 'expiring') return daysUntilExpiry !== null && daysUntilExpiry <= 7;
        return true;
      })
      .slice(0, 3);
  }, [notices, profile, daysUntilExpiry]);

  const latestPayment = payments[0] || null;
  const latestBirthdayWish = useMemo(
    () => notifications.find((n) => n.type === 'birthday') || null,
    [notifications],
  );

  if (!profile) {
    return (
      <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
        Loading your student record...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Digital Membership Hero Card */}
      <section className="rounded-3xl bg-[#0B1F3A] dark:bg-[#0D2548] text-white p-5 sm:p-7 surface-elevated border-t-4 border-[#C89B3C] overflow-hidden relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              to="/student/profile"
              title="Update profile photo"
              className="shrink-0 rounded-full ring-2 ring-[#DFB55B]/70 ring-offset-2 ring-offset-[#0B1F3A] hover:opacity-95 transition-opacity"
            >
              <StudentAvatar
                name={profile.fullName}
                gender={profile.gender}
                photoUrl={profile.profilePhotoUrl}
                size="lg"
              />
            </Link>
            <div className="space-y-1 min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-widest text-[#DFB55B]">
                Av_eSAFE Library · Electronic City, Bangalore
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {profile.fullName}
              </h1>
              <p className="font-mono text-xs text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>Reg No: {profile.registrationNo}</span>
                <span>·</span>
                <span className="capitalize">{profile.status} Member</span>
                {profile.batchName && (
                  <>
                    <span>·</span>
                    <span className="font-sans font-medium text-sky-200">{profile.batchName}</span>
                  </>
                )}
                {profile.cardNumber && (
                  <>
                    <span>·</span>
                    <span className="text-[#DFB55B]">ID: {profile.cardNumber}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-[11px] uppercase tracking-wider text-slate-300">Assigned Seat</p>
            <p className="font-mono text-2xl font-bold tracking-tight mt-0.5">
              {profile.seatId || 'Unseated'}
            </p>
            <p className="text-xs text-sky-200 mt-0.5">
              {profile.hall} ·{' '}
              {profile.seatMode === 'fixed'
                ? 'Fixed Seat'
                : profile.seatMode === 'non_fixed'
                  ? 'Non-Fixed'
                  : 'Pending Desk'}
            </p>
            <Link
              to="/student/seat-request"
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/12 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-[#F6D57A] transition-colors"
            >
              Change Seat / Shift
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-sky-300" />
              Active Shift
            </p>
            <p className="text-sm font-semibold mt-1">{shiftInfo?.label || profile.shiftType}</p>
            <p className="text-xs text-slate-300 mt-0.5">{shiftInfo?.window || '24/7 Library'}</p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-300" />
              Membership Expiry
            </p>
            <p className="font-mono text-sm font-semibold mt-1">
              {profile.membershipExpiry || 'Not set'}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                daysUntilExpiry !== null && daysUntilExpiry <= 5
                  ? 'text-amber-300 font-medium'
                  : 'text-slate-300'
              }`}
            >
              {daysUntilExpiry === null
                ? 'Contact desk for renewal date'
                : daysUntilExpiry < 0
                  ? `Expired ${Math.abs(daysUntilExpiry)} days ago`
                  : daysUntilExpiry === 0
                    ? 'Expires today'
                    : `${daysUntilExpiry} days remaining`}
            </p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Armchair className="w-3.5 h-3.5 text-sky-300" />
              Current Presence
            </p>
            {activeInsideSession ? (
              <>
                <p className="text-sm font-semibold text-emerald-300 mt-1">Checked In Now</p>
                <p className="font-mono text-xs text-slate-200 mt-0.5 tabular-nums">
                  Since {formatTimeShort(activeInsideSession.entryTime)} (
                  {formatDurationMinutes(
                    computeElapsedMinutes(
                      activeInsideSession.entryTime?.toMillis
                        ? activeInsideSession.entryTime.toMillis()
                        : nowMs,
                      nowMs,
                    ),
                  )}
                  )
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-100 mt-1">Outside Library</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  {attendance[0]
                    ? `Last visit on ${attendance[0].date}`
                    : 'No attendance recorded yet'}
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Birthday Wish Highlight Card */}
      {latestBirthdayWish && (
        <Link
          to="/student/notices"
          className="flex items-start justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-50 via-yellow-50/70 to-white dark:from-[#C99A2E]/20 dark:via-slate-900 dark:to-slate-900 border border-[#C99A2E]/60 hover:border-[#C99A2E] transition-colors"
        >
          <div className="flex items-start gap-3">
            <Cake className="w-5 h-5 text-[#B4831D] dark:text-[#F6D57A] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#9A6F14] dark:text-[#F6D57A]">
                Birthday Wishes from Av_eSAFE Library
              </p>
              <p className="text-sm font-bold text-[#0B1F3A] dark:text-white mt-0.5">
                {latestBirthdayWish.title}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 line-clamp-2">
                {latestBirthdayWish.message}
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#B4831D] dark:text-[#F6D57A] shrink-0 mt-1" />
        </Link>
      )}

      {/* Pending Dues or Cleared Status Banner */}
      {profile.pendingAmount > 0 ? (
        <Link
          to="/student/fees"
          className="flex items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 hover:bg-amber-100/70 dark:hover:bg-amber-950/60 transition-colors"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Pending Fee Balance: ₹{profile.pendingAmount.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-0.5">
                Pay at the Electronic City, Bangalore front desk to keep your seat and Smart Door access uninterrupted.
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                No Pending Dues
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300/80">
                Your fee account is completely up to date.
              </p>
            </div>
          </div>
          <Link
            to="/student/fees"
            className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:underline whitespace-nowrap"
          >
            View Receipts
          </Link>
        </div>
      )}

      {/* 2x2 Quick Stat Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Link
          to="/student/fees"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-[#0B1F3A]/40 dark:hover:border-sky-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Monthly Fee</span>
            <CreditCard className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
          </div>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            ₹{Number(profile.monthlyFee || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {payments.length} receipt{payments.length === 1 ? '' : 's'} on file
          </p>
        </Link>

        <Link
          to="/student/attendance"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-[#0B1F3A]/40 dark:hover:border-sky-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Study Time</span>
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            {formatDurationMinutes(monthlyStats.totalMinutes)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            This month ({currentMonthPrefix})
          </p>
        </Link>

        <Link
          to="/student/attendance"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-[#0B1F3A]/40 dark:hover:border-sky-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Visits</span>
            <CalendarClock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            {monthlyStats.visits}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Check-ins this month
          </p>
        </Link>

        <Link
          to="/student/notices"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-[#0B1F3A]/40 dark:hover:border-sky-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Alerts</span>
            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            {unreadCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Unread personal alert{unreadCount === 1 ? '' : 's'}
          </p>
        </Link>
      </div>

      {/* Latest Payment + Recent Notices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
              Latest Library Notices
            </h2>
            <Link
              to="/student/notices"
              className="text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline"
            >
              View All
            </Link>
          </div>

          {relevantNotices.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              No active library announcements right now.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {relevantNotices.map((notice) => (
                <div key={notice.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-semibold">
                    <span
                      className={
                        notice.priority === 'urgent'
                          ? 'text-rose-600 dark:text-rose-400'
                          : notice.priority === 'important'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }
                    >
                      {notice.priority}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-slate-500 dark:text-slate-400 capitalize">
                      {notice.category.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                    {notice.title}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                    {notice.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                Latest Receipt
              </h2>
              <Link
                to="/student/fees"
                className="text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline"
              >
                Full History
              </Link>
            </div>

            {latestPayment ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[#0B1F3A] dark:text-sky-400">
                    {latestPayment.receiptNo}
                  </span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {latestPayment.billingMonth}
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  ₹{latestPayment.amountPaid.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                  Paid via {latestPayment.paymentMethod.replace('_', ' ')} · Remaining due ₹
                  {latestPayment.dueAmount.toLocaleString('en-IN')}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(latestPayment)}
                  className="mt-2 w-full min-h-[40px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Open &amp; Download Receipt
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                No payment receipts recorded under your account yet.
              </p>
            )}
          </div>
        </section>
      </div>

      <FeeReceiptModal
        payment={selectedReceipt}
        student={profile}
        onClose={() => setSelectedReceipt(null)}
      />
    </div>
  );
}
