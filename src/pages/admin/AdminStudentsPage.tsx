import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  IdCard,
  KeyRound,
  Search,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  SHIFT_DEFINITIONS,
  type BatchRecord,
  type HallName,
  type ShiftType,
  type StudentRecord,
} from '../../types/domain';
import { getDaysUntilExpiry, subscribeStudents } from '../../services/studentService';
import { subscribeBatches } from '../../services/batchService';
import {
  StudentAdmissionModal,
  type AdmissionModalMode,
} from '../../components/admin/StudentAdmissionModal';
import { StudentCredentialsModal } from '../../components/admin/StudentCredentialsModal';
import { StudentDetailDrawer } from '../../components/admin/StudentDetailDrawer';
import { formatGenderLabel, StudentAvatar } from '../../components/common/StudentAvatar';
import { WhatsAppButton } from '../../components/common/WhatsAppButton';

type StudentViewTab = 'all' | 'active' | 'unseated' | 'demo' | 'pending' | 'expiring';

const VALID_TABS: StudentViewTab[] = ['all', 'active', 'unseated', 'demo', 'pending', 'expiring'];

function escapeCsvField(value: string | number | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function AdminStudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialViewParam = searchParams.get('view') as StudentViewTab | null;

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StudentViewTab>(
    initialViewParam && VALID_TABS.includes(initialViewParam) ? initialViewParam : 'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState<ShiftType | 'all'>('all');
  const [hallFilter, setHallFilter] = useState<HallName | 'all'>('all');
  const [batchFilter, setBatchFilter] = useState<string>(searchParams.get('batch') || 'all');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AdmissionModalMode>('regular');
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [credentialsStudent, setCredentialsStudent] = useState<StudentRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const viewParam = searchParams.get('view') as StudentViewTab | null;
    if (viewParam && VALID_TABS.includes(viewParam)) {
      setActiveTab(viewParam);
    } else if (!viewParam) {
      setActiveTab('all');
    }

    const batchParam = searchParams.get('batch');
    if (batchParam) {
      setBatchFilter(batchParam);
    }

    const actionParam = searchParams.get('action');
    if (actionParam === 'add' || actionParam === 'quick' || actionParam === 'demo') {
      setEditingStudent(null);
      setModalMode(actionParam === 'add' ? 'regular' : actionParam);
      setModalOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const unsub = subscribeStudents((list) => {
      setStudents(list);
      setLoading(false);
    });
    const unsubBatches = subscribeBatches(setBatches);
    return () => {
      unsub();
      unsubBatches();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const liveSelectedStudent = useMemo(() => {
    if (!selectedStudent) return null;
    return students.find((s) => s.id === selectedStudent.id) || null;
  }, [selectedStudent, students]);

  const tabCounts = useMemo(() => {
    return {
      all: students.length,
      active: students.filter((s) => s.status === 'active').length,
      unseated: students.filter(
        (s) =>
          (s.status === 'active' || s.status === 'demo') &&
          (s.seatMode === 'unseated' || s.hall === 'Unassigned'),
      ).length,
      demo: students.filter((s) => s.admissionType === 'demo' || s.status === 'demo').length,
      pending: students.filter((s) => Number(s.pendingAmount) > 0).length,
      expiring: students.filter((s) => {
        if (s.status === 'expired') return true;
        const days = getDaysUntilExpiry(s.membershipExpiry);
        return days !== null && days <= 7;
      }).length,
    };
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return students.filter((s) => {
      if (activeTab === 'active' && s.status !== 'active') return false;
      if (
        activeTab === 'unseated' &&
        !((s.status === 'active' || s.status === 'demo') && (s.seatMode === 'unseated' || s.hall === 'Unassigned'))
      ) {
        return false;
      }
      if (activeTab === 'demo' && !(s.admissionType === 'demo' || s.status === 'demo')) {
        return false;
      }
      if (activeTab === 'pending' && !(Number(s.pendingAmount) > 0)) return false;
      if (activeTab === 'expiring') {
        const days = getDaysUntilExpiry(s.membershipExpiry);
        const isExpiringOrExpired = s.status === 'expired' || (days !== null && days <= 7);
        if (!isExpiringOrExpired) return false;
      }

      if (shiftFilter !== 'all' && s.shiftType !== shiftFilter) return false;
      if (hallFilter !== 'all' && s.hall !== hallFilter) return false;
      if (batchFilter === 'unassigned') {
        if (s.batchId) return false;
      } else if (batchFilter !== 'all' && s.batchId !== batchFilter) {
        return false;
      }

      if (q) {
        const haystack = [
          s.fullName,
          s.registrationNo,
          s.phone,
          s.email || '',
          s.seatId || '',
          s.guardianName || '',
          s.batchName || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [students, activeTab, shiftFilter, hallFilter, batchFilter, searchQuery]);

  const handleSelectTab = (tab: StudentViewTab) => {
    setActiveTab(tab);
    if (tab === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ view: tab });
    }
  };

  const openAdmission = (mode: AdmissionModalMode, student?: StudentRecord) => {
    setEditingStudent(student || null);
    setModalMode(mode);
    setModalOpen(true);
  };

  const handleExportCsv = () => {
    const headers = [
      'Registration No',
      'Full Name',
      'Gender',
      'Date of Birth',
      'Exam Batch',
      'Phone',
      'Email',
      'Admission Type',
      'Status',
      'Shift',
      'Seat Mode',
      'Hall',
      'Seat Code',
      'ID Card No',
      'Monthly Fee',
      'Pending Amount',
      'Membership Expiry',
    ];
    const rows = filteredStudents.map((s) => [
      s.registrationNo,
      s.fullName,
      formatGenderLabel(s.gender),
      s.dateOfBirth || '',
      s.batchName || '',
      s.phone,
      s.email || '',
      s.admissionType,
      s.status,
      s.shiftType,
      s.seatMode,
      s.hall,
      s.seatId || '',
      s.cardNumber || '',
      s.monthlyFee,
      s.pendingAmount,
      s.membershipExpiry || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `av_esafe-library-students-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast(`Exported ${filteredStudents.length} student records to CSV.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Student Directory & Admissions · Cloud Firestore Live Sync
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            Student Management
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={filteredStudents.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => openAdmission('demo')}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Clock className="w-3.5 h-3.5" />
            Demo Registration
          </button>
          <button
            type="button"
            onClick={() => openAdmission('quick')}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5" />
            Quick Registration
          </button>
          <button
            type="button"
            onClick={() => openAdmission('regular')}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      </div>

      {toast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Interactive Segmented View Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'all', label: 'All Students', count: tabCounts.all },
            { id: 'active', label: 'Active', count: tabCounts.active },
            { id: 'unseated', label: 'Unseated Students', count: tabCounts.unseated },
            { id: 'demo', label: 'Demo Trials', count: tabCounts.demo },
            { id: 'pending', label: 'Pending Fees', count: tabCounts.pending },
            { id: 'expiring', label: 'Expiring / Expired', count: tabCounts.expiring },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleSelectTab(tab.id)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-[#0B1F3A] dark:bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`font-mono tabular-nums text-[11px] ${
                activeTab === tab.id ? 'text-blue-200' : 'text-slate-400'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, reg ID, phone, email, batch, or seat..."
            className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="md:col-span-3">
          <select
            aria-label="Filter by exam batch"
            value={batchFilter}
            onChange={(e) => {
              const nextBatch = e.target.value;
              setBatchFilter(nextBatch);
              const nextParams = new URLSearchParams(searchParams);
              if (nextBatch === 'all') {
                nextParams.delete('batch');
              } else {
                nextParams.set('batch', nextBatch);
              }
              setSearchParams(nextParams, { replace: true });
            }}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Exam Batches</option>
            <option value="unassigned">General / No Batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            aria-label="Filter by shift"
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value as ShiftType | 'all')}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Shifts</option>
            {SHIFT_DEFINITIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            aria-label="Filter by hall"
            value={hallFilter}
            onChange={(e) => setHallFilter(e.target.value as HallName | 'all')}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Halls</option>
            <option value="Hall 1">Hall 1 (80 Seats)</option>
            <option value="Hall 2">Hall 2 (40 Seats)</option>
            <option value="Unassigned">Unassigned</option>
          </select>
        </div>
      </div>

      {/* High-Density Student Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((row) => (
              <div
                key={row}
                className="h-11 rounded-lg bg-slate-100 dark:bg-slate-800/80 animate-pulse"
              />
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {students.length === 0
                ? 'No students enrolled yet'
                : 'No students match the current filters'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {students.length === 0
                ? 'Start enrolling students using Full Admission, Quick Registration, or Demo Trial.'
                : 'Adjust your search term, shift filter, or active view tab to see matching records.'}
            </p>
            {students.length === 0 ? (
              <div className="pt-2 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => openAdmission('regular')}
                  className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold hover:bg-[#132E54] cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Add First Student
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShiftFilter('all');
                  setHallFilter('all');
                  setBatchFilter('all');
                  handleSelectTab('all');
                }}
                className="inline-flex items-center min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-5">Student & Reg ID</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Shift & Seat</th>
                  <th className="py-3.5 px-4">Status & Expiry</th>
                  <th className="py-3.5 px-4 text-right">Fee / Due</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filteredStudents.map((st) => {
                  const daysLeft = getDaysUntilExpiry(st.membershipExpiry);
                  const shiftObj = SHIFT_DEFINITIONS.find((d) => d.id === st.shiftType);
                  const statusColor =
                    st.status === 'active'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : st.status === 'demo'
                        ? 'text-blue-700 dark:text-blue-400'
                        : st.status === 'expired' || st.status === 'suspended'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400';

                  return (
                    <tr
                      key={st.id}
                      onClick={() => setSelectedStudent(st)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3 min-w-0">
                          <StudentAvatar
                            name={st.fullName}
                            photoUrl={st.profilePhotoUrl}
                            gender={st.gender}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {st.fullName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              <span className="font-mono">{st.registrationNo}</span> ·{' '}
                              <span className="capitalize">{st.admissionType}</span>
                              {st.gender ? ` · ${formatGenderLabel(st.gender)}` : ''}
                              {st.dateOfBirth ? ` · DOB ${st.dateOfBirth}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200">
                          {st.phone}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[180px]">
                          {st.email || 'No portal email'}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {shiftObj?.label || st.shiftType}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {st.seatMode === 'unseated'
                            ? 'Unseated'
                            : `${st.hall}${st.seatId ? ` · ${st.seatId}` : ''} (${st.seatMode.replace('_', ' ')})`}
                        </p>
                        {st.batchName && (
                          <p className="text-[11px] font-medium text-blue-700 dark:text-sky-400 mt-0.5 truncate max-w-[180px]">
                            {st.batchName}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <p className={`text-xs font-semibold capitalize ${statusColor}`}>
                          {st.status}
                        </p>
                        <p className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {st.membershipExpiry || 'No expiry'}
                          {daysLeft !== null && daysLeft <= 7 && (
                            <span
                              className={`ml-1.5 ${
                                daysLeft < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`})
                            </span>
                          )}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                          ₹{st.monthlyFee.toLocaleString('en-IN')}
                        </p>
                        <p
                          className={`text-xs mt-0.5 ${
                            st.pendingAmount > 0
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {st.pendingAmount > 0
                            ? `Due ₹${st.pendingAmount.toLocaleString('en-IN')}`
                            : 'Paid'}
                        </p>
                      </td>

                      <td
                        className="py-3.5 px-5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <WhatsAppButton
                            phone={st.phone}
                            label=""
                            size="xs"
                            variant="outline"
                            title={`Chat with ${st.fullName} on WhatsApp`}
                            message={`Hello ${st.fullName}, this is Av_eSAFE Library (Electronic City, Bangalore).`}
                            className="min-h-[34px] min-w-[34px] px-0"
                          />
                          <button
                            type="button"
                            onClick={() => setCredentialsStudent(st)}
                            aria-label={`Manage login credentials for ${st.fullName}`}
                            title="Manage Student Email & Password"
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-[#0B1F3A] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <Link
                            to={`/admin/students/id-cards?studentId=${encodeURIComponent(st.id)}`}
                            aria-label={`ID Card for ${st.fullName}`}
                            title="Print / Manage ID Card"
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-[#0B1F3A] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <IdCard className="w-4 h-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(st)}
                            aria-label={`View ${st.fullName}`}
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-[#0B1F3A] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openAdmission('edit', st)}
                            aria-label={`Edit ${st.fullName}`}
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-[#0B1F3A] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admission & Edit Modal */}
      <StudentAdmissionModal
        open={modalOpen}
        initialMode={modalMode}
        editingStudent={editingStudent}
        onClose={() => setModalOpen(false)}
        onSuccess={(msg) => setToast(msg)}
      />

      {/* Student Email & Password Credentials Modal */}
      <StudentCredentialsModal
        student={
          credentialsStudent
            ? students.find((s) => s.id === credentialsStudent.id) || credentialsStudent
            : null
        }
        onClose={() => setCredentialsStudent(null)}
        onSuccess={(msg) => setToast(msg)}
      />

      {/* Detail Slide-over Drawer */}
      <StudentDetailDrawer
        student={liveSelectedStudent}
        onClose={() => setSelectedStudent(null)}
        onEdit={(st) => {
          setSelectedStudent(null);
          openAdmission('edit', st);
        }}
        onManageCredentials={(st) => {
          setSelectedStudent(null);
          setCredentialsStudent(st);
        }}
        onActionComplete={(msg) => setToast(msg)}
      />
    </div>
  );
}
