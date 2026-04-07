/**
 * AI Engine Proxy Routes
 *
 * Proxy unificado para comunicar con AI Engine desde el CRM.
 * Forward del JWT del CRM para auth unificada.
 */

import { Hono } from 'hono';
import type { AppContext } from '../../types/index.js';
import { requireAuth } from '../../lib/auth.js';

const AI_ENGINE_BASE = 'http://localhost:8000/api/v1';

export const aiProxyRoutes = new Hono<AppContext>();

// Middleware para añadir JWT del CRM al proxy
aiProxyRoutes.use('*', async (c, next) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Crear JWT para AI Engine con datos del usuario CRM
  const jwt = await createAIFngineJWT(user);

  // Guardar en contexto para usar en las requests
  c.set('aiEngineToken', jwt);

  await next();
});

// Helper para crear JWT compatible con AI Engine
async function createAIFngineJWT(user: {
  id: string;
  email: string;
  role: string;
}): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    'raw',
    encoder.encode('gordo-ai-engine-secret-key-2026'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hora
  };

  const signature = await crypto.subtle.sign(
    'HMAC',
    keyData,
    encoder.encode(JSON.stringify(payload)),
  );

  const base64Url = (data: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(data)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = base64Url(encoder.encode(JSON.stringify(payload)));
  const signatureB64 = base64Url(signature);

  return `${header}.${payloadB64}.${signatureB64}`;
}

// Proxy para pipelines
aiProxyRoutes.get('/pipelines', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const res = await fetch(`${AI_ENGINE_BASE}/pipelines`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});

aiProxyRoutes.post('/pipelines', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const body = await c.req.json();

  const res = await fetch(`${AI_ENGINE_BASE}/pipelines`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return c.json(data);
});

aiProxyRoutes.get('/pipelines/:id', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const id = c.req.param('id');

  const res = await fetch(`${AI_ENGINE_BASE}/pipelines/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});

// Proxy para jobs
aiProxyRoutes.get('/jobs', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const status = c.req.query('status');

  const url = new URL(`${AI_ENGINE_BASE}/jobs`);
  if (status) url.searchParams.set('status', status);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});

aiProxyRoutes.post('/jobs', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const body = await c.req.json();

  const res = await fetch(`${AI_ENGINE_BASE}/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return c.json(data);
});

aiProxyRoutes.get('/jobs/:id', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const id = c.req.param('id');

  const res = await fetch(`${AI_ENGINE_BASE}/jobs/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});

// Proxy para approvals
aiProxyRoutes.post('/approvals/:id/decide', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const id = c.req.param('id');
  const body = await c.req.json();

  const res = await fetch(`${AI_ENGINE_BASE}/approvals/${id}/decide`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return c.json(data);
});

// Proxy para nodes
aiProxyRoutes.get('/nodes', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;

  const res = await fetch(`${AI_ENGINE_BASE}/nodes`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});

aiProxyRoutes.get('/nodes/categories/:category', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const category = c.req.param('category');

  const res = await fetch(`${AI_ENGINE_BASE}/nodes/categories/${category}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});
