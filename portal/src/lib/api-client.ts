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
  onboardingCompletedAt: string | number | Date | null;
  firstSessionAt: string | number | Date | null;
}

export interface SessionContext {
  user: SessionUser;
  client: SessionClient | null;
}

function resolveApiBase(): string {
  const configured =
    import.meta.env.PUBLIC_API_URL ?? import.meta.env.API_URL;

  if (typeof window === 'undefined') {
    return configured ?? 'http://127.0.0.1:8787';
  }

  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return configured ?? 'http://127.0.0.1:8787';
  }

  if (hostname === 'crm.grandeandgordo.com') {
    return origin;
  }

  return configured ?? origin;
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

export interface SafeResult<T> {
  data: T | null;
  error: string | null;
}

export async function apiSafe<T>(path: string, options: RequestInit = {}): Promise<SafeResult<T>> {
  try {
    const data = await api<T>(path, options);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Error desconocido' };
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
  briefs: { id: string; email: string; tipo: string; status: string; clientId: string | null; clientName: string | null }[];
  invoices: { id: string; invoiceNumber: string; clientLegalName: string; status: string; totalCents: number }[];
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

// ── Brief, Job & Upload Types ──

export interface BriefData {
  contentType?: string;
  objective?: string;
  usageContext?: string;
  style?: string;
  audience?: string;
  cta?: string;
  description?: string;
  brandId?: string;
  sku?: string;
  aspectRatio?: string;
  modality?: string;
  productImageUrls?: string[];
}

export interface BriefResponse {
  ok: boolean;
  briefId: string | null;
  message?: string;
}

export interface JobResponse {
  ok: boolean;
  job: {
    id: string;
    clientId: string;
    status: string;
    briefText: string | null;
    type: string | null;
    turnaround: string | null;
    createdAt: string;
  };
  brief?: {
    id: string;
    status: string;
    clientId: string;
    clientName: string | null;
  };
}

export interface UploadResponse {
  asset: {
    id: string;
    jobId: string;
    clientId: string;
    label: string;
    type: string;
    r2Key: string;
    deliveryUrl: string;
    fileSize: number;
    status: string;
    sku: string | null;
    category: string | null;
    createdAt: string;
    updatedAt: string;
  };
  deliveryUrl: string;
  storagePath: string;
  category: string;
  limits: {
    filesUsed: number;
    filesMax: number;
    storageUsed: number;
    storageMax: number;
  };
}

export interface BrandAsset {
  id: string;
  jobId: string;
  label: string;
  type: string;
  deliveryUrl: string;
  status: string;
  sku: string | null;
  category: string | null;
  createdAt: string;
}

export interface BrandAssetsResponse {
  assets: BrandAsset[];
}

// ── Brief ──

export async function createBrief(data: BriefData): Promise<BriefResponse> {
  return api<BriefResponse>('/api/portal/brief/assistant/submit', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Job from Brief ──

export async function createJobFromBrief(briefId: string): Promise<JobResponse> {
  return api<JobResponse>(`/api/portal/briefs/${briefId}/create-job`, {
    method: 'POST',
  });
}

// ── File Upload ──

export async function uploadFile(
  jobId: string,
  file: File,
  options: {
    sku: string;
    category: 'inputs' | 'assets';
    asset_type?: 'logo' | 'typography' | 'font_file' | 'palette' | 'identity_manual' | 'iconography' | 'other';
  },
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', options.category);
  formData.append('sku', options.sku);
  if (options.asset_type) {
    formData.append('asset_type', options.asset_type);
  }

  const res = await fetch(`${API_BASE}/api/portal/upload/jobs/${jobId}/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload error: ${res.status}`);
  }

  return res.json();
}
 
// ── Temporary Upload (pre-brief, no job required) ──

export async function uploadTempFile(file: File): Promise<{ deliveryUrl: string; storagePath: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/portal/upload/temp`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload error: ${res.status}`);
  }

  return res.json();
}

// ── Brand Asset Upload (job-independent) ──

export async function uploadBrandAsset(
  file: File,
  options: {
    assetType: 'logo' | 'typography' | 'font_file' | 'palette' | 'identity_manual' | 'iconography' | 'other';
    sku?: string;
  },
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('asset_type', options.assetType);
  if (options.sku) {
    formData.append('sku', options.sku);
  }

  const res = await fetch(`${API_BASE}/api/portal/upload/brand-assets`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload error: ${res.status}`);
  }

  return res.json();
}

// ── Brand Assets ──

export async function getBrandAssets(): Promise<BrandAssetsResponse> {
  const data = await api<{ assets: BrandAsset[] }>('/api/portal/assets');
  const brandAssets = data.assets.filter(
    (a) => a.category === 'assets',
  );
  return { assets: brandAssets };
}

// ── Upload Quota ──

export interface UploadQuota {
  clientId: string;
  filesUsed: number;
  filesMax: number;
  storageUsed: number;
  storageMax: number;
  storageRemaining: number;
}

export async function getUploadQuota(): Promise<UploadQuota> {
  return api<UploadQuota>('/api/portal/upload/quota');
}
