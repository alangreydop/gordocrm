import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { publicBriefRoutes } from '../../src/api/routes/public/briefs';

describe('public brief intake boundary', () => {
  it('returns 410 because public brief intake is closed', async () => {
    const app = new Hono();
    app.route('/api/public/briefs', publicBriefRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/public/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'client@example.com',
          tipo: 'video',
          descripcion: 'Necesito nuevas piezas',
        }),
      }),
    );

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: 'Public brief intake is disabled',
      message:
        'Brief intake now starts from a won handoff or an authenticated client session inside the portal.',
    });
  });
});
