import React, { useMemo, useState } from 'react';
import { Armchair, CheckCircle2, Info, Lock } from 'lucide-react';
import { getSlotsForShiftType } from '../../services/seatService';
import type {
  BaseShiftSlot,
  HallName,
  PublicSeatAvailability,
  SeatMode,
  ShiftType,
} from '../../types/domain';

interface InteractiveSeatPickerProps {
  seats: PublicSeatAvailability[];
  shiftType: ShiftType;
  doublePresetId?: string;
  seatMode: SeatMode;
  selectedSeatId: string;
  currentSeatId?: string;
  onSelectSeat: (seatCode: string, hall: HallName) => void;
  disabled?: boolean;
}

export function InteractiveSeatPicker({
  seats,
  shiftType,
  doublePresetId = 'morning_noon',
  seatMode,
  selectedSeatId,
  currentSeatId = '',
  onSelectSeat,
  disabled = false,
}: InteractiveSeatPickerProps) {
  const [activeHall, setActiveHall] = useState<'Hall 1' | 'Hall 2'>('Hall 1');

  const requiredSlots: BaseShiftSlot[] = useMemo(
    () => getSlotsForShiftType(shiftType, doublePresetId),
    [shiftType, doublePresetId],
  );

  const checkSeatAvailability = (seat: PublicSeatAvailability): {
    available: boolean;
    reason: string;
    isCurrent: boolean;
  } => {
    const isCurrent = Boolean(currentSeatId) && seat.seatCode === currentSeatId;
    if (seat.status === 'maintenance') {
      return { available: false, reason: 'Under maintenance', isCurrent };
    }
    if (isCurrent) {
      // Student can always stay on their current seat (e.g., when changing shift or mode)
      return { available: true, reason: 'Your current seat', isCurrent: true };
    }
    if (seatMode === 'fixed') {
      if (seat.isFixedOccupied || (seat.occupiedSlots && seat.occupiedSlots.length > 0)) {
        return {
          available: false,
          reason: seat.isFixedOccupied
            ? 'Reserved as a 24/7 Fixed Seat'
            : 'Has shift occupants — unavailable for 24/7 Fixed booking',
          isCurrent: false,
        };
      }
      return { available: true, reason: 'Available for Fixed 24/7 booking', isCurrent: false };
    }

    // Non-fixed shift-based check
    if (seat.isFixedOccupied) {
      return { available: false, reason: 'Reserved as a 24/7 Fixed Seat', isCurrent: false };
    }
    const occupiedSet = new Set(seat.occupiedSlots || []);
    const conflicting = requiredSlots.filter((slot) => occupiedSet.has(slot));
    if (conflicting.length > 0) {
      return {
        available: false,
        reason: `Occupied during ${conflicting.join(', ')} shift`,
        isCurrent: false,
      };
    }
    return {
      available: true,
      reason: `Available for ${requiredSlots.join(' + ')} shift`,
      isCurrent: false,
    };
  };

  const hallCounts = useMemo(() => {
    const h1 = seats.filter((s) => s.hall === 'Hall 1');
    const h2 = seats.filter((s) => s.hall === 'Hall 2');
    const h1Avail = h1.filter((s) => checkSeatAvailability(s).available).length;
    const h2Avail = h2.filter((s) => checkSeatAvailability(s).available).length;
    return {
      h1Total: h1.length,
      h1Avail,
      h2Total: h2.length,
      h2Avail,
    };
  }, [seats, seatMode, requiredSlots, currentSeatId]);

  const rowsForHall = useMemo(() => {
    const filtered = seats
      .filter((s) => s.hall === activeHall)
      .sort((a, b) => a.seatNumber - b.seatNumber);
    const grouped = new Map<string, PublicSeatAvailability[]>();
    for (const seat of filtered) {
      const label = seat.rowLabel || 'Row A';
      if (!grouped.has(label)) grouped.set(label, []);
      grouped.get(label)!.push(seat);
    }
    return Array.from(grouped.entries());
  }, [seats, activeHall]);

  if (seatMode === 'unseated') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0E2A47] dark:text-[#DFB55B]" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              Unseated / Open Reading Desk Mode Selected
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              No specific numbered seat will be locked. Switch to <strong>Fixed Seat</strong> or{' '}
              <strong>Non-Fixed Shift Seat</strong> above if you want to choose a numbered desk from Hall 1 or Hall 2.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hall switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          {(['Hall 1', 'Hall 2'] as const).map((hall) => {
            const avail = hall === 'Hall 1' ? hallCounts.h1Avail : hallCounts.h2Avail;
            const total = hall === 'Hall 1' ? hallCounts.h1Total : hallCounts.h2Total;
            const isActive = activeHall === hall;
            return (
              <button
                key={hall}
                type="button"
                onClick={() => setActiveHall(hall)}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-[#0E2A47] text-white shadow-xs dark:bg-[#C99A2E] dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {hall}{' '}
                <span className={isActive ? 'opacity-90' : 'text-emerald-600 dark:text-emerald-400'}>
                  ({avail}/{total} free)
                </span>
              </button>
            );
          })}
        </div>

        {selectedSeatId ? (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Selected Seat: {selectedSeatId}
          </div>
        ) : (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Click any green seat below to select it
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950" />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-[#0E2A47] bg-[#0E2A47] dark:border-[#DFB55B] dark:bg-[#C99A2E]" />
          Selected
        </span>
        {currentSeatId && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-blue-500 bg-blue-100 dark:border-blue-400 dark:bg-blue-950" />
            Your Current Seat
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800" />
          Occupied for selected shift
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-rose-300 bg-rose-100 dark:border-rose-800 dark:bg-rose-950" />
          Maintenance
        </span>
      </div>

      {/* Seat Rows Grid */}
      {rowsForHall.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Loading seat map for {activeHall}…
        </div>
      ) : (
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          {rowsForHall.map(([rowLabel, rowSeats]) => (
            <div key={rowLabel} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <div className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {rowLabel}
              </div>
              <div className="grid flex-1 grid-cols-5 gap-1.5 sm:grid-cols-10">
                {rowSeats.map((seat) => {
                  const status = checkSeatAvailability(seat);
                  const isSelected = selectedSeatId === seat.seatCode;

                  let btnClass =
                    'border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-500 hover:bg-emerald-100 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50';
                  if (seat.status === 'maintenance') {
                    btnClass =
                      'cursor-not-allowed border-rose-200 bg-rose-50 text-rose-400 opacity-75 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-500';
                  } else if (!status.available) {
                    btnClass =
                      'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600';
                  } else if (isSelected) {
                    btnClass =
                      'border-[#0E2A47] bg-[#0E2A47] text-white ring-2 ring-[#C99A2E] dark:border-[#DFB55B] dark:bg-[#C99A2E] dark:text-slate-950';
                  } else if (status.isCurrent) {
                    btnClass =
                      'border-blue-400 bg-blue-50 text-blue-900 hover:bg-blue-100 dark:border-blue-600 dark:bg-blue-950/50 dark:text-blue-200';
                  }

                  return (
                    <button
                      key={seat.seatCode}
                      type="button"
                      disabled={disabled || !status.available}
                      title={`${seat.seatCode} (${seat.hall}) — ${status.reason}`}
                      onClick={() => onSelectSeat(seat.seatCode, seat.hall)}
                      className={`flex flex-col items-center justify-center rounded-lg border px-1 py-2 text-[11px] font-bold transition ${btnClass}`}
                    >
                      {seat.status === 'maintenance' ? (
                        <Lock className="mb-0.5 h-3 w-3" />
                      ) : (
                        <Armchair className="mb-0.5 h-3 w-3" />
                      )}
                      <span className="leading-none">{seat.seatCode.replace(/^H[12]-/, '')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
