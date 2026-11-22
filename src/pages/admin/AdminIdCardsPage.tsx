import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CheckSquare,
  Download,
  ExternalLink,
  History,
  IdCard,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AnimatedCounter } from '../../components/common/AnimatedCounter';
import { StudentAvatar, formatGenderLabel } from '../../components/common/StudentAvatar';
import {
  PrintableIdCardSheet,
  StudentIdCardPreview,
} from '../../components/admin/StudentIdCardPreview';
import { subscribeStudents } from '../../services/studentService';
import {
  issueOrReissueStudentIdCard,
  recordIdCardReprint,
  revokeStudentIdCard,
  subscribeIdCards,
  verifyIdCardPublic,
} from '../../services/idCardService';
import {
  downloadBulkIdCardsA4Pdf,
  downloadSingleCr80IdCardPdf,
  type PrintableIdCardItem,
} from '../../lib/idCardPdf';
import {
  SHIFT_DEFINITIONS,
  type CardVerificationResponse,
  type IdCardRecord,
  type StudentRecord,
} from '../../types/domain';

type WorkspaceTab = 'studio' | 'history';
type StatusFilter = 'all' | 'active' | 'inactive' | 'demo';
type CardFilter = 'all' | 'issued' | 'unissued' | 'revoked';

function formatTimestampShort(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AdminIdCardsPage() {
  const { adminProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const initialStudentIdParam = searchParams.get('studentId') || '';

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [idCards, setIdCards] = useState<IdCardRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');

  const [focusedStudentId, setFocusedStudentId] = useState<string>(initialStudentIdParam);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Inline reissue & revoke prompts (no window.confirm)
  const [reissueTargetId, setReissueTargetId] = useState<string | null>(null);
  const [reissueReason, setReissueReason] = useState('Lost / damaged physical card replacement');
  const [revokeCardNumber, setRevokeCardNumber] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('Reported lost by student');

  // Print queue rendered inside #nirvana-printable-id-cards for browser window.print()
  const [printQueue, setPrintQueue] = useState<PrintableIdCardItem[]>([]);

  // Live QR verification tester
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<CardVerificationResponse | null>(null);

  useEffect(() => {
    let sDone = false;
    let cDone = false;
    const markReady = () => {
      if (sDone && cDone) setLoading(false);
    };

    const unsubStudents = subscribeStudents((data) => {
      setStudents(data);
      sDone = true;
      markReady();
    });

    const unsubCards = subscribeIdCards((data) => {
      setIdCards(data);
      cDone = true;
      markReady();
    });

    return () => {
      unsubStudents();
      unsubCards();
    };
  }, []);

  // Auto-focus first student or query-param student once loaded
  useEffect(() => {
    if (students.length === 0) return;
    if (initialStudentIdParam && students.some((s) => s.id === initialStudentIdParam)) {
      setFocusedStudentId(initialStudentIdParam);
      return;
    }
    if (!focusedStudentId || !students.some((s) => s.id === focusedStudentId)) {
      setFocusedStudentId(students[0].id);
    }
  }, [students, initialStudentIdParam, focusedStudentId]);

  const studentById = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    for (const s of students) map.set(s.id, s);
    return map;
  }, [students]);

  const cardByNumber = useMemo(() => {
    const map = new Map<string, IdCardRecord>();
    for (const c of idCards) map.set(c.cardNumber, c);
    return map;
  }, [idCards]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students
      .filter((s) => {
        if (statusFilter === 'active' && s.status !== 'active') return false;
        if (
          statusFilter === 'inactive' &&
          s.status !== 'inactive' &&
          s.status !== 'expired' &&
          s.status !== 'suspended'
        ) {
          return false;
        }
        if (statusFilter === 'demo' && s.status !== 'demo') return false;

        const hasActiveCard = Boolean(s.cardNumber && s.cardStatus !== 'revoked');
        const isRevoked = s.cardStatus === 'revoked';
        if (cardFilter === 'issued' && !hasActiveCard) return false;
        if (cardFilter === 'unissued' && Boolean(s.cardNumber)) return false;
        if (cardFilter === 'revoked' && !isRevoked) return false;

        if (q) {
          const hay = `${s.fullName} ${s.registrationNo} ${s.phone} ${s.cardNumber || ''} ${
            s.seatId || ''
          }`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, searchQuery, statusFilter, cardFilter]);

  const focusedStudent = useMemo(
    () => students.find((s) => s.id === focusedStudentId) || filteredStudents[0] || null,
    [students, focusedStudentId, filteredStudents],
  );

  const focusedCardRecord = useMemo(() => {
    if (!focusedStudent?.cardNumber) return null;
    return cardByNumber.get(focusedStudent.cardNumber) || null;
  }, [focusedStudent, cardByNumber]);

  const stats = useMemo(() => {
    const issuedCount = students.filter(
      (s) => Boolean(s.cardNumber) && s.cardStatus !== 'revoked',
    ).length;
    const unissuedCount = students.filter((s) => !s.cardNumber).length;
    const totalReprints = idCards.reduce((sum, c) => sum + (c.reprintCount || 0), 0);
    return {
      totalStudents: students.length,
      issuedCount,
      unissuedCount,
      totalReprints,
    };
  }, [students, idCards]);

  const allFilteredSelected =
    filteredStudents.length > 0 && filteredStudents.every((s) => selectedIds.has(s.id));

  const toggleSelectOne = (studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredStudents.forEach((s) => next.delete(s.id));
      } else {
        filteredStudents.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const selectedStudents = useMemo(
    () => students.filter((s) => selectedIds.has(s.id)),
    [students, selectedIds],
  );

  const triggerBrowserPrint = (items: PrintableIdCardItem[]) => {
    if (items.length === 0) return;
    setPrintQueue(items);
    // Allow QR codes inside #nirvana-printable-id-cards to render before invoking print dialog
    window.setTimeout(() => {
      window.print();
    }, 350);
  };

  /**
   * Ensures a student has an active card number, issuing one automatically if none exists or if revoked.
   */
  const ensureIssuedCard = async (student: StudentRecord): Promise<PrintableIdCardItem> => {
    if (!adminProfile) {
      throw new Error('Administrator session required to issue ID cards.');
    }
    if (student.cardNumber && student.cardStatus !== 'revoked') {
      return { student, cardNumber: student.cardNumber };
    }
    const issued = await issueOrReissueStudentIdCard(student, adminProfile);
    return {
      student: { ...student, cardNumber: issued.cardNumber, cardStatus: 'active' },
      cardNumber: issued.cardNumber,
    };
  };

  const handleIssueSingle = async (student: StudentRecord, reason?: string) => {
    if (!adminProfile) return;
    setFeedback(null);
    setBusyAction(`issue-${student.id}`);
    try {
      const res = await issueOrReissueStudentIdCard(student, adminProfile, {
        reissueReason: reason,
      });
      setReissueTargetId(null);
      setFeedback({
        type: 'success',
        message: res.supersededCardNumber
          ? `Reissued card ${res.cardNumber} for ${student.fullName}. Previous card ${res.supersededCardNumber} has been invalidated.`
          : `Issued unique ID card ${res.cardNumber} for ${student.fullName}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to issue student ID card.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadSinglePdf = async (student: StudentRecord) => {
    setFeedback(null);
    setBusyAction(`pdf-${student.id}`);
    try {
      const item = await ensureIssuedCard(student);
      await downloadSingleCr80IdCardPdf(item);
      setFeedback({
        type: 'success',
        message: `Downloaded CR80 PDF for ${student.fullName} (${item.cardNumber}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to generate CR80 PDF.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePrintSingle = async (student: StudentRecord, logReprint: boolean) => {
    if (!adminProfile) return;
    setFeedback(null);
    setBusyAction(`print-${student.id}`);
    try {
      const item = await ensureIssuedCard(student);
      if (logReprint) {
        const existingCard = cardByNumber.get(item.cardNumber);
        if (existingCard) {
          await recordIdCardReprint(existingCard, adminProfile, 'Reprint from ID Card Studio');
        }
      }
      triggerBrowserPrint([item]);
      setFeedback({
        type: 'success',
        message: logReprint
          ? `Logged reprint and opened print preview for ${student.fullName} (${item.cardNumber}).`
          : `Opened print preview for ${student.fullName} (${item.cardNumber}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to prepare print sheet.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReprintFromHistory = async (card: IdCardRecord, mode: 'pdf' | 'print') => {
    if (!adminProfile) return;
    const stu = studentById.get(card.studentId);
    if (!stu) {
      setFeedback({
        type: 'error',
        message: 'Linked student record not found for this card.',
      });
      return;
    }
    setFeedback(null);
    setBusyAction(`reprint-${card.cardNumber}`);
    try {
      await recordIdCardReprint(
        card,
        adminProfile,
        mode === 'pdf' ? 'PDF reprint download' : 'Direct browser reprint',
      );
      const item: PrintableIdCardItem = { student: stu, cardNumber: card.cardNumber };
      if (mode === 'pdf') {
        await downloadSingleCr80IdCardPdf(item);
      } else {
        triggerBrowserPrint([item]);
      }
      setFeedback({
        type: 'success',
        message: `Recorded reprint #${(card.reprintCount || 0) + 1} for ${card.cardNumber}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to log card reprint.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeCard = async (card: IdCardRecord) => {
    if (!adminProfile) return;
    setFeedback(null);
    setBusyAction(`revoke-${card.cardNumber}`);
    try {
      await revokeStudentIdCard(card, adminProfile, revokeReason);
      setRevokeCardNumber(null);
      setFeedback({
        type: 'success',
        message: `Revoked ID card ${card.cardNumber}. Scanning its QR code now returns REVOKED.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to revoke card.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleBulkIssue = async () => {
    if (!adminProfile || selectedStudents.length === 0) return;
    const needIssuing = selectedStudents.filter(
      (s) => !s.cardNumber || s.cardStatus === 'revoked',
    );
    if (needIssuing.length === 0) {
      setFeedback({
        type: 'success',
        message: 'All selected students already have active ID cards issued.',
      });
      return;
    }

    setFeedback(null);
    setBusyAction('bulk-issue');
    try {
      let issuedCount = 0;
      for (const stu of needIssuing) {
        await issueOrReissueStudentIdCard(stu, adminProfile);
        issuedCount += 1;
      }
      setFeedback({
        type: 'success',
        message: `Issued ${issuedCount} new unique student ID card${issuedCount === 1 ? '' : 's'}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Bulk issuance encountered an error.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleBulkAction = async (mode: 'pdf' | 'print') => {
    if (!adminProfile || selectedStudents.length === 0) return;
    setFeedback(null);
    setBusyAction(`bulk-${mode}`);
    try {
      const items: PrintableIdCardItem[] = [];
      for (const stu of selectedStudents) {
        const item = await ensureIssuedCard(stu);
        items.push(item);
      }

      if (mode === 'pdf') {
        await downloadBulkIdCardsA4Pdf(items);
        setFeedback({
          type: 'success',
          message: `Downloaded A4 print-ready PDF with ${items.length} CR80 ID card${
            items.length === 1 ? '' : 's'
          } (front & duplex-aligned back sheets).`,
        });
      } else {
        triggerBrowserPrint(items);
        setFeedback({
          type: 'success',
          message: `Prepared A4 print preview for ${items.length} student ID card${
            items.length === 1 ? '' : 's'
          }.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to prepare bulk student ID cards.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunVerifyCheck = async (cardNumberOverride?: string) => {
    const code = (cardNumberOverride ?? verifyInput).trim().toUpperCase();
    if (!code) return;
    setVerifyInput(code);
    setVerifyLoading(true);
    try {
      const res = await verifyIdCardPublic(code);
      setVerifyResult(res);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Verification request failed.',
      });
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <>
      <div className="no-print space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Student ID Card Management
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Issue CR80 (85.6 mm × 54 mm) identity cards with scannable QR verification, bulk A4
              PDF sheets, reprints, and instant revocation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/verify"
              className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
              Public Verify Portal
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 surface-card">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Total Students</span>
              <Users className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              <AnimatedCounter value={stats.totalStudents} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Registered in Av_eSAFE Library
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 surface-card">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Active Issued Cards</span>
              <IdCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              <AnimatedCounter value={stats.issuedCount} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              QR verification enabled
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 surface-card">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Awaiting First Card</span>
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              <AnimatedCounter value={stats.unissuedCount} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Ready for single or bulk issue
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 surface-card">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Reprints Logged</span>
              <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              <AnimatedCounter value={stats.totalReprints} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Tracked across {idCards.length} issued records
            </p>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="flex-1">{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs font-semibold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Workspace Container */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden surface-card">
          {/* Tabs */}
          <div className="px-5 pt-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('studio')}
                className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'studio'
                    ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                ID Card Studio &amp; Bulk Print ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'history'
                    ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Issuance &amp; Reprint Registry ({idCards.length})
              </button>
            </div>
          </div>

          {/* TAB 1: STUDIO & BULK SELECTION */}
          {activeTab === 'studio' && (
            <div className="p-5 space-y-5">
              {/* Search, Filter & Bulk Actions Bar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-5 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, Student ID, phone, or card number..."
                    className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 dark:focus:ring-sky-400/20"
                  />
                </div>

                <div className="md:col-span-3">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    aria-label="Filter by student status"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All Student Statuses</option>
                    <option value="active">Active Students</option>
                    <option value="inactive">Inactive / Expired / Suspended</option>
                    <option value="demo">Demo Trial</option>
                  </select>
                </div>

                <div className="md:col-span-4">
                  <select
                    value={cardFilter}
                    onChange={(e) => setCardFilter(e.target.value as CardFilter)}
                    aria-label="Filter by ID card status"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All Card States</option>
                    <option value="issued">Active Card Issued</option>
                    <option value="unissued">No Card Issued Yet</option>
                    <option value="revoked">Revoked Card</option>
                  </select>
                </div>
              </div>

              {/* Bulk Selection Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#0B1F3A] dark:hover:text-sky-400 cursor-pointer"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    {allFilteredSelected
                      ? `Deselect All (${filteredStudents.length})`
                      : `Select All Filtered (${filteredStudents.length})`}
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {selectedIds.size} selected
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || busyAction !== null}
                    onClick={handleBulkIssue}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 cursor-pointer"
                  >
                    {busyAction === 'bulk-issue' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <IdCard className="w-3.5 h-3.5" />
                    )}
                    Generate Selected Cards
                  </button>

                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || busyAction !== null}
                    onClick={() => handleBulkAction('print')}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 cursor-pointer"
                  >
                    {busyAction === 'bulk-print' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Printer className="w-3.5 h-3.5" />
                    )}
                    Print Selected ({selectedIds.size})
                  </button>

                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || busyAction !== null}
                    onClick={() => handleBulkAction('pdf')}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-lg bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-xs font-semibold transition-colors disabled:opacity-45 cursor-pointer"
                  >
                    {busyAction === 'bulk-pdf' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Bulk A4 PDF ({selectedIds.size})
                  </button>
                </div>
              </div>

              {/* Split Workspace: Student Selector Table (Left) + CR80 Card Preview & Controls (Right) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Student Directory List */}
                <div className="xl:col-span-7 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {loading ? (
                    <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                      Loading student records...
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="py-14 text-center px-4">
                      <IdCard className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        No students match the current filters
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Clear search or switch status/card filters to browse all students.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                          <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <th className="py-3 pl-4 pr-2 w-10">
                              <span className="sr-only">Select</span>
                            </th>
                            <th className="py-3 px-3">Student</th>
                            <th className="py-3 px-3">Seat &amp; Status</th>
                            <th className="py-3 px-3">ID Card</th>
                            <th className="py-3 pl-3 pr-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                          {filteredStudents.map((stu) => {
                            const isSelected = selectedIds.has(stu.id);
                            const isFocused = focusedStudent?.id === stu.id;
                            const shiftLabel =
                              SHIFT_DEFINITIONS.find((sh) => sh.id === stu.shiftType)?.label ||
                              stu.shiftType;
                            return (
                              <tr
                                key={stu.id}
                                onClick={() => setFocusedStudentId(stu.id)}
                                className={`cursor-pointer transition-colors ${
                                  isFocused
                                    ? 'bg-[#0B1F3A]/[0.05] dark:bg-sky-400/10'
                                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <td
                                  className="py-3 pl-4 pr-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectOne(stu.id);
                                  }}
                                >
                                  <button
                                    type="button"
                                    aria-label={`Select ${stu.fullName}`}
                                    className="p-1 text-slate-500 hover:text-[#0B1F3A] dark:hover:text-sky-400 cursor-pointer"
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                                    ) : (
                                      <Square className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <StudentAvatar
                                      name={stu.fullName}
                                      gender={stu.gender}
                                      photoUrl={stu.profilePhotoUrl}
                                      size="sm"
                                    />
                                    <div className="min-w-0">
                                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                                        {stu.fullName}
                                      </p>
                                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                        {stu.registrationNo} · {stu.phone}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-xs">
                                  <p className="font-medium text-slate-800 dark:text-slate-200">
                                    {stu.seatId ? `${stu.seatId} · ${stu.hall}` : `${stu.hall} (Unseated)`}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                                    {stu.status} · {shiftLabel}
                                  </p>
                                </td>
                                <td className="py-3 px-3">
                                  {stu.cardNumber ? (
                                    <div>
                                      <p className="font-mono text-xs font-semibold text-[#0B1F3A] dark:text-sky-400">
                                        {stu.cardNumber}
                                      </p>
                                      <p
                                        className={`text-[11px] font-medium capitalize ${
                                          stu.cardStatus === 'revoked'
                                            ? 'text-rose-600 dark:text-rose-400'
                                            : 'text-emerald-700 dark:text-emerald-400'
                                        }`}
                                      >
                                        {stu.cardStatus || 'active'}
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400">Not issued</span>
                                  )}
                                </td>
                                <td
                                  className="py-3 pl-3 pr-4 text-right whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="inline-flex items-center gap-1.5">
                                    {!stu.cardNumber || stu.cardStatus === 'revoked' ? (
                                      <button
                                        type="button"
                                        disabled={busyAction !== null}
                                        onClick={() => handleIssueSingle(stu)}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                      >
                                        Issue
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={busyAction !== null}
                                        onClick={() => handleDownloadSinglePdf(stu)}
                                        title="Download CR80 PDF"
                                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </button>
                                    )}
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

                {/* Live CR80 Preview & Card Lifecycle Actions */}
                <div className="xl:col-span-5 space-y-4">
                  {focusedStudent ? (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-slate-50/60 dark:bg-slate-950/60 space-y-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <StudentAvatar
                            name={focusedStudent.fullName}
                            gender={focusedStudent.gender}
                            photoUrl={focusedStudent.profilePhotoUrl}
                            size="md"
                          />
                          <div className="min-w-0">
                            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                              {focusedStudent.fullName}
                            </h2>
                            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {focusedStudent.registrationNo} · {formatGenderLabel(focusedStudent.gender)}
                            </p>
                          </div>
                        </div>
                        {focusedStudent.cardNumber && focusedStudent.cardStatus !== 'revoked' && (
                          <Link
                            to={`/verify/${encodeURIComponent(focusedStudent.cardNumber)}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline shrink-0"
                          >
                            Verify Link
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>

                      {/* Actual CR80 Front + Back Visual Preview */}
                      <StudentIdCardPreview
                        student={focusedStudent}
                        cardNumber={
                          focusedStudent.cardStatus !== 'revoked'
                            ? focusedStudent.cardNumber
                            : undefined
                        }
                      />

                      {/* Primary Card Actions */}
                      <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                        {!focusedStudent.cardNumber || focusedStudent.cardStatus === 'revoked' ? (
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => handleIssueSingle(focusedStudent)}
                            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {busyAction === `issue-${focusedStudent.id}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <IdCard className="w-4 h-4" />
                            )}
                            {focusedStudent.cardStatus === 'revoked'
                              ? 'Issue Replacement ID Card'
                              : 'Generate & Issue Official ID Card'}
                          </button>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2.5">
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => handleDownloadSinglePdf(focusedStudent)}
                                className="min-h-[42px] inline-flex items-center justify-center gap-2 px-3 rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {busyAction === `pdf-${focusedStudent.id}` ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4" />
                                )}
                                CR80 PDF
                              </button>

                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => handlePrintSingle(focusedStudent, true)}
                                className="min-h-[42px] inline-flex items-center justify-center gap-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                <Printer className="w-4 h-4" />
                                Print / Reprint
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setReissueTargetId(
                                    reissueTargetId === focusedStudent.id
                                      ? null
                                      : focusedStudent.id,
                                  );
                                  setRevokeCardNumber(null);
                                }}
                                className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Reissue New ID
                              </button>

                              {focusedCardRecord && focusedCardRecord.status === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRevokeCardNumber(
                                      revokeCardNumber === focusedCardRecord.cardNumber
                                        ? null
                                        : focusedCardRecord.cardNumber,
                                    );
                                    setReissueTargetId(null);
                                  }}
                                  className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl border border-rose-200 dark:border-rose-900/70 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  Revoke Card
                                </button>
                              )}
                            </div>

                            {/* Inline Reissue Confirmation */}
                            {reissueTargetId === focusedStudent.id && (
                              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2.5">
                                <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                                  Reissue will supersede &amp; invalidate {focusedStudent.cardNumber}
                                </p>
                                <input
                                  type="text"
                                  value={reissueReason}
                                  onChange={(e) => setReissueReason(e.target.value)}
                                  placeholder="Reason for reissuing..."
                                  className="w-full min-h-[36px] px-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busyAction !== null}
                                    onClick={() => handleIssueSingle(focusedStudent, reissueReason)}
                                    className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold cursor-pointer"
                                  >
                                    Confirm Reissue
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReissueTargetId(null)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Inline Revoke Confirmation */}
                            {focusedCardRecord &&
                              revokeCardNumber === focusedCardRecord.cardNumber && (
                                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2.5">
                                  <p className="text-xs font-semibold text-rose-950 dark:text-rose-100">
                                    Immediately revoke {focusedCardRecord.cardNumber}?
                                  </p>
                                  <input
                                    type="text"
                                    value={revokeReason}
                                    onChange={(e) => setRevokeReason(e.target.value)}
                                    placeholder="Revocation reason..."
                                    className="w-full min-h-[36px] px-3 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-xs"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={busyAction !== null}
                                      onClick={() => handleRevokeCard(focusedCardRecord)}
                                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                                    >
                                      Confirm Revoke
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRevokeCardNumber(null)}
                                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      Select a student on the left to preview and manage their CR80 ID card.
                    </div>
                  )}

                  {/* Quick Live QR Verification Tester */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                        Live QR Verification Check
                      </p>
                      {focusedStudent?.cardNumber && (
                        <button
                          type="button"
                          onClick={() => handleRunVerifyCheck(focusedStudent.cardNumber)}
                          className="text-[11px] font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline cursor-pointer"
                        >
                          Test Focused Card
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={verifyInput}
                        onChange={(e) => setVerifyInput(e.target.value.toUpperCase())}
                        placeholder="AVE-2026-XXXXXXXX"
                        className="flex-1 min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs"
                      />
                      <button
                        type="button"
                        disabled={!verifyInput.trim() || verifyLoading}
                        onClick={() => handleRunVerifyCheck()}
                        className="px-3.5 min-h-[38px] rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-950 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                      >
                        {verifyLoading ? 'Checking...' : 'Verify'}
                      </button>
                    </div>

                    {verifyResult && (
                      <div
                        className={`p-3 rounded-xl border text-xs ${
                          verifyResult.verdict === 'VALID'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                            : verifyResult.verdict === 'EXPIRED' ||
                                verifyResult.verdict === 'INACTIVE'
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 font-semibold">
                          <span>Verdict: {verifyResult.verdict}</span>
                          <span className="font-mono">
                            {verifyResult.card?.cardNumber || verifyInput}
                          </span>
                        </div>
                        <p className="mt-1 opacity-90">{verifyResult.reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ISSUANCE & REPRINT REGISTRY */}
          {activeTab === 'history' && (
            <div className="p-5">
              {idCards.length === 0 ? (
                <div className="py-12 text-center">
                  <IdCard className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    No student ID cards have been issued yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Switch to ID Card Studio to generate individual or bulk CR80 identity cards.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <th className="py-3 pr-4">Card Number</th>
                        <th className="py-3 px-4">Student</th>
                        <th className="py-3 px-4">Issued / Valid Until</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Reprints</th>
                        <th className="py-3 pl-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                      {idCards.map((card) => {
                        const stu = studentById.get(card.studentId);
                        return (
                          <tr
                            key={card.cardNumber}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="py-3 pr-4 font-mono text-xs font-semibold text-[#0B1F3A] dark:text-sky-400">
                              {card.cardNumber}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <StudentAvatar
                                  name={card.studentName}
                                  gender={stu?.gender}
                                  photoUrl={stu?.profilePhotoUrl}
                                  size="xs"
                                />
                                <div>
                                  <p className="font-medium text-slate-900 dark:text-white">
                                    {card.studentName}
                                  </p>
                                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    {card.registrationNo} · {card.seatId || card.hall}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                              <p>{formatTimestampShort(card.issuedAt)}</p>
                              <p className="text-[11px] text-slate-400">
                                Exp: {card.validUntil || 'Active'}
                              </p>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <span
                                className={`font-semibold capitalize ${
                                  card.status === 'active'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : card.status === 'superseded'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {card.status}
                              </span>
                              {card.revokedReason && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                                  {card.revokedReason}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                              {card.reprintCount || 0}
                            </td>
                            <td className="py-3 pl-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <Link
                                  to={`/verify/${encodeURIComponent(card.cardNumber)}`}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  Verify
                                </Link>
                                {card.status === 'active' && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busyAction !== null}
                                      onClick={() => handleReprintFromHistory(card, 'pdf')}
                                      className="px-2.5 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Reprint PDF
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyAction !== null}
                                      onClick={() => handleReprintFromHistory(card, 'print')}
                                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                                      title="Reprint via browser print"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
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
          )}
        </div>
      </div>

      {/* Print-only exact CR80 A4 sheet */}
      <PrintableIdCardSheet items={printQueue} />
    </>
  );
}
