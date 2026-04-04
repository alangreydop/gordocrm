export interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'client';
  name: string;
  company: string | null;
}

export interface SessionClient {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  company: string | null;
  accountManager?: string | null;
  subscriptionStatus: string;
  plan: string | null;
  monthlyUnitCapacity: number | null;
  datasetStatus: string;
  segment: string | null;
  marginProfile: string | null;
  notes: string | null;
  nextReviewAt: string | number | Date | null;
  lastContactedAt: string | number | Date | null;
}

export interface SessionContext {
  user: SessionUser;
  client: SessionClient | null;
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

export async function getSessionContext(): Promise<SessionContext | null> {
  try {
    return await api<SessionContext>('/api/portal/auth/me');
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

export interface SearchResult {
  clients: { id: string; name: string; company: string | null; email: string }[];
  jobs: { id: string; briefText: string | null; status: string; clientId: string; clientName: string }[];
}

export async function search(q: string): Promise<SearchResult> {
  return api<SearchResult>(`/api/portal/search?q=${encodeURIComponent(q)}`);
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

export function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatCurrency(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('es-ES').format(amount);
}

export function formatPercent(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${amount.toFixed(1)}%`;
}

export function dateInputValue(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return '';
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function numberInputValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : '';
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
  return (
    {
      active: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      inactive: 'bg-gray-100 text-gray-600',
    }[status] ?? 'bg-gray-100 text-gray-600'
  );
}

export function datasetStatusClass(status: string): string {
  return (
    {
      pending_capture: 'bg-orange-100 text-orange-800',
      captured: 'bg-sky-100 text-sky-800',
      trained: 'bg-indigo-100 text-indigo-800',
      active: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-600',
    }[status] ?? 'bg-gray-100 text-gray-600'
  );
}

export function stackLaneClass(lane: string): string {
  return (
    {
      A: 'bg-emerald-100 text-emerald-800',
      B: 'bg-blue-100 text-blue-800',
      C: 'bg-fuchsia-100 text-fuchsia-800',
      D: 'bg-amber-100 text-amber-900',
    }[lane] ?? 'bg-gray-100 text-gray-600'
  );
}

export function qaStatusClass(status: string): string {
  return (
    {
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      pending: 'bg-amber-100 text-amber-900',
    }[status] ?? 'bg-gray-100 text-gray-600'
  );
}

export function turnaroundClass(turnaround: string): string {
  return (
    {
      urgente: 'bg-red-100 text-red-800',
      normal: 'bg-gray-100 text-gray-600',
    }[turnaround] ?? 'bg-gray-100 text-gray-600'
  );
}
