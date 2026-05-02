/**
 * AI Engine Proxy Routes
 *
 * Proxy unificado para comunicar con AI Engine desde el CRM.
 * Forward del JWT del CRM para auth unificada.
 */

import { Hono, MiddlewareHandler } from 'hono';
import type { AppContext } from '../../types/index.js';
import { requireAuth } from '../../lib/auth.js';

export const aiProxyRoutes = new Hono<AppContext>();

// Middleware para añadir JWT del CRM al proxy
aiProxyRoutes.use('*', requireAuth);
aiProxyRoutes.use('*', async (c, next) => {
  const user = c.get('user');
  const aiEngineBase = resolveAIEngineBase(c.env);
  const aiEngineJwtSecret = c.env.AI_ENGINE_JWT_SECRET ?? (c.env.APP_ENV === 'production' ? undefined : 'local-ai-engine-secret');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (!aiEngineBase) {
    return c.json({ error: 'AI_ENGINE_URL is not configured' }, 503);
  }

  if (!aiEngineJwtSecret) {
    return c.json({ error: 'AI_ENGINE_JWT_SECRET is not configured' }, 503);
  }

  // Crear JWT para AI Engine con datos del usuario CRM
  const jwt = await createAIEngineJWT(user, aiEngineJwtSecret);

  // Guardar en contexto para usar en las requests
  c.set('aiEngineToken', jwt);
  c.set('aiEngineBase', aiEngineBase);

  return next();
});

// Helper para crear JWT compatible con AI Engine
async function createAIEngineJWT(user: {
  id: string;
  email: string;
  role: string;
}, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
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

  const base64Url = (data: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(data)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = base64Url(encoder.encode(JSON.stringify(payload)));
  const signatureB64 = base64Url(signature);

  return `${header}.${payloadB64}.${signatureB64}`;
}

function resolveAIEngineBase(env: AppContext['Bindings']): string | undefined {
  if (!env.AI_ENGINE_URL) {
    return env.APP_ENV === 'production' ? undefined : 'http://localhost:8000/api/v1';
  }

  const trimmed = env.AI_ENGINE_URL.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

// Admin-only gate for mutation routes
const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403);
  return next();
};

// Proxy para pipelines
aiProxyRoutes.get('/pipelines', requireAuth, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const aiEngineBase = c.get('aiEngineBase') as string;
  const res = await fetch(`${aiEngineBase}/pipelines`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});

aiProxyRoutes.post('/pipelines', requireAuth, requireAdmin, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const aiEngineBase = c.get('aiEngineBase') as string;
  const body = await c.req.json();

  const res = await fetch(`${aiEngineBase}/pipelines`, {
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
  const aiEngineBase = c.get('aiEngineBase') as string;
  const id = c.req.param('id');

  const res = await fetch(`${aiEngineBase}/pipelines/${id}`, {
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
  const aiEngineBase = c.get('aiEngineBase') as string;
  const status = c.req.query('status');

  const url = new URL(`${aiEngineBase}/jobs`);
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

aiProxyRoutes.post('/jobs', requireAuth, requireAdmin, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const aiEngineBase = c.get('aiEngineBase') as string;
  const body = await c.req.json();

  const res = await fetch(`${aiEngineBase}/jobs`, {
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
  const aiEngineBase = c.get('aiEngineBase') as string;
  const id = c.req.param('id');

  const res = await fetch(`${aiEngineBase}/jobs/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});

// Proxy para approvals
aiProxyRoutes.post('/approvals/:id/decide', requireAuth, requireAdmin, async (c) => {
  const token = c.get('aiEngineToken') as string;
  const aiEngineBase = c.get('aiEngineBase') as string;
  const id = c.req.param('id');
  const body = await c.req.json();

  const res = await fetch(`${aiEngineBase}/approvals/${id}/decide`, {
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
  const aiEngineBase = c.get('aiEngineBase') as string;

  const res = await fetch(`${aiEngineBase}/nodes`, {
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
  const aiEngineBase = c.get('aiEngineBase') as string;
  const category = c.req.param('category');

  const res = await fetch(`${aiEngineBase}/nodes/categories/${category}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return c.json(data);
});
