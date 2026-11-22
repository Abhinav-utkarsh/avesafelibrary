import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  IdCard,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { BrandMark } from '../components/common/BrandMark';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { verifyIdCardPublic } from '../services/idCardService';
import type { CardVerificationResponse, CardVerificationVerdict } from '../types/domain';

interface VerdictPresentation {
  title: string;
  subtitle: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  icon: React.ComponentType<{ className?: string }>;
}

const VERDICT_UI: Record<CardVerificationVerdict, VerdictPresentation> = {
  VALID: {
    title: 'Valid Student ID Card',
    subtitle: 'Active Av_eSAFE Library membership verified in real time.',
    borderClass: 'border-emerald-300 dark:border-emerald-800',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
    textClass: 'text-emerald-800 dark:text-emerald-200',
    icon: CheckCircle2,
  },
  EXPIRED: {
    title: 'Membership Expired',
    subtitle: 'This ID card belongs to a member whose validity period has ended.',
    borderClass: 'border-amber-300 dark:border-amber-800',
    bgClass: 'bg-amber-50 dark:bg-amber-950/40',
    textClass: 'text-amber-900 dark:text-amber-200',
    icon: Clock,
  },
  INACTIVE: {
    title: 'Inactive Student Account',
    subtitle: 'The student membership linked to this card is currently inactive or suspended.',
    borderClass: 'border-amber-300 dark:border-amber-800',
    bgClass: 'bg-amber-50 dark:bg-amber-950/40',
    textClass: 'text-amber-900 dark:text-amber-200',
    icon: AlertTriangle,
  },
  REVOKED: {
    title: 'Card Revoked or Superseded',
    subtitle: 'This card has been revoked or replaced by a newly issued ID card.',
    borderClass: 'border-rose-300 dark:border-rose-800',
    bgClass: 'bg-rose-50 dark:bg-rose-950/40',
    textClass: 'text-rose-900 dark:text-rose-200',
    icon: ShieldAlert,
  },
  INVALID: {
    title: 'Invalid ID Card',
    subtitle: 'No matching Av_eSAFE Library ID card was found for this code.',
    borderClass: 'border-rose-300 dark:border-rose-800',
    bgClass: 'bg-rose-50 dark:bg-rose-950/40',
    textClass: 'text-rose-900 dark:text-rose-200',
    icon: XCircle,
  },
};

function formatMembershipType(type?: string): string {
  if (type === 'fixed') return 'Fixed Dedicated Seat';
  if (type === 'non_fixed') return 'Non-Fixed Flexible';
  if (type === 'unseated') return 'Unseated / Desk Pending';
  return type || 'Standard';
}

export function VerifyCardPage() {
  const { cardNumber: routeCardNumber } = useParams<{ cardNumber?: string }>();
  const navigate = useNavigate();

  const [inputCode, setInputCode] = useState(routeCardNumber || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CardVerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clean = (routeCardNumber || '').trim().toUpperCase();
    setInputCode(clean);
    if (!clean) {
      setResult(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    verifyIdCardPublic(clean)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setResult(null);
          setError(err instanceof Error ? err.message : 'Unable to verify ID card right now.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routeCardNumber]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputCode.trim().toUpperCase();
    if (!cleaned) return;
    navigate(`/verify/${encodeURIComponent(cleaned)}`);
  };

  const verdictUi = result ? VERDICT_UI[result.verdict] || VERDICT_UI.INVALID : null;
  const VerdictIcon = verdictUi?.icon || ShieldCheck;

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#060E1C] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 h-16 bg-white/90 dark:bg-[#091529]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3">
          <BrandMark size="sm" />
          <div className="leading-tight">
            <span className="font-display font-bold text-sm sm:text-base text-[#0B1F3A] dark:text-white block">
              Av_eSAFE Library
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              Official ID Card Verification
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#0B1F3A] dark:hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </Link>
          <ThemeToggle compact />
        </div>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-10 sm:py-14 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#DFB55B] mx-auto flex items-center justify-center shadow-sm">
            <IdCard className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Student ID Verification
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Verify Av_eSAFE Library membership card authenticity without exposing private personal
            details.
          </p>
        </div>

        {/* Manual Card Number Lookup */}
        <form
          onSubmit={handleLookupSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 surface-card flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="Enter card number (e.g., AVE-2026-A1B2C3D4)"
              aria-label="Card number to verify"
              className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 dark:focus:ring-sky-400/20"
            />
          </div>
          <button
            type="submit"
            disabled={!inputCode.trim() || loading}
            className="min-h-[44px] px-5 rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          >
            {loading ? 'Checking...' : 'Verify Card'}
          </button>
        </form>

        {/* Loading State */}
        {loading && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#0B1F3A] dark:text-sky-400 mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Verifying card credentials...
            </p>
          </div>
        )}

        {/* Network Error */}
        {!loading && error && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-5 flex items-start gap-3 text-rose-800 dark:text-rose-200">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Verification Failed</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Verification Verdict Result */}
        {!loading && result && verdictUi && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden surface-elevated">
            <div className={`p-5 border-b ${verdictUi.borderClass} ${verdictUi.bgClass}`}>
              <div className="flex items-start gap-3.5">
                <VerdictIcon className={`w-6 h-6 shrink-0 mt-0.5 ${verdictUi.textClass}`} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={`font-display text-lg font-bold ${verdictUi.textClass}`}>
                      {verdictUi.title}
                    </h2>
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 border border-current/20">
                      {result.verdict}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${verdictUi.textClass} opacity-90`}>
                    {result.reason || verdictUi.subtitle}
                  </p>
                </div>
              </div>
            </div>

            {result.card ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Cardholder Name
                    </p>
                    <p className="font-display text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                      {result.card.studentName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Student ID
                    </p>
                    <p className="font-mono text-sm font-bold text-[#0B1F3A] dark:text-sky-400 mt-0.5">
                      {result.card.registrationNo}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Card Number
                    </dt>
                    <dd className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">
                      {result.card.cardNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Membership Type
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-1">
                      {formatMembershipType(result.card.membershipType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Shift
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-1">
                      {result.card.shiftLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Hall &amp; Seat
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-1">
                      {result.card.hall}
                      {result.card.seatId ? ` · ${result.card.seatId}` : ' · Unseated'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Valid Until
                    </dt>
                    <dd className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">
                      {result.card.membershipExpiry || 'Not specified'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Card Status
                    </dt>
                    <dd className="font-medium capitalize text-slate-900 dark:text-slate-100 mt-1">
                      {result.card.cardStatus}
                    </dd>
                  </div>
                </dl>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Av_eSAFE Library · Electronic City, Bangalore</span>
                  <span className="font-mono">
                    Checked {new Date(result.checkedAt).toLocaleTimeString('en-IN')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-5 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <p>
                  Card reference{' '}
                  <span className="font-mono font-semibold">
                    {routeCardNumber || inputCode}
                  </span>{' '}
                  is not registered in Av_eSAFE Library&apos;s active verification ledger.
                </p>
                <p>
                  If you believe this is an error, please present the physical card at the
                  Electronic City, Bangalore front desk.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
