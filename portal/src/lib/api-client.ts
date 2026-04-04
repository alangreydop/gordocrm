export interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'client';
  name: string;
  company: string | null;
}

function resolveApiBase(): string {
  const configured =
    import.meta.env.PUBLIC_API_URL ?? import.meta.env.API_URL;

  if (configured) {
    return configured;
  }

  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8787';
  }

  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://127.0.0.1:8787';
  }

  return origin;
}

export const API_BASE = resolveApiBase();

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API error: ${res.status}`);
  }

  return res.json();
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const data = await api<{ user: SessionUser }>('/api/portal/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

export async function requireRole(
  role: 'admin' | 'client',
): Promise<SessionUser | null> {
  const user = await getSessionUser();

  if (!user) {
    window.location.href = '/login';
    return null;
  }

  if (user.role !== role) {
    window.location.href = user.role === 'admin' ? '/admin' : '/client';
    return null;
  }

  return user;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/portal/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => null);
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDate(value: unknown): string {
  if (!value) return '—';
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES');
}

export function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function jobStatusClass(status: string): string {
  return (
    {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      delivered: 'bg-purple-100 text-purple-800',
    }[status] ?? 'bg-gray-100 text-gray-600'
  );
}

export function subscriptionClass(status: string): string {
  return status === 'active'
    ? 'bg-green-100 text-green-800'
    : 'bg-gray-100 text-gray-600';
}
