import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PAYMENT_METHODS,
  SHIFT_DEFINITIONS,
  type PaymentRecord,
  type StudentRecord,
} from '../types/domain';

export const LIBRARY_BRAND = {
  name: 'AV_ESAFE LIBRARY',
  subtitle: '24/7 Self-Study Center · Hall 1 (80 Seats) & Hall 2 (40 Seats)',
  address: 'Electronic City, Bangalore, Karnataka – 560100, India',
  contact: 'Front Desk: +91 98012 45678  |  accounts@avesafelibrary.in  |  avesafelibrary.in',
  shortContact: 'Electronic City, Bangalore · +91 98012 45678 · accounts@avesafelibrary.in',
};

const NAVY: [number, number, number] = [11, 31, 58];
const NAVY_MUTED: [number, number, number] = [30, 58, 95];
const GOLD: [number, number, number] = [200, 155, 60];
const SLATE_TEXT: [number, number, number] = [30, 41, 59];
const SLATE_MUTED: [number, number, number] = [100, 116, 139];
const BORDER_LIGHT: [number, number, number] = [226, 232, 240];
const SURFACE_TINT: [number, number, number] = [248, 250, 252];
const EMERALD: [number, number, number] = [5, 122, 85];
const AMBER: [number, number, number] = [180, 83, 9];
const ROSE: [number, number, number] = [190, 18, 60];

/**
 * Formats INR currency cleanly for jsPDF standard fonts (Helvetica does not include the Unicode ₹ glyph).
 */
export function formatInrPdf(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = safe < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(Math.round(safe)).toLocaleString('en-IN')}`;
}

export function formatInrUi(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = safe < 0 ? '-' : '';
  return `${sign}₹${Math.abs(Math.round(safe)).toLocaleString('en-IN')}`;
}

function drawLibraryLetterhead(
  doc: jsPDF,
  docLabel: string,
  metaLines: { label: string; value: string }[],
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // Top Navy Header Band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Gold bottom accent rule
  doc.setFillColor(...GOLD);
  doc.rect(0, 34, pageWidth, 1.4, 'F');

  // Emblem Box (vector N + Gold keystone)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX, 7.5, 13, 13, 2.2, 2.2, 'F');
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.0);
  doc.line(marginX + 3.2, 17.5, marginX + 3.2, 10.5);
  doc.line(marginX + 3.2, 10.5, marginX + 6.5, 15.2);
  doc.line(marginX + 6.5, 15.2, marginX + 9.8, 10.5);
  doc.line(marginX + 9.8, 10.5, marginX + 9.8, 17.5);
  doc.setFillColor(...GOLD);
  doc.circle(marginX + 6.5, 9.6, 0.9, 'F');

  // Brand Title & Address
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(LIBRARY_BRAND.name, marginX + 16.5, 13.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(203, 213, 225);
  doc.text(LIBRARY_BRAND.subtitle, marginX + 16.5, 18.5);
  doc.text(LIBRARY_BRAND.address, marginX, 25.8);
  doc.text(LIBRARY_BRAND.contact, marginX, 30.2);

  // Right Document Title Badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text(docLabel.toUpperCase(), pageWidth - marginX, 13.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(241, 245, 249);
  metaLines.forEach((m, idx) => {
    doc.text(`${m.label}: ${m.value}`, pageWidth - marginX, 19.2 + idx * 4.6, {
      align: 'right',
    });
  });

  return 42;
}

function applyPageFooters(doc: jsPDF, docFooterTitle: string) {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedStr = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_MUTED);
    doc.text(`${LIBRARY_BRAND.name} · ${docFooterTitle}`, 14, pageHeight - 9.5);
    doc.text(`Generated: ${generatedStr}`, pageWidth / 2, pageHeight - 9.5, {
      align: 'center',
    });
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 9.5, {
      align: 'right',
    });
  }
}

export function getPaymentShiftDetails(student?: StudentRecord | null) {
  if (!student) {
    return {
      registrationNo: '—',
      planLabel: 'Standard Library Membership',
      shiftLabel: 'Assigned Study Shift',
      seatInfo: 'Electronic City Study Hall',
      monthlyFee: 0,
      phone: '—',
      email: '—',
    };
  }
  const shiftDef = SHIFT_DEFINITIONS.find((s) => s.id === student.shiftType);
  const modeLabel =
    student.seatMode === 'fixed'
      ? 'Fixed Dedicated Seat'
      : student.seatMode === 'non_fixed'
        ? 'Non-Fixed Shared Seat'
        : 'Unseated Membership';

  return {
    registrationNo: student.registrationNo || '—',
    planLabel: `${modeLabel} (${student.hall})`,
    shiftLabel: shiftDef ? `${shiftDef.label} (${shiftDef.window})` : student.shiftType,
    seatInfo: student.seatId ? `${student.hall} · Seat ${student.seatId}` : `${student.hall} · Unseated`,
    monthlyFee: Number(student.monthlyFee || 0),
    phone: student.phone || '—',
    email: student.email || '—',
  };
}

/**
 * Generates and downloads an authentic A4 Fee Receipt PDF.
 */
export function downloadFeeReceiptPdf(payment: PaymentRecord, student?: StudentRecord | null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  const paidDate =
    payment.paidAt && typeof payment.paidAt.toDate === 'function'
      ? payment.paidAt.toDate().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

  const methodLabel =
    PAYMENT_METHODS.find((m) => m.id === payment.paymentMethod)?.label || payment.paymentMethod;
  const details = getPaymentShiftDetails(student);
  const grossFee =
    details.monthlyFee > 0
      ? details.monthlyFee
      : Number(payment.amountPaid || 0) + Number(payment.discount || 0) + Number(payment.dueAmount || 0);
  const isPaidFull = Number(payment.dueAmount || 0) <= 0;
  const statusLabel = isPaidFull ? 'PAID IN FULL' : 'PARTIAL PAYMENT';

  let y = drawLibraryLetterhead(doc, 'Official Fee Receipt', [
    { label: 'Receipt No', value: payment.receiptNo },
    { label: 'Payment Date', value: paidDate },
    { label: 'Billing Period', value: payment.billingMonth },
  ]);

  // Status Banner Strip
  doc.setFillColor(...SURFACE_TINT);
  doc.setDrawColor(...BORDER_LIGHT);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 13, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('PAYMENT STATUS:', marginX + 4, y + 8);

  doc.setTextColor(...(isPaidFull ? EMERALD : AMBER));
  doc.setFontSize(9.5);
  doc.text(statusLabel, marginX + 38, y + 8);

  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text(`Transaction Ref: ${payment.idempotencyKey || payment.receiptNo}`, pageWidth - marginX - 4, y + 8, {
    align: 'right',
  });

  y += 19;

  // Two-column Student & Membership Metadata Grid
  const colWidth = (pageWidth - marginX * 2 - 6) / 2;

  doc.setDrawColor(...BORDER_LIGHT);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX, y, colWidth, 38, 2, 2, 'D');
  doc.roundedRect(marginX + colWidth + 6, y, colWidth, 38, 2, 2, 'D');

  // Left Box: Student Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_MUTED);
  doc.text('STUDENT INFORMATION', marginX + 4, y + 6.5);

  doc.setFontSize(10.5);
  doc.setTextColor(...SLATE_TEXT);
  doc.text(payment.studentName, marginX + 4, y + 13.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(`Student ID: ${details.registrationNo}`, marginX + 4, y + 19.5);
  doc.text(`Phone: ${details.phone}`, marginX + 4, y + 25);
  doc.text(`Email: ${details.email}`, marginX + 4, y + 30.5);

  // Right Box: Membership & Payment Mode
  const rightX = marginX + colWidth + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_MUTED);
  doc.text('MEMBERSHIP & PAYMENT', rightX, y + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_TEXT);
  doc.text(`Plan: ${details.planLabel}`, rightX, y + 13.5);
  doc.text(`Shift: ${details.shiftLabel}`, rightX, y + 19.5);
  doc.text(`Seat: ${details.seatInfo}`, rightX, y + 25);
  doc.text(`Payment Method: ${methodLabel}`, rightX, y + 30.5);

  y += 45;

  // Fee Breakdown Table
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Description', 'Billing Cycle', 'Amount (INR)']],
    body: [
      [
        `Monthly Library Membership Fee (${details.shiftLabel})`,
        payment.billingMonth,
        formatInrPdf(grossFee),
      ],
      ...(payment.discount > 0
        ? [['Concession / Discount Applied', payment.billingMonth, `- ${formatInrPdf(payment.discount)}`]]
        : []),
      ['Amount Received Today', paidDate, formatInrPdf(payment.amountPaid)],
      ['Pending Balance After Payment', 'Current Ledger', formatInrPdf(payment.dueAmount)],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 3.5,
    },
    bodyStyles: {
      textColor: SLATE_TEXT,
      fontSize: 8.8,
      cellPadding: 3.5,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 38, halign: 'center' },
      2: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: SURFACE_TINT,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY || y + 48) + 8;

  // Summary Highlight Box
  doc.setFillColor(...NAVY);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 16, 2, 2, 'F');
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('TOTAL AMOUNT RECEIVED', marginX + 5, y + 6.5);
  doc.text(`Collected By: ${payment.collectedBy || 'Av_eSAFE Library Desk'}`, marginX + 5, y + 12);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(formatInrPdf(payment.amountPaid), pageWidth - marginX - 5, y + 10.5, {
    align: 'right',
  });

  y += 23;

  if (payment.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...NAVY_MUTED);
    doc.text('REMARKS / REFERENCE:', marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE_TEXT);
    doc.text(payment.notes, marginX + 38, y);
    y += 10;
  }

  // Notes & Authorized Signature Section
  y = Math.max(y + 12, 218);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(
    'Note: This is an official computer-verified fee receipt issued by Av_eSAFE Library, Electronic City, Bangalore.',
    marginX,
    y,
  );
  doc.text(
    'Fees paid are non-transferable. Please retain this receipt for seat and Smart Door verification.',
    marginX,
    y + 4.5,
  );

  // Signature Lines
  const sigY = y + 26;
  doc.setDrawColor(...SLATE_MUTED);
  doc.setLineWidth(0.35);
  doc.line(marginX, sigY, marginX + 58, sigY);
  doc.line(pageWidth - marginX - 62, sigY, pageWidth - marginX, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_TEXT);
  doc.text('Student / Guardian Signature', marginX, sigY + 5);
  doc.text('Authorized Signatory', pageWidth - marginX, sigY + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('Av_eSAFE Library · Electronic City, Bangalore', pageWidth - marginX, sigY + 9.5, {
    align: 'right',
  });

  applyPageFooters(doc, `Official Fee Receipt · ${payment.receiptNo}`);
  doc.save(`Av_eSAFE-Receipt-${payment.receiptNo}.pdf`);
}

export interface FeeInvoicePayload {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  billingPeriod: string;
  student: StudentRecord;
  items: { description: string; period: string; amount: number }[];
  subtotal: number;
  discount: number;
  totalPayable: number;
  amountPaid: number;
  outstandingBalance: number;
}

/**
 * Generates and downloads a professional A4 Fee Invoice / Bill PDF.
 */
export function downloadFeeInvoicePdf(invoice: FeeInvoicePayload) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const details = getPaymentShiftDetails(invoice.student);
  const isSettled = invoice.outstandingBalance <= 0;

  let y = drawLibraryLetterhead(doc, 'Fee Invoice / Bill', [
    { label: 'Invoice No', value: invoice.invoiceNo },
    { label: 'Invoice Date', value: invoice.invoiceDate },
    { label: 'Due Date', value: invoice.dueDate },
  ]);

  // Bill To & Membership Info
  const colW = (pageWidth - marginX * 2 - 6) / 2;
  doc.setDrawColor(...BORDER_LIGHT);
  doc.roundedRect(marginX, y, colW, 38, 2, 2, 'D');
  doc.roundedRect(marginX + colW + 6, y, colW, 38, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_MUTED);
  doc.text('BILL TO (STUDENT)', marginX + 4, y + 6.5);

  doc.setFontSize(10.5);
  doc.setTextColor(...SLATE_TEXT);
  doc.text(invoice.student.fullName, marginX + 4, y + 13.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(`Student ID: ${details.registrationNo}`, marginX + 4, y + 19.5);
  doc.text(`Phone: ${details.phone}`, marginX + 4, y + 25);
  doc.text(`Email: ${details.email}`, marginX + 4, y + 30.5);

  const rx = marginX + colW + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_MUTED);
  doc.text('MEMBERSHIP & BILLING DETAILS', rx, y + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...SLATE_TEXT);
  doc.text(`Plan: ${details.planLabel}`, rx, y + 13.5);
  doc.text(`Shift: ${details.shiftLabel}`, rx, y + 19.5);
  doc.text(`Seat: ${details.seatInfo}`, rx, y + 25);
  doc.text(`Billing Period: ${invoice.billingPeriod}`, rx, y + 30.5);

  y += 45;

  // Itemized Fee Breakdown Table
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['#', 'Itemized Fee Description', 'Billing Period', 'Amount (INR)']],
    body: invoice.items.map((item, idx) => [
      String(idx + 1),
      item.description,
      item.period,
      formatInrPdf(item.amount),
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 3.5,
    },
    bodyStyles: {
      textColor: SLATE_TEXT,
      fontSize: 8.8,
      cellPadding: 3.5,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 36, halign: 'center' },
      3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: SURFACE_TINT,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY || y + 40) + 6;

  // Right-aligned Totals Box
  const totalsX = pageWidth - marginX - 84;
  const totalsW = 84;
  const rows: { label: string; value: string; bold?: boolean; color?: [number, number, number] }[] = [
    { label: 'Subtotal', value: formatInrPdf(invoice.subtotal) },
    ...(invoice.discount > 0
      ? [{ label: 'Discount / Concession', value: `- ${formatInrPdf(invoice.discount)}`, color: EMERALD }]
      : []),
    { label: 'Total Payable', value: formatInrPdf(invoice.totalPayable), bold: true },
    { label: 'Amount Paid', value: formatInrPdf(invoice.amountPaid), color: EMERALD },
    {
      label: 'Outstanding Balance',
      value: formatInrPdf(invoice.outstandingBalance),
      bold: true,
      color: isSettled ? EMERALD : ROSE,
    },
  ];

  doc.setDrawColor(...BORDER_LIGHT);
  doc.setFillColor(...SURFACE_TINT);
  doc.roundedRect(totalsX, y, totalsW, rows.length * 7.5 + 5, 2, 2, 'FD');

  rows.forEach((r, i) => {
    const ry = y + 6.5 + i * 7.5;
    doc.setFont('helvetica', r.bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_TEXT);
    doc.text(r.label, totalsX + 4, ry);
    doc.setTextColor(...(r.color || SLATE_TEXT));
    doc.text(r.value, totalsX + totalsW - 4, ry, { align: 'right' });
  });

  // Left-side Payment Instructions alongside Totals
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY_MUTED);
  doc.text('PAYMENT INSTRUCTIONS', marginX, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_TEXT);
  doc.text('• Cash / Card: Pay at Av_eSAFE Library Front Desk, Electronic City, Bangalore.', marginX, y + 12);
  doc.text('• UPI / QR: Scan official reception QR & share UTR reference.', marginX, y + 17);
  doc.text('• Bank Transfer: Collect official receipt immediately after transfer.', marginX, y + 22);
  doc.text(
    `• Invoice Status: ${isSettled ? 'SETTLED / NO DUES' : 'PAYMENT DUE'}`,
    marginX,
    y + 27.5,
  );

  y = y + rows.length * 7.5 + 16;

  // Terms & Conditions
  doc.setDrawColor(...BORDER_LIGHT);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_MUTED);
  doc.text('TERMS & CONDITIONS', marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...SLATE_MUTED);
  const terms = [
    '1. Monthly membership fees are due on or before the renewal date to maintain uninterrupted seat allocation and Smart Door access.',
    '2. Fixed seats are reserved exclusively for the enrolled student across shifts; Non-Fixed seats are allocated strictly for the enrolled shift.',
    '3. Fees once paid are non-refundable and non-transferable to another individual.',
    '4. All financial entries are maintained in Av_eSAFE Library’s verified digital ledger; please verify receipt number after every payment.',
  ];
  terms.forEach((t, idx) => {
    doc.text(t, marginX, y + 5 + idx * 4.5, { maxWidth: pageWidth - marginX * 2 });
  });

  // Signature block
  const sigY = Math.max(y + 36, 250);
  doc.setDrawColor(...SLATE_MUTED);
  doc.line(pageWidth - marginX - 60, sigY, pageWidth - marginX, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...SLATE_TEXT);
  doc.text('Authorized Signatory · Av_eSAFE Library', pageWidth - marginX, sigY + 5, {
    align: 'right',
  });

  applyPageFooters(doc, `Fee Invoice · ${invoice.invoiceNo}`);
  doc.save(`Av_eSAFE-Invoice-${invoice.invoiceNo}.pdf`);
}

export type ReportTypeId =
  | 'admissions'
  | 'fee_collection'
  | 'pending_payments'
  | 'attendance'
  | 'seat_utilization'
  | 'expenses'
  | 'monthly_financial';

export interface LibraryReportPdfPayload {
  reportType: ReportTypeId;
  title: string;
  subtitle: string;
  dateRangeLabel: string;
  kpis: { label: string; value: string }[];
  columns: string[];
  rows: (string | number)[][];
  rightAlignedCols?: number[];
  orientation?: 'portrait' | 'landscape';
  summaryNote?: string;
}

/**
 * Generates and downloads a multi-page A4 professional report PDF with repeated headers and page numbering.
 */
export function downloadLibraryReportPdf(payload: LibraryReportPdfPayload) {
  const orientation = payload.orientation || (payload.columns.length > 6 ? 'landscape' : 'portrait');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  const generatedDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  let y = drawLibraryLetterhead(doc, payload.title, [
    { label: 'Report Period', value: payload.dateRangeLabel },
    { label: 'Generated On', value: generatedDate },
    { label: 'Total Records', value: String(payload.rows.length) },
  ]);

  // Subtitle line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(payload.subtitle, marginX, y);
  y += 6;

  // Summary KPI Cards Row (up to 4 cards)
  if (payload.kpis.length > 0) {
    const count = Math.min(payload.kpis.length, 4);
    const gap = 4;
    const cardW = (pageWidth - marginX * 2 - gap * (count - 1)) / count;

    payload.kpis.slice(0, 4).forEach((kpi, idx) => {
      const cx = marginX + idx * (cardW + gap);
      doc.setFillColor(...SURFACE_TINT);
      doc.setDrawColor(...BORDER_LIGHT);
      doc.roundedRect(cx, y, cardW, 18, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...SLATE_MUTED);
      doc.text(kpi.label.toUpperCase(), cx + 3.5, y + 6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(...NAVY);
      doc.text(kpi.value, cx + 3.5, y + 13.5);
    });

    y += 24;
  }

  // Main Data Table with automatic repeated headers across pages & row-break protection
  const colStyles: Record<number, { halign?: 'left' | 'right' | 'center' }> = {};
  (payload.rightAlignedCols || []).forEach((colIndex) => {
    colStyles[colIndex] = { halign: 'right' };
  });

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX, bottom: 20 },
    head: [payload.columns],
    body:
      payload.rows.length > 0
        ? payload.rows.map((r) => r.map((cell) => String(cell ?? '')))
        : [['No records found for the selected date range.']],
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    theme: 'grid',
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: {
      textColor: SLATE_TEXT,
      fontSize: 8,
      cellPadding: 2.8,
    },
    alternateRowStyles: {
      fillColor: SURFACE_TINT,
    },
    columnStyles: colStyles,
  });

  if (payload.summaryNote) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterTableY = ((doc as any).lastAutoTable?.finalY || y + 30) + 7;
    if (afterTableY < doc.internal.pageSize.getHeight() - 22) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_MUTED);
      doc.text(payload.summaryNote, marginX, afterTableY, {
        maxWidth: pageWidth - marginX * 2,
      });
    }
  }

  applyPageFooters(doc, payload.title);
  const safeSlug = payload.reportType.replace(/_/g, '-');
  doc.save(`Av_eSAFE-${safeSlug}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
