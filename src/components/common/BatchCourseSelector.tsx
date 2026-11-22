import React, { useMemo } from 'react';
import { BookOpen, PenLine } from 'lucide-react';
import { mergeBatchCourseOptions } from '../../services/batchService';

export const OTHER_BATCH_VALUE = '__other__';

export interface BatchOptionInput {
  id: string;
  name: string;
  code: string;
  category: string;
  targetExam?: string;
  active: boolean;
}

interface BatchCourseSelectorProps {
  batches: BatchOptionInput[];
  batchId: string;
  batchName: string;
  onChange: (next: { batchId: string; batchName: string }) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}

export function BatchCourseSelector({
  batches,
  batchId,
  batchName,
  onChange,
  label = 'Exam Batch / Course',
  required = false,
  disabled = false,
  helperText,
}: BatchCourseSelectorProps) {
  const options = useMemo(() => mergeBatchCourseOptions(batches), [batches]);

  const matchedOption = useMemo(() => {
    if (batchId === 'other' || batchId === OTHER_BATCH_VALUE) return null;
    if (batchId) {
      const byId = options.find((o) => o.id === batchId);
      if (byId) return byId;
    }
    if (batchName) {
      const lower = batchName.trim().toLowerCase();
      const byName = options.find((o) => o.name.toLowerCase() === lower);
      if (byName) return byName;
    }
    return null;
  }, [options, batchId, batchName]);

  const isOtherSelected =
    batchId === 'other' ||
    batchId === OTHER_BATCH_VALUE ||
    (Boolean(batchName.trim()) && !matchedOption);

  const selectValue = isOtherSelected
    ? OTHER_BATCH_VALUE
    : matchedOption
      ? matchedOption.id
      : '';

  const handleSelectChange = (val: string) => {
    if (val === '') {
      onChange({ batchId: '', batchName: '' });
      return;
    }
    if (val === OTHER_BATCH_VALUE) {
      onChange({
        batchId: 'other',
        batchName: matchedOption ? '' : batchName,
      });
      return;
    }
    const found = options.find((o) => o.id === val);
    if (found) {
      onChange({ batchId: found.id, batchName: found.name });
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-slate-400" />
          {label}
          {required && <span className="text-red-500">*</span>}
        </span>
      </label>

      <select
        value={selectValue}
        disabled={disabled}
        required={required && !isOtherSelected}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs transition focus:border-[#0E2A47] focus:outline-none focus:ring-2 focus:ring-[#0E2A47]/15 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">Select Exam Batch / Course…</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name} ({opt.code})
          </option>
        ))}
        <option value={OTHER_BATCH_VALUE}>Other (Enter Course / Exam Manually)</option>
      </select>

      {isOtherSelected && (
        <div className="rounded-lg border border-[#C99A2E]/40 bg-[#C99A2E]/5 p-3 dark:border-[#C99A2E]/30 dark:bg-[#C99A2E]/10">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#0E2A47] dark:text-[#DFB55B]">
            <PenLine className="h-3.5 w-3.5" />
            Enter Course / Exam Name Manually
            {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={batchName}
            disabled={disabled}
            required={required}
            maxLength={100}
            placeholder="e.g., CFA Level 1, IELTS, KSET, Judiciary Mains, Custom Course…"
            onChange={(e) =>
              onChange({
                batchId: 'other',
                batchName: e.target.value,
              })
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0E2A47] focus:outline-none focus:ring-2 focus:ring-[#0E2A47]/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      )}

      {helperText && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
      )}
    </div>
  );
}
