import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const vault = new Hono<AppContext>();

vault.use('*', requireAuth);

const clients = schema.clients;
const jobs = schema.jobs;
const assets = schema.assets;

vault.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const userId = user.id;

  try {
    const userClient = await db
      .select({ clientId: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, userId))
      .limit(1);

    if (!userClient.length) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const clientId = userClient[0]?.clientId;
    if (!clientId) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const vaultAssets = await db
      .select({
        id: schema.assets.id,
        label: schema.assets.label,
        type: schema.assets.type,
        deliveryUrl: schema.assets.deliveryUrl,
        description: schema.assets.description,
        tags: schema.assets.tags,
        visualStyle: schema.assets.visualStyle,
        emotionalTone: schema.assets.emotionalTone,
        dominantColors: schema.assets.dominantColors,
        createdAt: schema.assets.createdAt,
        jobTitle: schema.jobs.briefText,
        sku: schema.assets.sku,
      })
      .from(schema.assets)
      .innerJoin(schema.jobs, eq(schema.assets.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.clientId, clientId),
          eq(schema.assets.status, 'approved'),
          eq(schema.assets.clientVisible, true),
        ),
      )
      .orderBy(desc(schema.assets.createdAt));

    // Group by SKU
    const groups = new Map<string, typeof vaultAssets>();
    const ungrouped: typeof vaultAssets = [];
    for (const asset of vaultAssets) {
      const key = asset.sku?.trim() || '';
      if (!key) {
        ungrouped.push(asset);
      } else {
        const existing = groups.get(key);
        if (existing) {
          existing.push(asset);
        } else {
          groups.set(key, [asset]);
        }
      }
    }

    const skuGroups = Array.from(groups.entries()).map(([sku, assets]) => ({
      sku,
      label: assets[0]?.label ? assets[0].label.split('_')[0] : sku,
      assets,
    }));

    return c.json({ assets: vaultAssets, total: vaultAssets.length, groups: skuGroups, ungrouped });
  } catch (error) {
    console.error('[Vault] Error fetching assets:', error);
    return c.json({ error: 'Failed to fetch vault assets' }, 500);
  }
});

vault.get('/search', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const userId = user.id;
  const q = c.req.query('q');
  const style = c.req.query('style');
  const tone = c.req.query('tone');
  const type = c.req.query('type');

  try {
    const userClient = await db
      .select({ clientId: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, userId))
      .limit(1);

    if (!userClient.length) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const clientId = userClient[0]?.clientId;
    if (!clientId) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const results = await db
      .select({
        id: schema.assets.id,
        label: schema.assets.label,
        type: schema.assets.type,
        deliveryUrl: schema.assets.deliveryUrl,
        description: schema.assets.description,
        tags: schema.assets.tags,
        visualStyle: schema.assets.visualStyle,
        emotionalTone: schema.assets.emotionalTone,
        dominantColors: schema.assets.dominantColors,
        createdAt: schema.assets.createdAt,
        jobTitle: schema.jobs.briefText,
      })
      .from(schema.assets)
      .innerJoin(schema.jobs, eq(schema.assets.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.clientId, clientId),
          eq(schema.assets.status, 'approved'),
          eq(schema.assets.clientVisible, true),
        ),
      )
      .orderBy(desc(schema.assets.createdAt));

    const filtered = results.filter((asset) => {
      if (q) {
        const searchStr = `${asset.label} ${asset.description} ${asset.tags}`.toLowerCase();
        if (!searchStr.includes(q.toLowerCase())) return false;
      }
      if (style && asset.visualStyle !== style) return false;
      if (tone && asset.emotionalTone !== tone) return false;
      if (type && asset.type !== type) return false;
      return true;
    });

    return c.json({ assets: filtered, total: filtered.length });
  } catch (error) {
    console.error('[Vault] Error searching assets:', error);
    return c.json({ error: 'Failed to search vault' }, 500);
  }
});

vault.get('/styles', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const userId = user.id;

  try {
    const userClient = await db
      .select({ clientId: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, userId))
      .limit(1);

    if (!userClient.length) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const clientId = userClient[0]?.clientId;
    if (!clientId) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const styles = await db
      .select({ visualStyle: schema.assets.visualStyle })
      .from(schema.assets)
      .innerJoin(schema.jobs, eq(schema.assets.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.clientId, clientId),
          eq(schema.assets.status, 'approved'),
          eq(schema.assets.clientVisible, true),
        ),
      )
      .groupBy(schema.assets.visualStyle);

    return c.json({ styles: styles.map((s) => s.visualStyle).filter(Boolean) });
  } catch (error) {
    console.error('[Vault] Error fetching styles:', error);
    return c.json({ error: 'Failed to fetch styles' }, 500);
  }
});

vault.get('/tones', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const userId = user.id;

  try {
    const userClient = await db
      .select({ clientId: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, userId))
      .limit(1);

    if (!userClient.length) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const clientId = userClient[0]?.clientId;
    if (!clientId) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const tones = await db
      .select({ emotionalTone: schema.assets.emotionalTone })
      .from(schema.assets)
      .innerJoin(schema.jobs, eq(schema.assets.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.clientId, clientId),
          eq(schema.assets.status, 'approved'),
          eq(schema.assets.clientVisible, true),
        ),
      )
      .groupBy(schema.assets.emotionalTone);

    return c.json({ tones: tones.map((t) => t.emotionalTone).filter(Boolean) });
  } catch (error) {
    console.error('[Vault] Error fetching tones:', error);
    return c.json({ error: 'Failed to fetch tones' }, 500);
  }
});

export { vault as vaultRoutes };
