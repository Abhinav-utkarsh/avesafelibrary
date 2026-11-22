import { useMemo, useState } from 'react';
import { Bell, Cake, Check, Search } from 'lucide-react';
import type { AdminProfile, StudentRecord } from '../../../types/domain';
import {
  getBirthdayStatus,
  sendSingleStudentNotification,
  updateStudentBirthdayInline,
} from '../../../services/communicationService';
import { buildBirthdayWishWhatsApp } from '../../../lib/whatsapp';
import { StudentAvatar } from '../../common/StudentAvatar';
import { WhatsAppButton } from '../../common/WhatsAppButton';

interface BirthdayWishesPanelProps {
  students: StudentRecord[];
  adminProfile: AdminProfile | null;
  onFeedback: (type: 'success' | 'error', message: string) => void;
}

const DEFAULT_WISH =
  'Happy Birthday, {name}! Wishing you a wonderful year ahead filled with sharp focus, good health, and grand success in all your exams and goals. — Team Av_eSAFE Library, Electronic City, Bangalore.';

export function BirthdayWishesPanel({
  students,
  adminProfile,
  onFeedback,
}: BirthdayWishesPanelProps) {
  const [wishMessage, setWishMessage] = useState(DEFAULT_WISH);
  const [viewMode, setViewMode] = useState<'upcoming' | 'month' | 'missing_dob'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [dobDrafts, setDobDrafts] = useState<Record<string, string>>({});
  const [savingDobId, setSavingDobId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const today: { student: StudentRecord; info: NonNullable<ReturnType<typeof getBirthdayStatus>> }[] = [];
    const next7: { student: StudentRecord; info: NonNullable<ReturnType<typeof getBirthdayStatus>> }[] = [];
    const thisMonth: { student: StudentRecord; info: NonNullable<ReturnType<typeof getBirthdayStatus>> }[] = [];
    const allWithDob: { student: StudentRecord; info: NonNullable<ReturnType<typeof getBirthdayStatus>> }[] = [];
    const missingDob: StudentRecord[] = [];

    for (const s of students) {
      const info = getBirthdayStatus(s.dateOfBirth);
      if (!info) {
        missingDob.push(s);
        continue;
      }
      const entry = { student: s, info };
      allWithDob.push(entry);
      if (info.isToday) today.push(entry);
      else if (info.daysUntil <= 7) next7.push(entry);
      if (info.isThisMonth) thisMonth.push(entry);
    }

    next7.sort((a, b) => a.info.daysUntil - b.info.daysUntil);
    thisMonth.sort((a, b) => a.info.daysUntil - b.info.daysUntil);
    allWithDob.sort((a, b) => a.info.daysUntil - b.info.daysUntil);
    missingDob.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return { today, next7, thisMonth, allWithDob, missingDob };
  }, [students]);

  const handleSendPortalWish = async (student: StudentRecord) => {
    if (!adminProfile) return;
    setSendingId(student.id);
    try {
      const msg = buildBirthdayWishWhatsApp(student, wishMessage);
      await sendSingleStudentNotification(
        student,
        {
          title: 'Happy Birthday from Av_eSAFE Library!',
          message: msg,
          type: 'birthday',
        },
        adminProfile,
      );
      onFeedback(
        'success',
        `Sent Birthday Wish to ${student.fullName}. It is now in their Notices section and will display as a popup when they log in.`,
      );
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to send birthday alert.');
    } finally {
      setSendingId(null);
    }
  };

  const handleSaveDob = async (student: StudentRecord) => {
    if (!adminProfile) return;
    const dob = dobDrafts[student.id];
    if (!dob) return;
    setSavingDobId(student.id);
    try {
      await updateStudentBirthdayInline(student, dob, adminProfile);
      onFeedback('success', `Saved date of birth (${dob}) for ${student.fullName}.`);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to save date of birth.');
    } finally {
      setSavingDobId(null);
    }
  };

  const q = searchQuery.trim().toLowerCase();

  const displayedList = useMemo(() => {
    if (viewMode === 'month') {
      return grouped.thisMonth.filter((e) =>
        !q ? true : `${e.student.fullName} ${e.student.registrationNo} ${e.student.phone}`.toLowerCase().includes(q),
      );
    }
    return grouped.allWithDob.filter((e) =>
      !q ? true : `${e.student.fullName} ${e.student.registrationNo} ${e.student.phone}`.toLowerCase().includes(q),
    );
  }, [viewMode, grouped, q]);

  const filteredMissing = useMemo(() => {
    return grouped.missingDob.filter((s) =>
      !q ? true : `${s.fullName} ${s.registrationNo} ${s.phone}`.toLowerCase().includes(q),
    );
  }, [grouped.missingDob, q]);

  return (
    <div className="p-5 space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">Today&apos;s Birthdays</p>
          <p className="font-mono text-2xl font-bold text-[#0B1F3A] dark:text-sky-400 mt-1">
            {grouped.today.length}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">Upcoming (Next 7 Days)</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            {grouped.next7.length}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">Profiles Missing DOB</p>
          <p className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {grouped.missingDob.length}
          </p>
        </div>
      </div>

      {/* Today's Celebrants Spotlight */}
      {grouped.today.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/20 space-y-3">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <Cake className="w-4 h-4" />
            <h3 className="font-display text-sm font-bold">
              Celebrating Today ({grouped.today.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {grouped.today.map(({ student: st, info }) => (
              <div
                key={st.id}
                className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StudentAvatar
                    name={st.fullName}
                    photoUrl={st.profilePhotoUrl}
                    gender={st.gender}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {st.fullName}
                    </p>
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {st.registrationNo} · {info.formattedDate}
                      {info.ageTurning ? ` · Turns ${info.ageTurning}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <WhatsAppButton
                    phone={st.phone}
                    message={buildBirthdayWishWhatsApp(st, wishMessage)}
                    size="xs"
                    variant="solid"
                    label="WhatsApp Wish"
                  />
                  <button
                    type="button"
                    disabled={sendingId === st.id}
                    onClick={() => handleSendPortalWish(st)}
                    title="Send in-app Birthday Wish & Student Portal Login Popup"
                    className="inline-flex items-center gap-1 min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                  >
                    <Bell className="w-3 h-3" />
                    {sendingId === st.id ? 'Sending...' : 'Portal Popup'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customizable Birthday Greeting */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Birthday Wish Message (used for WhatsApp &amp; Portal greetings)
          </label>
          <span className="font-mono text-[11px] text-slate-400">
            Supports {'{name}'}, {'{regNo}'}, {'{hall}'}, {'{seat}'}
          </span>
        </div>
        <textarea
          rows={2}
          maxLength={600}
          value={wishMessage}
          onChange={(e) => setWishMessage(e.target.value)}
          className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
          {(
            [
              { id: 'upcoming', label: `All Birthdays (${grouped.allWithDob.length})` },
              { id: 'month', label: `This Month (${grouped.thisMonth.length})` },
              { id: 'missing_dob', label: `Set Missing DOB (${grouped.missingDob.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setViewMode(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === tab.id
                  ? 'bg-white dark:bg-slate-900 text-[#0B1F3A] dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student..."
            className="w-full min-h-[38px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      {viewMode === 'missing_dob' ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {filteredMissing.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              All students have a date of birth recorded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Set Date of Birth</th>
                    <th className="py-3 px-4 text-right">Save</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredMissing.map((st) => (
                    <tr key={st.id}>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar
                            name={st.fullName}
                            photoUrl={st.profilePhotoUrl}
                            gender={st.gender}
                            size="xs"
                          />
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {st.fullName}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500">
                              {st.registrationNo}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {st.phone}
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="date"
                          value={dobDrafts[st.id] || ''}
                          onChange={(e) =>
                            setDobDrafts((prev) => ({ ...prev, [st.id]: e.target.value }))
                          }
                          className="min-h-[34px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          disabled={!dobDrafts[st.id] || savingDobId === st.id}
                          onClick={() => handleSaveDob(st)}
                          className="inline-flex items-center gap-1 min-h-[32px] px-3 rounded-lg bg-[#0B1F3A] dark:bg-blue-600 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {savingDobId === st.id ? 'Saving...' : 'Save DOB'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : displayedList.length === 0 ? (
        <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <Cake className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No birthdays in this view yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Switch to &quot;Set Missing DOB&quot; to add student dates of birth in seconds.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Birthday</th>
                  <th className="py-3 px-4">Countdown</th>
                  <th className="py-3 px-4 text-right">Send Birthday Wish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {displayedList.map(({ student: st, info }) => (
                  <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <StudentAvatar
                          name={st.fullName}
                          photoUrl={st.profilePhotoUrl}
                          gender={st.gender}
                          size="sm"
                        />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">
                            {st.fullName}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {st.registrationNo} · {st.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                      {info.formattedDate}
                      {info.ageTurning ? ` (Turning ${info.ageTurning})` : ''}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span
                        className={
                          info.isToday
                            ? 'font-bold text-amber-600 dark:text-amber-400'
                            : info.daysUntil <= 7
                              ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {info.isToday ? 'Today!' : `In ${info.daysUntil} day${info.daysUntil === 1 ? '' : 's'}`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <WhatsAppButton
                          phone={st.phone}
                          message={buildBirthdayWishWhatsApp(st, wishMessage)}
                          size="xs"
                          variant="solid"
                          label="WhatsApp Wish"
                        />
                        <button
                          type="button"
                          disabled={sendingId === st.id}
                          onClick={() => handleSendPortalWish(st)}
                          title="Send in-app Birthday Wish & Student Portal Login Popup"
                          className="inline-flex items-center gap-1 min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                        >
                          <Bell className="w-3 h-3" />
                          {sendingId === st.id ? '...' : 'Portal Popup'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
