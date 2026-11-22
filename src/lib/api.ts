import { auth } from './firebase';
import { getAdminSessionToken } from './adminSessionToken';
import type { BackendSessionInfo, SystemHealthResponse } from '../types/domain';

async function getBearerHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  const adminToken = getAdminSessionToken();
  if (adminToken) {
    return {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    };
  }

  throw new Error('User is not authenticated.');
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { requireAuth?: boolean } = {},
): Promise<T> {
  const { requireAuth = true, headers, ...rest } = options;
  const authHeaders = requireAuth ? await getBearerHeaders() : { 'Content-Type': 'application/json' };

  const response = await fetch(path, {
    ...rest,
    headers: {
      ...authHeaders,
      ...(headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Fallback to HTTP status message
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function fetchSystemHealth(): Promise<SystemHealthResponse> {
  return apiRequest<SystemHealthResponse>('/api/health', { requireAuth: false });
}

export function verifyBackendSession(): Promise<BackendSessionInfo> {
  return apiRequest<BackendSessionInfo>('/api/auth/session', { requireAuth: true });
}
