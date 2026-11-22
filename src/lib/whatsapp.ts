import type { PaymentRecord, StudentRecord, StudentTicketRecord } from '../types/domain';

/**
 * Normalizes an Indian or international phone string for WhatsApp wa.me links.
 * Returns digits-only string (prefixes 91 for standard 10-digit Indian numbers), or empty string if invalid.
 */
export function normalizeWhatsAppPhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/[^0-9]/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return '';
}

/**
 * Builds a safe WhatsApp chat URL that redirects to that student's WhatsApp conversation.
 */
export function buildWhatsAppUrl(phone?: string | null, message?: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  const textParam = message && message.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${normalized}${textParam}`;
}

export function buildFeeReminderWhatsApp(student: StudentRecord): string {
  const pending = Number(student.pendingAmount || 0).toLocaleString('en-IN');
  return `Hello ${student.fullName} (${student.registrationNo}), this is a friendly reminder from Av_eSAFE Library, Electronic City, Bangalore. Your pending library fee balance is ₹${pending}. Kindly clear your dues to keep your seat (${student.seatId || student.hall}) active. Thank you!`;
}

export function buildRemainingDueWhatsApp(student: StudentRecord): string {
  const pending = Number(student.pendingAmount || 0).toLocaleString('en-IN');
  const monthly = Number(student.monthlyFee || 0).toLocaleString('en-IN');
  return `Hello ${student.fullName} (${student.registrationNo}), your remaining fee balance at Av_eSAFE Library (Monthly Plan ₹${monthly}) is ₹${pending}. Please clear the remaining due at the Electronic City, Bangalore desk or via UPI at your earliest convenience.`;
}

export function buildEarlyExpiryWhatsApp(student: StudentRecord, daysLeft: number | null): string {
  const timing =
    daysLeft === null
      ? `on ${student.membershipExpiry || 'soon'}`
      : daysLeft < 0
        ? `expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago (${student.membershipExpiry})`
        : daysLeft === 0
          ? `expires today (${student.membershipExpiry})`
          : `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${student.membershipExpiry})`;
  return `Hello ${student.fullName} (${student.registrationNo}), your Av_eSAFE Library membership (${student.hall}${student.seatId ? `, Seat ${student.seatId}` : ''}) ${timing}. Renew early to retain uninterrupted 24/7 access and your reserved seat.`;
}

export function buildReceiptShareWhatsApp(payment: PaymentRecord): string {
  const paid = Number(payment.amountPaid || 0).toLocaleString('en-IN');
  const due = Number(payment.dueAmount || 0).toLocaleString('en-IN');
  return `Hello ${payment.studentName}, thank you for your payment at Av_eSAFE Library, Electronic City, Bangalore!\n\nReceipt No: ${payment.receiptNo}\nBilling Month: ${payment.billingMonth}\nAmount Paid: ₹${paid}\nRemaining Due: ₹${due}\n\nYou can also download your official A4 receipt anytime from the Student Portal.`;
}

export function buildBirthdayWishWhatsApp(student: StudentRecord, customBody?: string): string {
  if (customBody && customBody.trim()) {
    return customBody
      .replace(/\{name\}/gi, student.fullName)
      .replace(/\{regNo\}/gi, student.registrationNo)
      .replace(/\{seat\}/gi, student.seatId || 'Unassigned')
      .replace(/\{hall\}/gi, student.hall);
  }
  return `Happy Birthday, ${student.fullName}! Wishing you a joyful year ahead filled with focus, growth, and great success in all your exams and goals. Warm wishes from the entire team at Av_eSAFE Library, Electronic City, Bangalore!`;
}

export function buildTicketFollowUpWhatsApp(ticket: StudentTicketRecord): string {
  return `Hello ${ticket.studentName}, regarding your Av_eSAFE Library support ticket ${ticket.ticketNo} ("${ticket.subject}"): ${
    ticket.adminReply
      ? ticket.adminReply
      : 'Our desk team is reviewing your request and will assist you shortly.'
  }`;
}
