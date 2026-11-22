import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  BookMarked,
  CheckCircle2,
  Edit3,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  batchFormSchema,
  createBatchRecord,
  deleteBatchRecord,
  seedStarterBatches,
  subscribeBatches,
  toggleBatchActiveStatus,
  updateBatchRecord,
} from '../../services/batchService';
import { subscribeStudents } from '../../services/studentService';
import {
  BATCH_CATEGORIES,
  type BatchCategory,
  type BatchRecord,
  type StudentRecord,
} from '../../types/domain';

function categoryLabel(cat: BatchCategory): string {
  return BATCH_CATEGORIES.find((c) => c.id === cat)?.label || cat;
}

export function AdminBatchesPage() {
  const { adminProfile } = useAuth();
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<BatchCategory | 'all'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchRecord | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState<BatchCategory>('upsc');
  const [targetExam, setTargetExam] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  useEffect(() => {
    const u1 = subscribeBatches((list) => {
      setBatches(list);
      setLoading(false);
    });
    const u2 = subscribeStudents(setStudents);
    return () => {
      u1();
      u2();
    };
  }, []);

  const studentCountByBatch = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const st of students) {
      if (st.batchId) {
        counts[st.batchId] = (counts[st.batchId] || 0) + 1;
      }
    }
    return counts;
  }, [students]);

  const totalAssignedStudents = useMemo(
    () => students.filter((s) => Boolean(s.batchId)).length,
    [students],
  );

  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return batches.filter((b) => {
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
      if (q) {
        const hay = `${b.name} ${b.code} ${b.targetExam || ''} ${b.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [batches, categoryFilter, searchQuery]);

  const openCreateModal = () => {
    setEditingBatch(null);
    setName('');
    setCode('');
    setCategory('upsc');
    setTargetExam('');
    setDescription('');
    setActive(true);
    setModalOpen(true);
  };

  const openEditModal = (batch: BatchRecord) => {
    setEditingBatch(batch);
    setName(batch.name);
    setCode(batch.code);
    setCategory(batch.category);
    setTargetExam(batch.targetExam || '');
    setDescription(batch.description || '');
    setActive(batch.active);
    setModalOpen(true);
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setFeedback(null);

    const parsed = batchFormSchema.safeParse({
      name,
      code,
      category,
      targetExam,
      description,
      active,
    });
    if (!parsed.success) {
      setFeedback({
        type: 'error',
        text: parsed.error.issues[0]?.message || 'Please check the batch details.',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (editingBatch) {
        await updateBatchRecord(editingBatch.id, parsed.data, adminProfile);
        setFeedback({ type: 'success', text: `Updated batch "${parsed.data.name}".` });
      } else {
        await createBatchRecord(parsed.data, adminProfile);
        setFeedback({ type: 'success', text: `Created exam batch "${parsed.data.name}".` });
      }
      setModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save exam batch.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeedStarterBatches = async () => {
    if (!adminProfile) return;
    setFeedback(null);
    setSeeding(true);
    try {
      const created = await seedStarterBatches(batches, adminProfile);
      setFeedback({
        type: 'success',
        text:
          created > 0
            ? `Loaded ${created} exam batches (UPSC, BPSC, Railway, Banking, SSC, IT/GATE).`
            : 'All starter exam batches are already present.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to load starter batches.',
      });
    } finally {
      setSeeding(false);
    }
  };

  const handleDeleteBatch = async (batch: BatchRecord) => {
    if (!adminProfile) return;
    setFeedback(null);
    try {
      await deleteBatchRecord(batch, adminProfile);
      setConfirmDeleteId(null);
      setFeedback({ type: 'success', text: `Deleted batch "${batch.name}".` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete batch.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Academic &amp; Competitive Exam Cohorts · Av_eSAFE Library
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            Exam &amp; Study Batches
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Organize students by exam preparation goal — UPSC, BPSC, Railway, Banking, SSC, NEET/JEE, or IT Prep.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedStarterBatches()}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#C89B3C]" />
            {seeding ? 'Loading...' : 'Load Starter Exam Batches'}
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Batch
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Batches</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            {batches.length}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Active Batches</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1.5">
            {batches.filter((b) => b.active).length}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Students in Batches</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            {totalAssignedStudents}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Unassigned to Batch</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1.5">
            {Math.max(0, students.length - totalAssignedStudents)}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs ${
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
          <span className="flex-1">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Category Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-8 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search batch name, code, or target exam..."
            className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="md:col-span-4">
          <select
            aria-label="Filter by exam category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as BatchCategory | 'all')}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Exam Categories</option>
            {BATCH_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Batches Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
          <BookMarked className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
            {batches.length === 0 ? 'No exam batches configured yet' : 'No batches match your search'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {batches.length === 0
              ? 'Create custom exam batches or load our 6 starter cohorts (UPSC, BPSC, Railway, Banking, SSC, IT/GATE) in one click.'
              : 'Try clearing your search or category filter.'}
          </p>
          {batches.length === 0 && (
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleSeedStarterBatches()}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Load 6 Starter Exam Batches
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create Custom Batch
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBatches.map((batch) => {
            const count = studentCountByBatch[batch.id] || 0;
            return (
              <div
                key={batch.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {batch.code} · {categoryLabel(batch.category)}
                      </p>
                      <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white mt-0.5">
                        {batch.name}
                      </h2>
                    </div>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        batch.active
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {batch.active ? 'Active' : 'Archived'}
                    </span>
                  </div>

                  {batch.targetExam && (
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Target: {batch.targetExam}
                    </p>
                  )}

                  {batch.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                      {batch.description}
                    </p>
                  )}
                </div>

                <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                      <Users className="w-3.5 h-3.5 text-[#0B1F3A] dark:text-sky-400" />
                      <span className="font-mono tabular-nums font-semibold">{count}</span> enrolled
                    </span>
                    <Link
                      to={`/admin/students?batch=${encodeURIComponent(batch.id)}`}
                      className="inline-flex items-center gap-1 font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline"
                    >
                      View Students
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {confirmDeleteId === batch.id ? (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                        Delete permanently?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDeleteBatch(batch)}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          adminProfile && void toggleBatchActiveStatus(batch, adminProfile)
                        }
                        className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        {batch.active ? 'Archive' : 'Reactivate'}
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(batch)}
                          aria-label={`Edit ${batch.name}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-[#0B1F3A] dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(batch.id)}
                          aria-label={`Delete ${batch.name}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Batch Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-[#0B1F3A] dark:text-white">
                  {editingBatch ? `Edit Batch · ${editingBatch.code}` : 'Create Exam / Study Batch'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close modal"
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveBatch} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Batch Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Railway RRB NTPC 2026"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Batch Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                      placeholder="RRB-2026"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono uppercase text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Exam Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as BatchCategory)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    >
                      {BATCH_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Target Exam / Cycle
                    </label>
                    <input
                      type="text"
                      value={targetExam}
                      onChange={(e) => setTargetExam(e.target.value)}
                      placeholder="e.g. Prelims + Mains 2026"
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Description / Notes
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional guidance, reading group schedule, or resource notes..."
                    className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Batch is active and selectable during student admissions
                </label>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : editingBatch ? 'Save Batch Changes' : 'Create Batch'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
