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
    window.location.href = user.role === 'admin' ? '/admin' : '/inicio';
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
  briefs: { id: string; email: string; tipo: string; status: string; clientId: string | null; clientName: string | null }[];
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
      pending: 'border border-amber-300/20 bg-amber-400/10 text-amber-100',
      processing: 'border border-sky-300/20 bg-sky-400/10 text-sky-100',
      completed: 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
      failed: 'border border-rose-300/20 bg-rose-400/10 text-rose-100',
      delivered: 'border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100',
    }[status] ?? 'border border-white/10 bg-white/5 text-slate-200'
  );
}

export function subscriptionClass(status: string): string {
  return (
    {
      active: 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
      cancelled: 'border border-rose-300/20 bg-rose-400/10 text-rose-100',
      inactive: 'border border-white/10 bg-white/5 text-slate-200',
    }[status] ?? 'border border-white/10 bg-white/5 text-slate-200'
  );
}

export function datasetStatusClass(status: string): string {
  return (
    {
      pending_capture: 'border border-amber-300/20 bg-amber-400/10 text-amber-100',
      captured: 'border border-sky-300/20 bg-sky-400/10 text-sky-100',
      trained: 'border border-indigo-300/20 bg-indigo-400/10 text-indigo-100',
      active: 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
      archived: 'border border-white/10 bg-white/5 text-slate-200',
    }[status] ?? 'border border-white/10 bg-white/5 text-slate-200'
  );
}

export function stackLaneClass(lane: string): string {
  return (
    {
      A: 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
      B: 'border border-sky-300/20 bg-sky-400/10 text-sky-100',
      C: 'border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100',
      D: 'border border-amber-300/20 bg-amber-400/10 text-amber-100',
    }[lane] ?? 'border border-white/10 bg-white/5 text-slate-200'
  );
}

export function qaStatusClass(status: string): string {
  return (
    {
      approved: 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
      rejected: 'border border-rose-300/20 bg-rose-400/10 text-rose-100',
      pending: 'border border-amber-300/20 bg-amber-400/10 text-amber-100',
    }[status] ?? 'border border-white/10 bg-white/5 text-slate-200'
  );
}

export function turnaroundClass(turnaround: string): string {
  return (
    {
      urgente: 'border border-rose-300/20 bg-rose-400/10 text-rose-100',
      normal: 'border border-white/10 bg-white/5 text-slate-200',
    }[turnaround] ?? 'border border-white/10 bg-white/5 text-slate-200'
  );
}
