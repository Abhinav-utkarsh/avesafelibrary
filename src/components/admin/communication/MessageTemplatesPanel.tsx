import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  FileText,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  MESSAGE_TEMPLATE_CATEGORIES,
  type AdminProfile,
  type MessageTemplateCategory,
  type MessageTemplateRecord,
  type StudentRecord,
} from '../../../types/domain';
import {
  createMessageTemplate,
  deleteMessageTemplate,
  personalizeMessageForStudent,
  seedStarterMessageTemplates,
  updateMessageTemplate,
  type MessageTemplateInput,
} from '../../../services/communicationService';
import { WhatsAppButton } from '../../common/WhatsAppButton';

interface MessageTemplatesPanelProps {
  templates: MessageTemplateRecord[];
  students: StudentRecord[];
  adminProfile: AdminProfile | null;
  onUseInBulk: (template: MessageTemplateRecord) => void;
  onFeedback: (type: 'success' | 'error', message: string) => void;
}

const DEFAULT_FORM: MessageTemplateInput = {
  name: '',
  category: 'fee',
  title: '',
  body: '',
};

export function MessageTemplatesPanel({
  templates,
  students,
  adminProfile,
  onUseInBulk,
  onFeedback,
}: MessageTemplatesPanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | MessageTemplateCategory>('all');
  const [previewStudentId, setPreviewStudentId] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplateRecord | null>(null);
  const [form, setForm] = useState<MessageTemplateInput>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const previewStudent = useMemo(() => {
    if (previewStudentId) {
      return students.find((s) => s.id === previewStudentId) || students[0] || null;
    }
    return students[0] || null;
  }, [students, previewStudentId]);

  const filtered = useMemo(() => {
    return templates.filter((t) => categoryFilter === 'all' || t.category === categoryFilter);
  }, [templates, categoryFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEdit = (tpl: MessageTemplateRecord) => {
    setEditing(tpl);
    setForm({
      name: tpl.name,
      category: tpl.category,
      title: tpl.title,
      body: tpl.body,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setSaving(true);
    try {
      if (editing) {
        await updateMessageTemplate(editing.id, form, adminProfile);
        onFeedback('success', `Updated template "${form.name}".`);
      } else {
        await createMessageTemplate(form, adminProfile);
        onFeedback('success', `Saved new message template "${form.name}".`);
      }
      setModalOpen(false);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleSeedStarters = async () => {
    if (!adminProfile) return;
    setSeeding(true);
    try {
      const count = await seedStarterMessageTemplates(adminProfile);
      onFeedback('success', `Loaded ${count} ready-to-use Av_eSAFE Library message templates.`);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to load starter templates.');
    } finally {
      setSeeding(false);
    }
  };

  const handleDelete = async (tpl: MessageTemplateRecord) => {
    if (!adminProfile) return;
    try {
      await deleteMessageTemplate(tpl, adminProfile);
      setConfirmDeleteId(null);
      onFeedback('success', `Deleted template "${tpl.name}".`);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to delete template.');
    }
  };

  const copyBody = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    } catch {
      onFeedback('error', 'Clipboard access was blocked.');
    }
  };

  return (
    <div className="p-5 space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-[#0B1F3A] text-white dark:bg-sky-500 dark:text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            All ({templates.length})
          </button>
          {MESSAGE_TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                categoryFilter === cat.id
                  ? 'bg-[#0B1F3A] text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select student for live WhatsApp preview"
            value={previewStudent?.id || ''}
            onChange={(e) => setPreviewStudentId(e.target.value)}
            className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 max-w-[220px]"
          >
            {students.length === 0 ? (
              <option value="">No students enrolled</option>
            ) : (
              students.map((s) => (
                <option key={s.id} value={s.id}>
                  Send to: {s.fullName} ({s.registrationNo})
                </option>
              ))
            )}
          </select>

          {templates.length === 0 && (
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedStarters}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {seeding ? 'Loading...' : 'Load 6 Starter Templates'}
            </button>
          )}

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </button>
        </div>
      </div>

      {/* Templates Grid */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center space-y-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <FileText className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No saved message templates yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Create reusable WhatsApp &amp; portal templates with variables like{' '}
            <code className="font-mono">{'{name}'}</code>,{' '}
            <code className="font-mono">{'{pending}'}</code>, and{' '}
            <code className="font-mono">{'{expiry}'}</code>, or install our 6 starter templates.
          </p>
          <div className="flex items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedStarters}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {seeding ? 'Installing...' : 'Load 6 Starter Templates'}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Custom Template
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((tpl) => {
            const catLabel =
              MESSAGE_TEMPLATE_CATEGORIES.find((c) => c.id === tpl.category)?.label || tpl.category;
            const rendered = previewStudent
              ? personalizeMessageForStudent(tpl.body, previewStudent)
              : tpl.body;

            return (
              <div
                key={tpl.id}
                className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {catLabel}
                      </p>
                      <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {tpl.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Alert Title: {tpl.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(tpl)}
                        aria-label={`Edit ${tpl.name}`}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === tpl.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(tpl)}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(tpl.id)}
                          aria-label={`Delete ${tpl.name}`}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {rendered}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUseInBulk(tpl)}
                      className="inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-lg bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#143058] text-white text-xs font-semibold cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      Use in Bulk
                    </button>
                    <button
                      type="button"
                      onClick={() => copyBody(tpl.id, rendered)}
                      className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {copiedId === tpl.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedId === tpl.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  {previewStudent && (
                    <WhatsAppButton
                      phone={previewStudent.phone}
                      message={rendered}
                      size="xs"
                      variant="solid"
                      label={`WhatsApp ${previewStudent.fullName.split(' ')[0]}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setModalOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                {editing ? 'Edit Message Template' : 'Create Message Template'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Monthly Fee Reminder"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Category *
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as MessageTemplateCategory })
                    }
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    {MESSAGE_TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Notification / Subject Title *
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Av_eSAFE Library Fee Due Alert"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Message Body *
                  </label>
                  <span className="font-mono text-[11px] text-slate-400">
                    {form.body.length}/1000
                  </span>
                </div>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={4}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Hello {name} ({regNo}), ..."
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Variables: <code className="font-mono">{'{name}'}</code>,{' '}
                  <code className="font-mono">{'{regNo}'}</code>,{' '}
                  <code className="font-mono">{'{seat}'}</code>,{' '}
                  <code className="font-mono">{'{hall}'}</code>,{' '}
                  <code className="font-mono">{'{pending}'}</code>,{' '}
                  <code className="font-mono">{'{expiry}'}</code>
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[40px] px-5 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
