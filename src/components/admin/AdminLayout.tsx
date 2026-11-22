import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  BookMarked,
  Building2,
  Cake,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  Clock,
  CreditCard,
  Crown,
  DoorClosed,
  FileSpreadsheet,
  FileText,
  History,
  IdCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Receipt,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStudentPortalMirrorSync } from '../../hooks/useStudentPortalMirrorSync';
import { subscribeAllApprovalRequests } from '../../services/approvalService';
import {
  canAccessAdminSection,
  formatAdminRoleLabel,
  type AdminSectionId,
} from '../../lib/rolePermissions';
import { ThemeToggle } from '../common/ThemeToggle';
import { BrandMark } from '../common/BrandMark';

export interface AdminNavSubItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string, search: string) => boolean;
}

export interface AdminNavItem {
  id: AdminSectionId;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: AdminNavSubItem[];
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { id: 'super-admin', to: '/super-admin', label: 'Super Admin Console', icon: Crown },
  { id: 'dashboard', to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'approvals', to: '/admin/approvals', label: 'Approvals Queue', icon: ClipboardCheck },
  {
    id: 'students',
    to: '/admin/students',
    label: 'Students',
    icon: Users,
    children: [
      {
        to: '/admin/students',
        label: 'Student List',
        icon: Users,
        match: (pathname, search) => {
          if (pathname !== '/admin/students') return false;
          const params = new URLSearchParams(search);
          return params.get('action') !== 'add' && params.get('view') !== 'unseated';
        },
      },
      {
        to: '/admin/students?action=add',
        label: 'Add Student',
        icon: UserPlus,
        match: (pathname, search) =>
          pathname === '/admin/students' && new URLSearchParams(search).get('action') === 'add',
      },
      {
        to: '/admin/students?view=unseated',
        label: 'Unseated Students',
        icon: UserCheck,
        match: (pathname, search) =>
          pathname === '/admin/students' && new URLSearchParams(search).get('view') === 'unseated',
      },
      {
        to: '/admin/batches',
        label: 'Exam Batches',
        icon: BookMarked,
        match: (pathname) => pathname.startsWith('/admin/batches'),
      },
      {
        to: '/admin/students/id-cards',
        label: 'Print ID Card',
        icon: IdCard,
        match: (pathname) => pathname.startsWith('/admin/students/id-cards'),
      },
    ],
  },
  { id: 'batches', to: '/admin/batches', label: 'Batches & Courses', icon: BookMarked },
  { id: 'memberships', to: '/admin/memberships', label: 'Memberships & Shifts', icon: CalendarClock },
  { id: 'seats', to: '/admin/seats', label: 'Seat Map (120)', icon: Building2 },
  {
    id: 'fees',
    to: '/admin/fees',
    label: 'Payment & Fees',
    icon: CreditCard,
    children: [
      {
        to: '/admin/fees?section=manage',
        label: 'Manage Fees',
        icon: SlidersHorizontal,
        match: (pathname, search) =>
          pathname === '/admin/fees' && new URLSearchParams(search).get('section') === 'manage',
      },
      {
        to: '/admin/fees?section=collect',
        label: 'Collect Fee',
        icon: CreditCard,
        match: (pathname, search) =>
          pathname === '/admin/fees' && new URLSearchParams(search).get('section') === 'collect',
      },
      {
        to: '/admin/fees?section=pending',
        label: 'Pending Fees',
        icon: AlertCircle,
        match: (pathname, search) => {
          if (pathname !== '/admin/fees') return false;
          const section = new URLSearchParams(search).get('section');
          return !section || section === 'pending';
        },
      },
      {
        to: '/admin/fees?section=early_expiry',
        label: 'Early Expiry',
        icon: Clock,
        match: (pathname, search) =>
          pathname === '/admin/fees' &&
          new URLSearchParams(search).get('section') === 'early_expiry',
      },
      {
        to: '/admin/fees?section=remaining_due',
        label: 'Remaining Due',
        icon: Wallet,
        match: (pathname, search) =>
          pathname === '/admin/fees' &&
          new URLSearchParams(search).get('section') === 'remaining_due',
      },
      {
        to: '/admin/fees?section=revenue',
        label: 'Revenue',
        icon: TrendingUp,
        match: (pathname, search) =>
          pathname === '/admin/fees' && new URLSearchParams(search).get('section') === 'revenue',
      },
      {
        to: '/admin/fees?section=monthly_fee',
        label: 'Monthly Fee',
        icon: CalendarRange,
        match: (pathname, search) =>
          pathname === '/admin/fees' &&
          new URLSearchParams(search).get('section') === 'monthly_fee',
      },
      {
        to: '/admin/fees?section=history',
        label: 'Payment History',
        icon: History,
        match: (pathname, search) =>
          pathname === '/admin/fees' && new URLSearchParams(search).get('section') === 'history',
      },
      {
        to: '/admin/fees?section=online_verification',
        label: 'Online Payment Verification',
        icon: ShieldCheck,
        match: (pathname, search) =>
          pathname === '/admin/fees' &&
          new URLSearchParams(search).get('section') === 'online_verification',
      },
    ],
  },
  { id: 'expenses', to: '/admin/expenses', label: 'Expenses', icon: Receipt },
  { id: 'attendance', to: '/admin/attendance', label: 'Attendance', icon: UserCheck },
  {
    id: 'communication',
    to: '/admin/notices',
    label: 'Communication',
    icon: MessageSquare,
    children: [
      {
        to: '/admin/notices?section=notices',
        label: 'Notices',
        icon: Megaphone,
        match: (pathname, search) => {
          if (pathname !== '/admin/notices') return false;
          const section = new URLSearchParams(search).get('section');
          return !section || section === 'notices';
        },
      },
      {
        to: '/admin/notices?section=bulk',
        label: 'Bulk Messaging',
        icon: Send,
        match: (pathname, search) =>
          pathname === '/admin/notices' && new URLSearchParams(search).get('section') === 'bulk',
      },
      {
        to: '/admin/notices?section=templates',
        label: 'Message Templates',
        icon: FileText,
        match: (pathname, search) =>
          pathname === '/admin/notices' &&
          new URLSearchParams(search).get('section') === 'templates',
      },
      {
        to: '/admin/notices?section=birthdays',
        label: 'Birthday Wishes',
        icon: Cake,
        match: (pathname, search) =>
          pathname === '/admin/notices' &&
          new URLSearchParams(search).get('section') === 'birthdays',
      },
      {
        to: '/admin/notices?section=tickets',
        label: 'Student Tickets',
        icon: LifeBuoy,
        match: (pathname, search) =>
          pathname === '/admin/notices' && new URLSearchParams(search).get('section') === 'tickets',
      },
      {
        to: '/admin/notices?section=notifications',
        label: 'Notifications',
        icon: Bell,
        match: (pathname, search) =>
          pathname === '/admin/notices' &&
          new URLSearchParams(search).get('section') === 'notifications',
      },
    ],
  },
  { id: 'analytics', to: '/admin/analytics', label: 'Analytics & Reports', icon: BarChart3 },
  { id: 'smart-door', to: '/admin/smart-door', label: 'Smart Door & IoT', icon: DoorClosed },
  { id: 'settings', to: '/admin/settings', label: 'Settings & Audit', icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const { adminProfile, firebaseUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Keep the backend student-password portal mirror synchronized with Firestore
  useStudentPortalMirrorSync(adminProfile);

  useEffect(() => {
    if (!adminProfile) return;
    return subscribeAllApprovalRequests((list) => {
      setPendingApprovalsCount(list.filter((r) => r.status === 'pending').length);
    });
  }, [adminProfile]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    students: true,
    fees: location.pathname.startsWith('/admin/fees'),
    communication: location.pathname.startsWith('/admin/notices'),
  });

  const visibleNavItems = ADMIN_NAV_ITEMS.filter((item) =>
    canAccessAdminSection(adminProfile?.role, item.id),
  );

  useEffect(() => {
    if (
      location.pathname.startsWith('/admin/students') ||
      location.pathname.startsWith('/admin/batches')
    ) {
      setOpenGroups((prev) => ({ ...prev, students: true }));
    } else if (location.pathname.startsWith('/admin/fees')) {
      setOpenGroups((prev) => ({ ...prev, fees: true }));
    } else if (location.pathname.startsWith('/admin/notices')) {
      setOpenGroups((prev) => ({ ...prev, communication: true }));
    }
  }, [location.pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const currentBreadcrumb = (() => {
    for (const item of ADMIN_NAV_ITEMS) {
      if (item.children) {
        const matchedSub = item.children.find((sub) =>
          sub.match(location.pathname, location.search),
        );
        if (matchedSub) {
          return `${item.label} / ${matchedSub.label}`;
        }
      }
      if (location.pathname.startsWith(item.to)) {
        return item.label;
      }
    }
    return 'Dashboard';
  })();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B1F3A] dark:bg-[#061224] text-slate-100 select-none">
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark size="md" inverted />
          <div className="min-w-0">
            <span className="font-display text-sm font-bold tracking-tight text-white block whitespace-nowrap">
              Av_eSAFE Library
            </span>
            <span className="text-[11px] text-[#DFB55B]/90 block mt-0.5 whitespace-nowrap">
              Admin Operations · Bangalore
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-300 hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Admin Navigation">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isGroup = Boolean(item.children && item.children.length > 0);
          const isActive =
            location.pathname.startsWith(item.to) ||
            (item.id === 'students' && location.pathname.startsWith('/admin/batches'));
          const isGroupOpen = Boolean(openGroups[item.id]);

          if (isGroup && item.children) {
            return (
              <div key={item.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.id)}
                  aria-expanded={isGroupOpen}
                  className={`w-full relative flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'text-white bg-white/10 border border-white/10'
                      : 'text-slate-300 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-[#DFB55B]' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isGroupOpen ? 'rotate-180 text-[#DFB55B]' : ''
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isGroupOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden pl-3.5 space-y-0.5"
                    >
                      <div className="border-l border-white/12 pl-2.5 py-0.5 space-y-0.5">
                        {item.children.map((sub) => {
                          const SubIcon = sub.icon;
                          const subActive = sub.match(location.pathname, location.search);
                          return (
                            <NavLink
                              key={sub.to}
                              to={sub.to}
                              onClick={() => setMobileMenuOpen(false)}
                              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                                subActive
                                  ? 'text-white bg-white/14 border border-white/10'
                                  : 'text-slate-300/85 hover:bg-white/8 hover:text-white'
                              }`}
                            >
                              <SubIcon
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  subActive ? 'text-[#DFB55B]' : 'text-slate-400'
                                }`}
                              />
                              <span className="truncate">{sub.label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }

          return (
            <NavLink
              key={item.id}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                isActive ? 'text-white' : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="admin-sidebar-active"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-white/14 border border-white/10"
                />
              )}
              <Icon
                className={`relative z-10 w-4 h-4 shrink-0 ${
                  isActive ? 'text-[#DFB55B]' : 'text-slate-400'
                }`}
              />
              <span className="relative z-10 truncate flex-1">{item.label}</span>
              {item.id === 'approvals' && pendingApprovalsCount > 0 && (
                <span className="relative z-10 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-[#C99A2E] text-[#0B1F3A] text-[10px] font-bold">
                  {pendingApprovalsCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-3 bg-black/15">
        <div className="px-2">
          <p className="text-xs font-semibold text-white truncate">
            {adminProfile?.fullName || firebaseUser?.displayName || 'Administrator'}
          </p>
          <p className="text-[11px] text-slate-300/80 truncate mt-0.5">
            {adminProfile?.email || firebaseUser?.email}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#DFB55B]/90 mt-1">
            {formatAdminRoleLabel(adminProfile?.role)}
            {adminProfile?.branch ? ` · ${adminProfile.branch.split(',')[0]}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full min-h-[40px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/16 text-slate-100 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#060E1C] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:block w-[272px] shrink-0 sticky top-0 h-screen border-r border-slate-200 dark:border-slate-800/80">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="no-print fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-[276px] max-w-[85vw] h-full z-10 shadow-2xl"
            >
              {sidebarContent}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="no-print sticky top-0 z-30 h-16 bg-white/90 dark:bg-[#091529]/90 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline whitespace-nowrap">
                {adminProfile?.role === 'super_admin'
                  ? 'Super Admin'
                  : formatAdminRoleLabel(adminProfile?.role)}
              </span>
              <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-[#0B1F3A] dark:text-white truncate">
                {currentBreadcrumb}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {adminProfile?.role === 'super_admin' && !location.pathname.startsWith('/super-admin') && (
              <NavLink
                to="/super-admin"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-[#B4831D] dark:text-[#DFB55B] hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors whitespace-nowrap shrink-0"
              >
                <Crown className="w-4 h-4" />
                Super Admin
              </NavLink>
            )}
            {canAccessAdminSection(adminProfile?.role, 'settings') && (
              <NavLink
                to="/admin/settings"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                System Config
              </NavLink>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1380px] w-full mx-auto">
          <motion.div
            key={`${location.pathname}${location.search}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
