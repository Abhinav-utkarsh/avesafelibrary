import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Armchair, Bell, CalendarCheck2, CreditCard, Home, LogOut, UserCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../common/ThemeToggle';
import { BrandMark } from '../common/BrandMark';
import { StudentAvatar } from '../common/StudentAvatar';
import { StudentLoginPopupModal } from './StudentLoginPopupModal';

const STUDENT_TABS = [
  { to: '/student/home', label: 'Home', mobileLabel: 'Home', icon: Home },
  { to: '/student/seat-request', label: 'Seat & Shift', mobileLabel: 'Seat', icon: Armchair },
  { to: '/student/fees', label: 'Fees', mobileLabel: 'Fees', icon: CreditCard },
  { to: '/student/attendance', label: 'Attendance', mobileLabel: 'Attend', icon: CalendarCheck2 },
  { to: '/student/notices', label: 'Notices', mobileLabel: 'Notices', icon: Bell },
  { to: '/student/profile', label: 'Profile', mobileLabel: 'Profile', icon: UserCircle2 },
];

export function StudentLayout({ children }: { children: React.ReactNode }) {
  const { studentProfile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const currentTab =
    STUDENT_TABS.find((t) => location.pathname.startsWith(t.to)) || STUDENT_TABS[0];

  const handleLogout = async () => {
    await logout();
    navigate('/student/login');
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#060E1C] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Compact Top App Bar (54px height) */}
      <header className="no-print sticky top-0 z-30 h-[54px] bg-white/92 dark:bg-[#091529]/92 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <BrandMark size="sm" />
            <span className="font-display text-sm sm:text-base font-bold text-[#0B1F3A] dark:text-white whitespace-nowrap">
              Av_eSAFE Library
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-1" aria-label="Student Navigation">
            {STUDENT_TABS.map((tab) => {
              const isActive = location.pathname.startsWith(tab.to);
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={`relative px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-white dark:text-slate-950'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="student-desktop-tab"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      className="absolute inset-0 rounded-lg bg-[#0B1F3A] dark:bg-sky-400"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <span className="md:hidden font-display text-sm font-semibold text-[#0B1F3A] dark:text-white truncate">
          {currentTab.label}
        </span>

        <div className="flex items-center gap-2.5 shrink-0">
          {studentProfile && (
            <NavLink
              to="/student/profile"
              className="flex items-center gap-2 pr-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors p-1"
              title="Student Profile & Photo"
            >
              <StudentAvatar
                name={studentProfile.fullName}
                gender={studentProfile.gender}
                photoUrl={studentProfile.profilePhotoUrl}
                size="xs"
              />
              <span className="hidden lg:inline font-mono text-xs text-slate-600 dark:text-slate-300">
                {studentProfile.registrationNo}
              </span>
            </NavLink>
          )}
          <ThemeToggle compact />
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Responsive Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-10">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      </main>

      {/* Automatic Login Popup for Birthday Wishes & New Notices */}
      <StudentLoginPopupModal />

      {/* Mobile Fixed Bottom Navigation (60px height) */}
      <nav
        aria-label="Student Mobile Navigation"
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 h-[60px] bg-white/95 dark:bg-[#091529]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-6 items-center px-1"
      >
        {STUDENT_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname.startsWith(tab.to);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={`relative flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors ${
                isActive
                  ? 'text-[#0B1F3A] dark:text-sky-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="student-mobile-tab-bar"
                  className="absolute top-0 w-6 h-0.5 rounded-full bg-[#0B1F3A] dark:bg-sky-400"
                />
              )}
              <Icon className="w-4 h-4" />
              <span className="text-[10px] mt-1 leading-none whitespace-nowrap">{tab.mobileLabel}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
