import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { StudentAvatar } from '../common/StudentAvatar';
import { buildCardVerificationUrl, getShiftDisplayLabel } from '../../services/idCardService';
import type { PrintableIdCardItem } from '../../lib/idCardPdf';
import type { StudentRecord } from '../../types/domain';

const LIBRARY_META = {
  name: 'AV_ESAFE LIBRARY',
  tagline: '24/7 SILENT STUDY SANCTUARY',
  addressLine1: 'Electronic City, Bangalore',
  addressLine2: 'Karnataka – 560100, India',
  hours: 'Open 24 Hours · 7 Days a Week',
  helpline: '+91 98765 43210',
  emergency: '+91 98765 43211 (Desk / Emergency)',
  email: 'desk@avesafelibrary.in',
};

function getMembershipLabel(seatMode: StudentRecord['seatMode']): string {
  if (seatMode === 'fixed') return 'Fixed Dedicated Seat';
  if (seatMode === 'non_fixed') return 'Non-Fixed Flexible';
  return 'Unseated / Pending';
}

function useQrCodeDataUrl(cardNumber: string): string | null {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const verificationUrl = buildCardVerificationUrl(cardNumber);
    QRCode.toDataURL(verificationUrl, {
      width: 240,
      margin: 1,
      color: {
        dark: '#0B1F3A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl) => {
        if (active) setQrUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });

    return () => {
      active = false;
    };
  }, [cardNumber]);

  return qrUrl;
}

interface SingleCardProps {
  student: StudentRecord;
  cardNumber: string;
  forPrint?: boolean;
  isDraftPreview?: boolean;
}

export function StudentIdCardFront({
  student,
  cardNumber,
  forPrint = false,
  isDraftPreview = false,
}: SingleCardProps) {
  const qrDataUrl = useQrCodeDataUrl(cardNumber);
  const shiftLabel = getShiftDisplayLabel(student.shiftType);

  return (
    <div
      className={`${
        forPrint
          ? 'cr80-print-card border border-slate-300 rounded-[2.4mm]'
          : 'w-full aspect-[85.6/54] rounded-xl border border-slate-300 dark:border-slate-700 shadow-md'
      } bg-white text-slate-900 overflow-hidden flex flex-col justify-between select-none relative`}
      style={forPrint ? undefined : { maxWidth: '428px' }}
    >
      {/* Top Navy Header Band */}
      <div>
        <div className="bg-[#0B1F3A] text-white px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-white text-[#0B1F3A] font-display font-extrabold text-sm flex items-center justify-center shrink-0">
              A
            </div>
            <div className="min-w-0 leading-tight">
              <p className="font-display font-bold text-[11px] tracking-wide truncate">
                {LIBRARY_META.name}
              </p>
              <p className="text-[7px] font-semibold tracking-[0.12em] text-[#DFB55B] truncate">
                {LIBRARY_META.tagline}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0 leading-tight">
            <p className="text-[6.5px] font-semibold tracking-wider text-slate-200 uppercase">
              {isDraftPreview ? 'CARD PREVIEW' : 'STUDENT ID CARD'}
            </p>
            <p className="font-mono text-[8px] font-bold text-white mt-0.5">{cardNumber}</p>
          </div>
        </div>
        <div className="h-[3px] bg-[#C89B3C] w-full" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-3 py-2 flex items-center gap-2.5 min-h-0">
        {/* Left: Portrait Photo */}
        <div className="w-[24%] shrink-0 flex flex-col items-center">
          <div className="w-full aspect-[19.5/22.5] rounded-lg overflow-hidden border-[1.5px] border-[#143258] bg-slate-100">
            <StudentAvatar
              name={student.fullName}
              gender={student.gender}
              photoUrl={student.profilePhotoUrl}
              shape="rounded"
              className="!w-full !h-full !rounded-none !border-0"
            />
          </div>
        </div>

        {/* Center: Student Details */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
          <div>
            <p className="font-display font-bold text-[11.5px] leading-tight text-[#0B1F3A] uppercase line-clamp-2">
              {student.fullName}
            </p>
            <div className="mt-1.5">
              <p className="text-[6.5px] font-bold uppercase tracking-wider text-slate-500">
                Student ID
              </p>
              <p className="font-mono text-[9.5px] font-bold text-slate-900 leading-tight">
                {student.registrationNo}
              </p>
            </div>
            <div className="mt-1">
              <p className="text-[6.5px] font-bold uppercase tracking-wider text-slate-500">
                Membership &amp; Shift
              </p>
              <p className="text-[8.5px] font-semibold text-slate-800 leading-tight line-clamp-2">
                {getMembershipLabel(student.seatMode)} · {shiftLabel}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <div className="min-w-0">
              <p className="text-[6.5px] font-bold uppercase tracking-wider text-slate-500">
                Seat / Hall
              </p>
              <p className="text-[8.5px] font-bold text-[#0B1F3A] truncate">
                {student.seatId ? `${student.seatId} (${student.hall})` : student.hall}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[6.5px] font-bold uppercase tracking-wider text-slate-500">
                Valid Until
              </p>
              <p className="font-mono text-[8.5px] font-bold text-[#0B1F3A] truncate">
                {student.membershipExpiry || 'Active'}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Scannable Verification QR */}
        <div className="w-[22.5%] shrink-0 flex flex-col items-center justify-center">
          <div className="w-full aspect-square p-1 rounded-md border border-slate-300 bg-white flex items-center justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Verification QR for ${cardNumber}`}
                className="w-full h-full object-contain block"
              />
            ) : (
              <div className="w-full h-full bg-slate-100 rounded-xs" />
            )}
          </div>
          <p className="text-[6px] font-bold uppercase tracking-wider text-slate-500 mt-1 text-center">
            Scan To Verify
          </p>
        </div>
      </div>

      {/* Bottom Contact Strip */}
      <div className="bg-[#F4F7FB] border-t border-slate-200 px-2.5 py-1 text-center">
        <p className="text-[7px] font-medium text-[#0B1F3A] truncate">
          {LIBRARY_META.addressLine1} · {LIBRARY_META.helpline} · 24/7 Open
        </p>
      </div>
    </div>
  );
}

export function StudentIdCardBack({
  cardNumber,
  forPrint = false,
}: {
  cardNumber: string;
  forPrint?: boolean;
}) {
  return (
    <div
      className={`${
        forPrint
          ? 'cr80-print-card border border-slate-300 rounded-[2.4mm]'
          : 'w-full aspect-[85.6/54] rounded-xl border border-slate-300 dark:border-slate-700 shadow-md'
      } bg-white text-slate-900 overflow-hidden flex flex-col justify-between select-none`}
      style={forPrint ? undefined : { maxWidth: '428px' }}
    >
      {/* Top Navy Strip */}
      <div>
        <div className="bg-[#0B1F3A] text-white px-3 py-1.5 flex items-center justify-between">
          <p className="font-display font-bold text-[8.5px] tracking-wide uppercase">
            Av_eSAFE Library · Member Guidelines &amp; Verification
          </p>
        </div>
        <div className="h-[2.5px] bg-[#C89B3C] w-full" />
      </div>

      {/* Two-column body */}
      <div className="flex-1 px-3 py-2 grid grid-cols-2 gap-3 min-h-0">
        {/* Left: Rules & Lost Card Box */}
        <div className="flex flex-col justify-between min-h-0">
          <div>
            <p className="text-[7.5px] font-bold uppercase tracking-wide text-[#0B1F3A] mb-1">
              Library Rules &amp; Card Usage
            </p>
            <ol className="text-[6.8px] leading-[1.35] text-slate-800 space-y-0.5 list-decimal list-inside">
              <li>Carry this card at all times for entry &amp; desk checks.</li>
              <li>Non-transferable; strictly for the named member.</li>
              <li>Maintain complete silence inside Hall 1 &amp; Hall 2.</li>
              <li>Occupy only your assigned seat &amp; shift window.</li>
              <li>Renew membership before expiry to prevent lockout.</li>
            </ol>
          </div>

          <div className="mt-1.5 p-1.5 rounded-md bg-slate-50 border border-slate-200">
            <p className="text-[6.5px] font-bold uppercase tracking-wide text-[#0B1F3A]">
              If Found / Lost Card
            </p>
            <p className="text-[6.2px] leading-[1.3] text-slate-600 mt-0.5">
              Report lost cards immediately at reception for revocation &amp; reissue. Please return
              found cards to Av_eSAFE Library desk.
            </p>
          </div>
        </div>

        {/* Right: Address, 24/7 Hours, Emergency, Authorized Signature */}
        <div className="flex flex-col justify-between min-h-0">
          <div className="space-y-1.5">
            <div>
              <p className="text-[7.5px] font-bold uppercase tracking-wide text-[#0B1F3A]">
                Library Address &amp; Hours
              </p>
              <p className="text-[6.8px] text-slate-800 leading-tight mt-0.5">
                {LIBRARY_META.addressLine1}
                <br />
                {LIBRARY_META.addressLine2}
              </p>
              <p className="text-[6.8px] font-bold text-[#143258] mt-0.5">
                Hours: {LIBRARY_META.hours}
              </p>
            </div>

            <div>
              <p className="text-[7px] font-bold uppercase tracking-wide text-[#0B1F3A]">
                Emergency Contact
              </p>
              <p className="text-[6.8px] text-slate-800 leading-tight mt-0.5">
                {LIBRARY_META.emergency}
                <br />
                {LIBRARY_META.email}
              </p>
            </div>
          </div>

          {/* Authorized Signature */}
          <div className="pt-2 text-center">
            <div className="border-b border-slate-400 mx-1 mb-1 h-4" />
            <p className="text-[6.8px] font-bold uppercase tracking-wider text-[#0B1F3A]">
              Authorized Signatory
            </p>
            <p className="text-[6px] text-slate-500">Av_eSAFE Library Administration</p>
          </div>
        </div>
      </div>

      {/* Bottom Ref */}
      <div className="px-3 pb-1 text-center">
        <p className="font-mono text-[6.2px] text-slate-500">
          Card Ref: {cardNumber} · Property of Av_eSAFE Library
        </p>
      </div>
    </div>
  );
}

interface PreviewProps {
  student: StudentRecord;
  cardNumber?: string;
}

export function StudentIdCardPreview({ student, cardNumber }: PreviewProps) {
  const effectiveCardNumber = cardNumber || `PREVIEW-${student.registrationNo}`;
  const isDraft = !cardNumber;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span>Front Side · CR80 (85.6 mm × 54 mm)</span>
          {isDraft && <span className="text-amber-600 dark:text-amber-400">Draft Preview</span>}
        </div>
        <StudentIdCardFront
          student={student}
          cardNumber={effectiveCardNumber}
          isDraftPreview={isDraft}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span>Back Side · Guidelines &amp; Signature</span>
          <span className="font-mono text-[10px]">24/7 Access Card</span>
        </div>
        <StudentIdCardBack cardNumber={effectiveCardNumber} />
      </div>
    </div>
  );
}

/**
 * Hidden on screen, rendered cleanly at exact CR80 physical dimensions (85.6mm x 54mm)
 * during browser printing (window.print()) with 8 cards per A4 page and duplex-aligned back sheets.
 */
export function PrintableIdCardSheet({ items }: { items: PrintableIdCardItem[] }) {
  if (items.length === 0) return null;

  const perSheet = 8;
  const sheets: PrintableIdCardItem[][] = [];
  for (let i = 0; i < items.length; i += perSheet) {
    sheets.push(items.slice(i, i + perSheet));
  }

  return (
    <div id="nirvana-printable-id-cards" className="hidden print:block bg-white text-slate-900">
      {sheets.map((slice, sheetIdx) => {
        // Pair rows of 2 and mirror columns on the back page for duplex alignment
        const mirroredBackSlice: Array<PrintableIdCardItem | null> = [];
        for (let r = 0; r < slice.length; r += 2) {
          const left = slice[r] || null;
          const right = slice[r + 1] || null;
          mirroredBackSlice.push(right, left);
        }

        return (
          <React.Fragment key={sheetIdx}>
            {/* FRONT SHEET */}
            <div className="cr80-print-sheet">
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Av_eSAFE Library · Student ID Cards — Front Sheet {sheetIdx + 1} of {sheets.length}
                </p>
                <p className="text-[9px] text-slate-500 font-mono">
                  CR80 (85.6 mm × 54 mm) · Print at 100% scale
                </p>
              </div>
              <div
                className="grid grid-cols-2 justify-items-center"
                style={{ columnGap: '10mm', rowGap: '8mm' }}
              >
                {slice.map((item) => (
                  <StudentIdCardFront
                    key={`front-${item.cardNumber}`}
                    student={item.student}
                    cardNumber={item.cardNumber}
                    forPrint
                  />
                ))}
              </div>
            </div>

            {/* BACK SHEET (Duplex aligned) */}
            <div className="cr80-print-sheet">
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Av_eSAFE Library · Student ID Cards — Back Sheet {sheetIdx + 1} of {sheets.length}{' '}
                  (Duplex Aligned)
                </p>
                <p className="text-[9px] text-slate-500 font-mono">
                  Flip on long edge · Columns mirrored for front/back alignment
                </p>
              </div>
              <div
                className="grid grid-cols-2 justify-items-center"
                style={{ columnGap: '10mm', rowGap: '8mm' }}
              >
                {mirroredBackSlice.map((item, idx) =>
                  item ? (
                    <StudentIdCardBack
                      key={`back-${item.cardNumber}`}
                      cardNumber={item.cardNumber}
                      forPrint
                    />
                  ) : (
                    <div key={`spacer-${idx}`} className="cr80-print-card" />
                  ),
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
