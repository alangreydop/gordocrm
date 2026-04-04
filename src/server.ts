import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './lib/config.js';
import { authRoutes } from './api/routes/portal/auth.js';
import { clientRoutes } from './api/routes/portal/clients.js';
import { jobRoutes } from './api/routes/portal/jobs.js';
import { dashboardRoutes } from './api/routes/portal/dashboard.js';

const server = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

await server.register(cors, {
  origin: config.NODE_ENV === 'production' ? false : true,
});

// Routes are registered here as they are implemented
// await server.register(webhookRoutes, { prefix: '/webhooks' });
// await server.register(generationRoutes, { prefix: '/api/generations' });

// Portal CRM routes
await server.register(authRoutes, { prefix: '/api/portal/auth' });
await server.register(clientRoutes, { prefix: '/api/portal/clients' });
await server.register(jobRoutes, { prefix: '/api/portal/jobs' });
await server.register(dashboardRoutes, { prefix: '/api/portal/dashboard' });

server.get('/health', async () => ({ status: 'ok' }));

const address = await server.listen({ port: config.PORT, host: '0.0.0.0' });
server.log.info(`Server listening at ${address}`);
