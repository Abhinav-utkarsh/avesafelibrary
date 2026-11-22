import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { canAccessAdminSection, type AdminSectionId } from './lib/rolePermissions';
import { PageLoadingSkeleton } from './components/common/LoadingSkeleton';
import { AdminLayout } from './components/admin/AdminLayout';
import { StudentLayout } from './components/student/StudentLayout';
import { PortalSelectPage } from './pages/PortalSelectPage';
import { AdminLoginPage } from './pages/auth/AdminLoginPage';
import { StudentLoginPage } from './pages/auth/StudentLoginPage';
import { StudentRegisterPage } from './pages/auth/StudentRegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { SuperAdminConsolePage } from './pages/admin/SuperAdminConsolePage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminApprovalsPage } from './pages/admin/AdminApprovalsPage';
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage';
import { AdminBatchesPage } from './pages/admin/AdminBatchesPage';
import { AdminIdCardsPage } from './pages/admin/AdminIdCardsPage';
import { AdminMembershipsPage } from './pages/admin/AdminMembershipsPage';
import { AdminSeatMapPage } from './pages/admin/AdminSeatMapPage';
import { AdminFeesPage } from './pages/admin/AdminFeesPage';
import { AdminExpensesPage } from './pages/admin/AdminExpensesPage';
import { AdminAttendancePage } from './pages/admin/AdminAttendancePage';
import { AdminNoticesPage } from './pages/admin/AdminNoticesPage';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminSmartDoorPage } from './pages/admin/AdminSmartDoorPage';
import { StudentHomePage } from './pages/student/StudentHomePage';
import { StudentSeatRequestPage } from './pages/student/StudentSeatRequestPage';
import { StudentFeesPage } from './pages/student/StudentFeesPage';
import { StudentAttendancePage } from './pages/student/StudentAttendancePage';
import { StudentNoticesPage } from './pages/student/StudentNoticesPage';
import { StudentProfilePage } from './pages/student/StudentProfilePage';
import { VerifyCardPage } from './pages/VerifyCardPage';
import { ScrollToTopButton } from './components/common/ScrollToTopButton';

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { authReady, roleLoading, firebaseUser, adminAuthMode, role, isSuperAdmin } = useAuth();

  if (!authReady || roleLoading) {
    return <PageLoadingSkeleton label="Verifying Super Admin governance session..." />;
  }

  const isAuthedAdmin = role === 'admin' && (Boolean(firebaseUser) || adminAuthMode === 'password');
  if (!isAuthedAdmin) {
    return <Navigate to="/super-admin/login" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

function RequireAdmin({
  children,
  section = 'dashboard',
}: {
  children: React.ReactNode;
  section?: AdminSectionId;
}) {
  const { authReady, roleLoading, firebaseUser, adminAuthMode, role, adminRole } = useAuth();

  if (!authReady || roleLoading) {
    return <PageLoadingSkeleton label="Verifying administrator session..." />;
  }

  const isAuthedAdmin = role === 'admin' && (Boolean(firebaseUser) || adminAuthMode === 'password');
  if (!isAuthedAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  if (section !== 'dashboard' && !canAccessAdminSection(adminRole || undefined, section)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

function RequireStudent({ children }: { children: React.ReactNode }) {
  const { authReady, roleLoading, firebaseUser, role, studentAuthMode } = useAuth();

  if (!authReady || roleLoading) {
    return <PageLoadingSkeleton label="Verifying student enrollment..." />;
  }

  const isAuthenticatedStudent =
    role === 'student' && (Boolean(firebaseUser) || studentAuthMode === 'password');

  if (!isAuthenticatedStudent) {
    return <Navigate to="/student/login" replace />;
  }

  return <StudentLayout>{children}</StudentLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Gateway & Auth (3 Main Portals) */}
        <Route path="/" element={<PortalSelectPage />} />
        <Route path="/super-admin/login" element={<AdminLoginPage portalMode="super_admin" />} />
        <Route path="/admin/login" element={<AdminLoginPage portalMode="admin" />} />
        <Route path="/student/login" element={<StudentLoginPage />} />
        <Route path="/student/register" element={<StudentRegisterPage />} />
        <Route path="/student/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify" element={<VerifyCardPage />} />
        <Route path="/verify/:cardNumber" element={<VerifyCardPage />} />

        {/* Section 1: Protected Super Admin (Owner / Founder) Portal */}
        <Route
          path="/super-admin"
          element={
            <RequireSuperAdmin>
              <SuperAdminConsolePage />
            </RequireSuperAdmin>
          }
        />

        {/* Section 2: Protected Role-Based Admin Portal Routes */}
        <Route
          path="/admin/dashboard"
          element={
            <RequireAdmin section="dashboard">
              <AdminDashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/approvals"
          element={
            <RequireAdmin section="approvals">
              <AdminApprovalsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/students"
          element={
            <RequireAdmin section="students">
              <AdminStudentsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/batches"
          element={
            <RequireAdmin section="batches">
              <AdminBatchesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/students/id-cards"
          element={
            <RequireAdmin section="students">
              <AdminIdCardsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/memberships"
          element={
            <RequireAdmin section="memberships">
              <AdminMembershipsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/seats"
          element={
            <RequireAdmin section="seats">
              <AdminSeatMapPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/fees"
          element={
            <RequireAdmin section="fees">
              <AdminFeesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/expenses"
          element={
            <RequireAdmin section="expenses">
              <AdminExpensesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/attendance"
          element={
            <RequireAdmin section="attendance">
              <AdminAttendancePage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/notices"
          element={
            <RequireAdmin section="communication">
              <AdminNoticesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <RequireAdmin section="analytics">
              <AdminAnalyticsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/smart-door"
          element={
            <RequireAdmin section="smart-door">
              <AdminSmartDoorPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireAdmin section="settings">
              <AdminSettingsPage />
            </RequireAdmin>
          }
        />

        {/* Section 3: Protected Student Mobile Portal Routes */}
        <Route
          path="/student/home"
          element={
            <RequireStudent>
              <StudentHomePage />
            </RequireStudent>
          }
        />
        <Route
          path="/student/seat-request"
          element={
            <RequireStudent>
              <StudentSeatRequestPage />
            </RequireStudent>
          }
        />
        <Route
          path="/student/fees"
          element={
            <RequireStudent>
              <StudentFeesPage />
            </RequireStudent>
          }
        />
        <Route
          path="/student/attendance"
          element={
            <RequireStudent>
              <StudentAttendancePage />
            </RequireStudent>
          }
        />
        <Route
          path="/student/notices"
          element={
            <RequireStudent>
              <StudentNoticesPage />
            </RequireStudent>
          }
        />
        <Route
          path="/student/profile"
          element={
            <RequireStudent>
              <StudentProfilePage />
            </RequireStudent>
          }
        />

        {/* Fallback Redirects */}
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/student" element={<Navigate to="/student/home" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ScrollToTopButton />
    </BrowserRouter>
  );
}
