import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Clock,
  Crown,
  ShieldCheck,
  Smartphone,
  UserCog,
} from 'lucide-react';
import { fetchSystemHealth } from '../lib/api';
import { SHIFT_DEFINITIONS, type SystemHealthResponse } from '../types/domain';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { BrandMark } from '../components/common/BrandMark';

const HERO_IMAGE_URL = '/src/assets/images/nirvana_study_hall_1795282503670.jpg';

export function PortalSelectPage() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSystemHealth()
      .then((data) => {
        if (active) setHealth(data);
      })
      .catch(() => {
        // Handled silently on public gateway
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#060E1C] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#060E1C]/90 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#0B1F3A] dark:text-white whitespace-nowrap shrink-0"
          >
            <BrandMark size="sm" />
            Av_eSAFE Library
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#portals" className="hover:text-[#0B1F3A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              3 Portals
            </a>
            <a href="#facility" className="hover:text-[#0B1F3A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Study Halls
            </a>
            <a href="#shifts" className="hover:text-[#0B1F3A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Shift Plans
            </a>
            <a href="#security" className="hover:text-[#0B1F3A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Access Control
            </a>
          </nav>

          <Link
            to="/super-admin/login"
            className="px-4 py-2 min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 text-white dark:text-slate-950 text-xs font-semibold hover:bg-[#132E54] dark:hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0"
          >
            <Crown className="w-3.5 h-3.5 text-[#DFB55B] dark:text-slate-950" />
            Founder / Admin
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Split Architectural Hero */}
        <section id="portals" className="max-w-7xl mx-auto px-6 pt-12 pb-14 lg:pt-16 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 flex flex-col justify-between space-y-7"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Electronic City, Bangalore · 24/7 Self-Study Centre · 120 Seats
                  </p>
                  <ThemeToggle compact />
                </div>

                <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#0B1F3A] dark:text-white leading-[1.08] max-w-xl">
                  Structured Operations for Modern Study Halls
                </h1>

                <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg">
                  Three role-isolated portals for Av_eSAFE Library — Founder governance, role-based Admin operations (Branch Manager, Manager, Accounts &amp; Desk), and Student self-service.
                </p>
              </div>

              {/* 3 Main Portal Entry Cards */}
              <div className="space-y-3.5 pt-1">
                <Link
                  to="/super-admin/login"
                  className="group p-4 sm:p-5 rounded-2xl bg-[#0B1F3A] dark:bg-[#0D2548] border border-[#0B1F3A] dark:border-[#DFB55B]/35 text-white hover:bg-[#122D52] dark:hover:bg-[#13315C] surface-elevated transition-all hover:-translate-y-0.5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Crown className="w-5 h-5 text-[#DFB55B]" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#DFB55B]">
                        Owner / Founder Console
                      </p>
                      <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                        Super Admin Portal
                      </h2>
                      <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                        Add or remove Admins, assign Branch Manager, Manager &amp; Accounts roles, and oversee audit governance.
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#DFB55B] group-hover:translate-x-1 transition-transform shrink-0" />
                </Link>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Link
                    to="/admin/login"
                    className="group p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white hover:border-[#0B1F3A] dark:hover:border-sky-500 surface-card transition-all hover:-translate-y-0.5 flex flex-col justify-between gap-5"
                  >
                    <div className="flex items-center justify-between">
                      <UserCog className="w-6 h-6 text-[#0B1F3A] dark:text-sky-400" />
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-[#0B1F3A] dark:group-hover:text-sky-400 transition-all" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Manager · Branch · Accounts
                      </p>
                      <h2 className="font-display text-lg font-semibold mt-0.5">Admin Portal</h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                        Students, Exam Batches, 120-seat map, fee receipts, WhatsApp outreach &amp; smart door.
                      </p>
                    </div>
                  </Link>

                  <Link
                    to="/student/login"
                    className="group p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white hover:border-[#0B1F3A] dark:hover:border-sky-500 surface-card transition-all hover:-translate-y-0.5 flex flex-col justify-between gap-5"
                  >
                    <div className="flex items-center justify-between">
                      <Smartphone className="w-6 h-6 text-[#0B1F3A] dark:text-sky-400" />
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-[#0B1F3A] dark:group-hover:text-sky-400 transition-all" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Member Self-Service
                      </p>
                      <h2 className="font-display text-lg font-semibold mt-0.5">Student Portal</h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                        Seat pass, exam batch, A4 receipts, online UPI verification, attendance &amp; tickets.
                      </p>
                    </div>
                  </Link>
                </div>

                <Link
                  to="/student/register"
                  className="group p-3.5 px-4 rounded-2xl bg-[#C99A2E]/12 dark:bg-[#C99A2E]/15 border border-[#C99A2E]/40 hover:border-[#C99A2E] text-[#0B1F3A] dark:text-[#F6D57A] transition-all flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-bold">
                      New Student? Register Online &amp; Pick Your Available Seat
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      Choose your exam batch/course, shift timing, and live Hall 1 / Hall 2 seat for Admin approval.
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.div>

            {/* Right Architectural Visual */}
            <motion.div
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0B1F3A] min-h-[280px] lg:min-h-[430px] relative surface-elevated"
            >
              {!imgError ? (
                <img
                  src={HERO_IMAGE_URL}
                  alt="Av_eSAFE Library study hall carrels with warm desk lamps and acoustic paneling"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover lg:h-full"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-10 text-center bg-gradient-to-br from-[#0B1F3A] to-[#16345E] text-white">
                  <BookOpen className="w-10 h-10 text-[#DFB55B] mb-3" />
                  <p className="font-display text-lg font-semibold">Av_eSAFE Library Study Halls</p>
                  <p className="text-xs text-slate-300 mt-1">Hall 1 (80 Seats) · Hall 2 (40 Seats)</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-[#061326]/95 via-[#061326]/55 to-transparent text-white">
                <p className="font-display text-sm font-semibold">Quiet, Air-Conditioned Reading Environment</p>
                <p className="text-xs text-slate-200 mt-0.5">
                  Dedicated individual carrels · Power sockets · High-speed Wi-Fi · 24/7 Access
                </p>
              </div>
            </motion.div>
          </div>

          {/* Full-Width 4-Column Facility Specification Strip */}
          <div
            id="facility"
            className="mt-10 grid grid-cols-2 lg:grid-cols-4 border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 surface-card divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800"
          >
            <div className="p-6">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Library Capacity</p>
              <p className="font-display font-mono tabular-nums text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
                {health?.library.capacity.totalSeats ?? 120}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Fixed &amp; non-fixed seats</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-slate-500 dark:text-slate-400">Hall 1 Capacity</p>
              <p className="font-display font-mono tabular-nums text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
                {health?.library.capacity.hall1Seats ?? 80}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Main reading hall (H1-01 to H1-80)</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-slate-500 dark:text-slate-400">Hall 2 Capacity</p>
              <p className="font-display font-mono tabular-nums text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
                {health?.library.capacity.hall2Seats ?? 40}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Silent study wing (H2-01 to H2-40)</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-slate-500 dark:text-slate-400">Operating Schedule</p>
              <p className="font-display font-mono tabular-nums text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
                {health?.library.operatingHours ?? '24/7'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">7 structured shift plans</p>
            </div>
          </div>
        </section>

        {/* 7 Shift Schedule Matrix */}
        <section id="shifts" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-14">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
                  Shift Schedules &amp; Seat Modes
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Standard operating shifts supported across membership enrollment and attendance rules.
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#C89B3C]" />
                Electronic City, Bangalore · Standard Reference Tiers (INR / month)
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 surface-card">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-3.5 px-5">Shift Plan</th>
                    <th className="py-3.5 px-5">Access Window</th>
                    <th className="py-3.5 px-5 text-right">Duration</th>
                    <th className="py-3.5 px-5 text-right">Non-Fixed Seat</th>
                    <th className="py-3.5 px-5 text-right">Fixed Reserved Seat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  {SHIFT_DEFINITIONS.map((shift) => (
                    <tr
                      key={shift.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {shift.label}
                      </td>
                      <td className="py-3.5 px-5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {shift.window}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {shift.hours} hrs
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        ₹{shift.defaultFeeNonFixed}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] dark:text-sky-300 whitespace-nowrap">
                        ₹{shift.defaultFeeFixed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Security & Smart Door Architecture Summary */}
        <section id="security" className="max-w-7xl mx-auto px-6 py-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card">
              <ShieldCheck className="w-5 h-5 text-[#0B1F3A] dark:text-sky-400 mb-3" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Role-Isolated Portals
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Firebase Authentication tokens are cryptographically verified on the server. Students access strictly their own profile, attendance, bills, and receipts.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card">
              <Building2 className="w-5 h-5 text-[#0B1F3A] dark:text-sky-400 mb-3" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Transactional Integrity
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Seat allocations, idempotent fee receipts, and immutable audit trails persist directly in Cloud Firestore with enforced security rules.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card">
              <Clock className="w-5 h-5 text-[#C89B3C] mb-3" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Biometric Smart Door Control
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Engineered for ESP32 + R307 fingerprint access controllers with HMAC-SHA256 verification, anti-passback protection, and instant simulator diagnostics.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#060E1C] py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-2">
            <BrandMark size="sm" />
            <span>Av_eSAFE Library · Electronic City, Bangalore</span>
          </span>
          <div className="flex flex-wrap items-center gap-6">
            <Link to="/super-admin/login" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Super Admin
            </Link>
            <Link to="/admin/login" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Admin Login
            </Link>
            <Link to="/student/login" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Student Login
            </Link>
            <Link to="/student/register" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Student Registration
            </Link>
            <Link to="/student/forgot-password" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Password Recovery
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
