import type { AstroCookies } from 'astro';

const API_BASE = import.meta.env.API_URL ?? 'http://localhost:3000';

export interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'client';
  name: string;
  company: string | null;
}

export async function getSessionUser(
  cookies: AstroCookies,
): Promise<SessionUser | null> {
  const sessionCookie = cookies.get('gg_session')?.value;
  if (!sessionCookie) return null;

  try {
    const res = await fetch(`${API_BASE}/api/portal/auth/me`, {
      headers: { Cookie: `gg_session=${sessionCookie}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}
