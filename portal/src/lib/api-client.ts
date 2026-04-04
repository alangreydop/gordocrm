const API_BASE = import.meta.env.API_URL ?? 'http://localhost:3000';

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

export function apiWithCookie<T>(cookie: string) {
  return (path: string, options: RequestInit = {}) =>
    api<T>(path, {
      ...options,
      headers: { Cookie: cookie, ...options.headers },
    });
}
