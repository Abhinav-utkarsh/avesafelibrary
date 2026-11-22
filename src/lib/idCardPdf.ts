import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { getSafeAvatarSrc } from '../components/common/StudentAvatar';
import { buildCardVerificationUrl, getShiftDisplayLabel } from '../services/idCardService';
import type { StudentRecord } from '../types/domain';

// Standard CR80 ISO/IEC 7810 ID-1 physical dimensions in millimeters
export const CR80_WIDTH_MM = 85.6;
export const CR80_HEIGHT_MM = 54.0;

const LIBRARY_INFO = {
  name: 'AV_ESAFE LIBRARY',
  tagline: '24/7 SILENT STUDY SANCTUARY',
  addressLine1: 'Electronic City, Bangalore',
  addressLine2: 'Karnataka – 560100, India',
  hours: 'Open 24 Hours · 7 Days a Week',
  helpline: '+91 98765 43210',
  emergency: '+91 98765 43211 (Desk / Emergency)',
  email: 'desk@avesafelibrary.in',
};

const NAVY: [number, number, number] = [11, 31, 58];
const NAVY_MID: [number, number, number] = [20, 50, 88];
const GOLD: [number, number, number] = [200, 155, 60];
const SLATE_DARK: [number, number, number] = [15, 23, 42];
const SLATE_MUTED: [number, number, number] = [71, 85, 105];
const BORDER_LIGHT: [number, number, number] = [203, 213, 225];
const WHITE: [number, number, number] = [255, 255, 255];

export interface PrintableIdCardItem {
  student: StudentRecord;
  cardNumber: string;
}

async function generateQrDataUrl(verificationUrl: string): Promise<string> {
  return QRCode.toDataURL(verificationUrl, {
    width: 240,
    margin: 1,
    color: {
      dark: '#0B1F3A',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}

function getMembershipLabel(seatMode: StudentRecord['seatMode']): string {
  if (seatMode === 'fixed') return 'Fixed Dedicated Seat';
  if (seatMode === 'non_fixed') return 'Non-Fixed Flexible';
  return 'Unseated / Pending';
}

function drawGenderAvatarFallback(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  gender?: string,
): void {
  const isMale = gender === 'male';
  const isFemale = gender === 'female';

  // Background
  if (isMale) {
    doc.setFillColor(232, 239, 248);
  } else if (isFemale) {
    doc.setFillColor(248, 236, 239);
  } else {
    doc.setFillColor(237, 242, 247);
  }
  doc.roundedRect(x, y, w, h, 2, 2, 'F');

  const cx = x + w / 2;
  const headY = y + h * 0.36;
  const headR = Math.min(w, h) * 0.19;

  if (isMale) {
    doc.setFillColor(30, 64, 109);
  } else if (isFemale) {
    doc.setFillColor(140, 55, 87);
  } else {
    doc.setFillColor(71, 85, 105);
  }

  // Head circle
  doc.circle(cx, headY, headR, 'F');

  // Shoulders rounded arch
  const shoulderW = w * 0.66;
  const shoulderH = h * 0.32;
  doc.roundedRect(cx - shoulderW / 2, y + h * 0.6, shoulderW, shoulderH, 3.5, 3.5, 'F');

  // Subtle role badge at bottom
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(255, 255, 255);
  doc.text(isMale ? 'MEMBER' : isFemale ? 'MEMBER' : 'STUDENT', cx, y + h - 2.3, { align: 'center' });
}

function drawCropMarks(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setDrawColor(160, 174, 192);
  doc.setLineWidth(0.15);
  const len = 2.5;
  const gap = 0.8;

  // Top-left
  doc.line(x - gap - len, y, x - gap, y);
  doc.line(x, y - gap - len, x, y - gap);
  // Top-right
  doc.line(x + w + gap, y, x + w + gap + len, y);
  doc.line(x + w, y - gap - len, x + w, y - gap);
  // Bottom-left
  doc.line(x - gap - len, y + h, x - gap, y + h);
  doc.line(x, y + h + gap, x, y + h + gap + len);
  // Bottom-right
  doc.line(x + w + gap, y + h, x + w + gap + len, y + h);
  doc.line(x + w, y + h + gap, x + w, y + h + gap + len);
}

function drawCardFront(
  doc: jsPDF,
  x: number,
  y: number,
  item: PrintableIdCardItem,
  qrDataUrl: string,
): void {
  const { student, cardNumber } = item;
  const w = CR80_WIDTH_MM;
  const h = CR80_HEIGHT_MM;

  // Card base
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2.4, 2.4, 'FD');

  // Navy top header band
  doc.setFillColor(...NAVY);
  doc.roundedRect(x, y, w, 13.5, 2.4, 2.4, 'F');
  doc.rect(x, y + 10.5, w, 3, 'F');

  // Gold accent strip under header
  doc.setFillColor(...GOLD);
  doc.rect(x, y + 13.5, w, 0.9, 'F');

  // Mini brand monogram mark in header
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x + 3.2, y + 2.6, 8.2, 8.2, 1.5, 1.5, 'F');
  doc.setFillColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text('A', x + 7.3, y + 8.3, { align: 'center' });

  // Library title & tagline
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.text(LIBRARY_INFO.name, x + 13.2, y + 6.4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.0);
  doc.setTextColor(223, 181, 91);
  doc.text(LIBRARY_INFO.tagline, x + 13.2, y + 9.7);

  // Right-top Card ID badge
  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.text('STUDENT ID CARD', x + w - 3.2, y + 5.7, { align: 'right' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(5.6);
  doc.setTextColor(255, 255, 255);
  doc.text(cardNumber, x + w - 3.2, y + 9.5, { align: 'right' });

  // Photo box (left side)
  const photoX = x + 3.4;
  const photoY = y + 16.5;
  const photoW = 19.5;
  const photoH = 22.5;

  const safePhoto = getSafeAvatarSrc(student.profilePhotoUrl);
  let photoDrawn = false;
  if (safePhoto && safePhoto.startsWith('data:image/')) {
    try {
      const format = safePhoto.includes('image/png')
        ? 'PNG'
        : safePhoto.includes('image/webp')
          ? 'WEBP'
          : 'JPEG';
      doc.addImage(safePhoto, format, photoX, photoY, photoW, photoH);
      photoDrawn = true;
    } catch {
      photoDrawn = false;
    }
  }
  if (!photoDrawn) {
    drawGenderAvatarFallback(doc, photoX, photoY, photoW, photoH, student.gender);
  }

  // Crisp photo border
  doc.setDrawColor(...NAVY_MID);
  doc.setLineWidth(0.35);
  doc.roundedRect(photoX, photoY, photoW, photoH, 1.5, 1.5, 'S');

  // Student Details (middle column)
  const infoX = x + 25.0;
  const qrSize = 18.2;
  const qrX = x + w - qrSize - 3.4;
  const qrY = y + 17.5;

  // Student Full Name
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  const nameLines = doc.splitTextToSize(student.fullName.toUpperCase(), qrX - infoX - 2.0);
  doc.text(nameLines.slice(0, 2), infoX, y + 19.8);

  const detailsTop = nameLines.length > 1 ? y + 25.2 : y + 23.4;

  // Student ID / Reg No
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('STUDENT ID', infoX, detailsTop);
  doc.setFont('courier', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(...SLATE_DARK);
  doc.text(student.registrationNo, infoX, detailsTop + 3.0);

  // Membership & Shift
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('MEMBERSHIP & SHIFT', infoX, detailsTop + 6.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.0);
  doc.setTextColor(...SLATE_DARK);
  const shiftStr = `${getMembershipLabel(student.seatMode)} · ${getShiftDisplayLabel(student.shiftType)}`;
  const shiftLines = doc.splitTextToSize(shiftStr, qrX - infoX - 2.0);
  doc.text(shiftLines.slice(0, 2), infoX, detailsTop + 9.6);

  // Seat & Valid Until row
  const bottomMetaY = y + 39.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.9);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('SEAT / HALL', infoX, bottomMetaY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(...NAVY);
  const seatText = student.seatId ? `${student.seatId} (${student.hall})` : student.hall;
  doc.text(seatText, infoX, bottomMetaY + 3.0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.9);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('VALID UNTIL', infoX + 22.0, bottomMetaY);
  doc.setFont('courier', 'bold');
  doc.setFontSize(6.1);
  doc.setTextColor(...NAVY);
  doc.text(student.membershipExpiry || 'Active', infoX + 22.0, bottomMetaY + 3.0);

  // QR Code on right
  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.2);
  doc.roundedRect(qrX - 0.8, qrY - 0.8, qrSize + 1.6, qrSize + 1.6, 1.2, 1.2, 'S');
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.6);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('SCAN TO VERIFY', qrX + qrSize / 2, qrY + qrSize + 3.1, { align: 'center' });

  // Bottom Contact Footer Strip
  doc.setFillColor(244, 247, 251);
  doc.rect(x + 0.3, y + h - 6.6, w - 0.6, 6.2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(x, y + h - 6.6, x + w, y + h - 6.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.0);
  doc.setTextColor(...NAVY);
  doc.text(`${LIBRARY_INFO.addressLine1} · ${LIBRARY_INFO.helpline} · 24/7 Open`, x + w / 2, y + h - 2.6, {
    align: 'center',
  });
}

function drawCardBack(doc: jsPDF, x: number, y: number, item: PrintableIdCardItem): void {
  const { cardNumber } = item;
  const w = CR80_WIDTH_MM;
  const h = CR80_HEIGHT_MM;

  // Card base
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2.4, 2.4, 'FD');

  // Top subtle navy stripe
  doc.setFillColor(...NAVY);
  doc.roundedRect(x, y, w, 7.8, 2.4, 2.4, 'F');
  doc.rect(x, y + 5.2, w, 2.6, 'F');

  doc.setFillColor(...GOLD);
  doc.rect(x, y + 7.8, w, 0.7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(...WHITE);
  doc.text('AV_ESAFE LIBRARY · MEMBER GUIDELINES & VERIFICATION', x + 3.4, y + 5.1);

  // Two-column structured layout on back
  const leftX = x + 3.4;
  const rightX = x + 46.5;
  const contentY = y + 11.8;

  // Left: Library Rules & Usage Instructions
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(...NAVY);
  doc.text('LIBRARY RULES & CARD USAGE', leftX, contentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.9);
  doc.setTextColor(...SLATE_DARK);
  const rules = [
    '1. Carry this card at all times for entry & verification.',
    '2. Non-transferable; strictly for the named member.',
    '3. Maintain complete silence inside Hall 1 & Hall 2.',
    '4. Occupy only your assigned seat & shift window.',
    '5. Renew membership before expiry to avoid lockouts.',
  ];
  let ruleY = contentY + 3.2;
  for (const r of rules) {
    const lines = doc.splitTextToSize(r, 41.2);
    doc.text(lines, leftX, ruleY);
    ruleY += lines.length * 2.7 + 0.8;
  }

  // Lost card notice box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftX, y + 36.2, 40.8, 12.2, 1.2, 1.2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(...NAVY);
  doc.text('IF FOUND / LOST CARD', leftX + 1.8, y + 39.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.6);
  doc.setTextColor(...SLATE_MUTED);
  const lostLines = doc.splitTextToSize(
    'Report lost cards immediately at the desk for revocation & reissue. Return found cards to Av_eSAFE Library reception.',
    37.4,
  );
  doc.text(lostLines, leftX + 1.8, y + 41.8);

  // Right: Address, Hours, Emergency & Authorized Signature
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(...NAVY);
  doc.text('LIBRARY ADDRESS & HOURS', rightX, contentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.9);
  doc.setTextColor(...SLATE_DARK);
  doc.text(LIBRARY_INFO.addressLine1, rightX, contentY + 3.2);
  doc.text(LIBRARY_INFO.addressLine2, rightX, contentY + 5.8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY_MID);
  doc.text(`Hours: ${LIBRARY_INFO.hours}`, rightX, contentY + 9.0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(...NAVY);
  doc.text('EMERGENCY CONTACT', rightX, contentY + 13.4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.9);
  doc.setTextColor(...SLATE_DARK);
  doc.text(LIBRARY_INFO.emergency, rightX, contentY + 16.3);
  doc.text(LIBRARY_INFO.email, rightX, contentY + 18.9);

  // Authorized Signature Box
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(rightX, y + 42.4, x + w - 3.6, y + 42.4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.9);
  doc.setTextColor(...NAVY);
  doc.text('AUTHORIZED SIGNATORY', rightX + (x + w - 3.6 - rightX) / 2, y + 45.2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.5);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('Av_eSAFE Library Administration', rightX + (x + w - 3.6 - rightX) / 2, y + 47.6, {
    align: 'center',
  });

  // Bottom micro-ID
  doc.setFont('courier', 'normal');
  doc.setFontSize(4.6);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(`Card Ref: ${cardNumber} · Property of Av_eSAFE Library`, x + w / 2, y + h - 1.8, {
    align: 'center',
  });
}

/**
 * Generates an exact physical CR80 (85.6 mm × 54 mm) 2-page PDF (Page 1: Front, Page 2: Back)
 * ideal for PVC card printers or single-card archival.
 */
export async function downloadSingleCr80IdCardPdf(item: PrintableIdCardItem): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [CR80_WIDTH_MM, CR80_HEIGHT_MM],
  });

  const verificationUrl = buildCardVerificationUrl(item.cardNumber);
  const qrDataUrl = await generateQrDataUrl(verificationUrl);

  drawCardFront(doc, 0, 0, item, qrDataUrl);
  doc.addPage([CR80_WIDTH_MM, CR80_HEIGHT_MM], 'landscape');
  drawCardBack(doc, 0, 0, item);

  const safeReg = item.student.registrationNo.replace(/[^A-Z0-9_-]/gi, '');
  doc.save(`Av_eSAFE-IDCard-${safeReg}-${item.cardNumber}.pdf`);
}

/**
 * Generates an A4 print-ready multi-card PDF (2 columns × 4 rows = 8 CR80 cards per sheet)
 * with exact 85.6 mm × 54 mm card geometry, crop guides, and duplex-aligned Front & Back pages.
 */
export async function downloadBulkIdCardsA4Pdf(
  items: PrintableIdCardItem[],
  filename?: string,
): Promise<void> {
  if (items.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const cols = 2;
  const rows = 4;
  const perSheet = cols * rows;
  const colGap = 12;
  const rowGap = 10;
  const totalGridW = cols * CR80_WIDTH_MM + (cols - 1) * colGap;
  const startX = (pageWidth - totalGridW) / 2; // 13.4 mm centered margins for symmetric duplex alignment
  const startY = 22;

  // Pre-generate QR data URLs for all items
  const qrMap = new Map<string, string>();
  for (const item of items) {
    const url = buildCardVerificationUrl(item.cardNumber);
    qrMap.set(item.cardNumber, await generateQrDataUrl(url));
  }

  const totalSheets = Math.ceil(items.length / perSheet);

  for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
    const slice = items.slice(sheetIdx * perSheet, (sheetIdx + 1) * perSheet);

    // FRONT PAGE
    if (sheetIdx > 0) doc.addPage('a4', 'portrait');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(
      `AV_ESAFE LIBRARY · STUDENT ID CARDS — FRONT SHEET ${sheetIdx + 1} OF ${totalSheets}`,
      startX,
      12,
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_MUTED);
    doc.text(
      `CR80 Standard (85.6 mm × 54 mm) · Print at 100% Actual Size · ${slice.length} card(s)`,
      startX,
      16.5,
    );

    slice.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = startX + col * (CR80_WIDTH_MM + colGap);
      const y = startY + row * (CR80_HEIGHT_MM + rowGap);
      drawCropMarks(doc, x, y, CR80_WIDTH_MM, CR80_HEIGHT_MM);
      drawCardFront(doc, x, y, item, qrMap.get(item.cardNumber)!);
    });

    // BACK PAGE (mirrored horizontally across columns for clean duplex alignment)
    doc.addPage('a4', 'portrait');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(
      `AV_ESAFE LIBRARY · STUDENT ID CARDS — BACK SHEET ${sheetIdx + 1} OF ${totalSheets} (DUPLEX ALIGNED)`,
      startX,
      12,
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_MUTED);
    doc.text(
      'Flip on long edge · Columns horizontally mirrored to align behind fronts on duplex print',
      startX,
      16.5,
    );

    slice.forEach((item, idx) => {
      const col = idx % cols;
      const mirroredCol = cols - 1 - col;
      const row = Math.floor(idx / cols);
      const x = startX + mirroredCol * (CR80_WIDTH_MM + colGap);
      const y = startY + row * (CR80_HEIGHT_MM + rowGap);
      drawCropMarks(doc, x, y, CR80_WIDTH_MM, CR80_HEIGHT_MM);
      drawCardBack(doc, x, y, item);
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(filename || `Av_eSAFE-Student-ID-Cards-A4-${stamp}.pdf`);
}
