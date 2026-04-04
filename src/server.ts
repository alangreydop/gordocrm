import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from '../db/index.js';
import { authRoutes } from './api/routes/portal/auth.js';
import { clientRoutes } from './api/routes/portal/clients.js';
import { dashboardRoutes } from './api/routes/portal/dashboard.js';
import { jobRoutes } from './api/routes/portal/jobs.js';
import { getAllowedOrigins, getConfig } from './lib/config.js';
import type { AppContext } from './types/index.js';

const app = new Hono<AppContext>();

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Internal server error' }, 500);
});

app.use('*', async (c, next) => {
  c.set('db', getDb(c.env));
  await next();
});

app.use(
  '/api/*',
  cors({
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    origin: (origin, c) => {
      if (!origin) return undefined;
      const allowedOrigins = getAllowedOrigins(c.env);
      return allowedOrigins.includes(origin) ? origin : undefined;
    },
  }),
);

app.get('/health', (c) => {
  const config = getConfig(c.env);
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    database: 'd1',
    environment: config.APP_ENV,
  });
});

app.route('/api/portal/auth', authRoutes);
app.route('/api/portal/clients', clientRoutes);
app.route('/api/portal/jobs', jobRoutes);
app.route('/api/portal/dashboard', dashboardRoutes);

export default app;
