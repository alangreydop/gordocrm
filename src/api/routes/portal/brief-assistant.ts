import { and, desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const { briefSubmissions } = schema;

const assistant = new Hono<AppContext>();
assistant.use('*', requireAuth);

const briefFormSchema = z.object({
  contentType: z.enum(['foto', 'video', 'ambos']).default('ambos'),
  objective: z.string().trim().max(500).default(''),
  usageContext: z.string().trim().max(500).default(''),
  style: z.string().trim().max(600).default(''),
  audience: z.string().trim().max(300).default(''),
  cta: z.string().trim().max(300).default(''),
  description: z.string().trim().max(2000).default(''),
  brandId: z.string().trim().max(128).default(''),
  sku: z.string().trim().max(256).default(''),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:5', '3:4']).default('1:1'),
  modality: z.enum(['image', 'video']).default('image'),
  productImageUrls: z.array(z.string().url()).max(10).default([]),
});

const BRIEFING_STAGES = ['OBJECTIVE', 'HOOK', 'STYLE', 'AUDIENCE', 'CTA'] as const;
type BriefingStage = typeof BRIEFING_STAGES[number];

const STAGE_PROMPTS: Record<BriefingStage, string> = {
  OBJECTIVE:
    '¡Hola! Vamos a conceptualizar tu próximo contenido. Para empezar, ¿cuál es el objetivo principal de este video? (Ej: Ventas, Awareness, Tutorial, Branding)',
  HOOK:
    "Entendido. Ahora, hablemos del 'Hook'. ¿Tienes alguna idea para los primeros 3 segundos que detengan el scroll, o prefieres que te sugiera algunas opciones basadas en tu objetivo?",
  STYLE:
    'Perfecto. En cuanto al estilo visual: ¿Buscas algo más cinematográfico, dinámico con muchos cortes (estilo Alex Hormozi), o algo más natural y orgánico?',
  AUDIENCE:
    'Tomo nota. ¿A quién nos dirigimos exactamente? Describe a tu cliente ideal o el segmento que queremos impactar.',
  CTA:
    'Por último, el Call to Action. ¿Qué quieres que haga la gente al terminar el video? (Ej: Ir al link de la bio, enviar un DM, comentar una palabra clave)',
};

interface HistoryItem {
  stage: BriefingStage;
  answer: string;
}

function extractAnswer(_stage: BriefingStage, message: string): string {
  return message.trim();
}

function generateOptimizedBrief(answers: Record<string, string>): string {
  return JSON.stringify({
    objective: answers.objective || '',
    hook: answers.hook || '',
    style: answers.style || '',
    audience: answers.audience || '',
    cta: answers.cta || '',
    generatedAt: new Date().toISOString(),
    summary: `**Objetivo:** ${answers.objective}\n\n**Hook:** ${answers.hook}\n\n**Estilo:** ${answers.style}\n\n**Audiencia:** ${answers.audience}\n\n**CTA:** ${answers.cta}`,
  });
}

function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const stage = 'stage' in item ? String(item.stage).toUpperCase() : '';
    const answer = 'answer' in item ? String(item.answer ?? '').trim() : '';

    if (!BRIEFING_STAGES.includes(stage as BriefingStage) || !answer) {
      return [];
    }

    return [{ stage: stage as BriefingStage, answer }];
  });
}

async function resolveClientContext(c: Context<AppContext>) {
  const user = c.get('user');

  if (user.role !== 'client') {
    return {
      client: null,
      user: null,
      response: c.json({ error: 'Client access only' }, 403),
    };
  }

  const db = c.get('db');
  const [client] = await db
    .select({
      id: schema.clients.id,
      email: schema.clients.email,
    })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!client) {
    return {
      client: null,
      user: null,
      response: c.json({ error: 'Client record not found' }, 404),
    };
  }

  return { client, user, response: null };
}

function buildStructuredBriefSummary(input: z.infer<typeof briefFormSchema>) {
  return [
    input.objective ? `Objetivo: ${input.objective}` : null,
    input.usageContext ? `Canal / uso: ${input.usageContext}` : null,
    input.style ? `Referencias y tono: ${input.style}` : null,
    input.audience ? `Audiencia: ${input.audience}` : null,
    input.cta ? `CTA: ${input.cta}` : null,
    input.description ? `Notas operativas: ${input.description}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

assistant.post('/submit', async (c) => {
  const { client, user, response } = await resolveClientContext(c);
  if (response || !client || !user) {
    return response;
  }

  const payload: unknown = await c.req.json().catch(() => null);
  const body = briefFormSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid brief payload', details: body.error.issues }, 400);
  }

  const hasMeaningfulContent = [
    body.data.objective,
    body.data.usageContext,
    body.data.style,
    body.data.audience,
    body.data.cta,
    body.data.description,
  ].some((value) => value.trim().length > 0);

  if (!hasMeaningfulContent) {
    return c.json({ error: 'Add at least one brief detail before saving' }, 400);
  }

  const db = c.get('db');
  const summary = buildStructuredBriefSummary(body.data);
  const optimizedBrief = JSON.stringify({
    mode: 'structured-form',
    contentType: body.data.contentType,
    objective: body.data.objective,
    usageContext: body.data.usageContext,
    style: body.data.style,
    audience: body.data.audience,
    cta: body.data.cta,
    description: body.data.description,
    brandId: body.data.brandId,
    sku: body.data.sku,
    aspectRatio: body.data.aspectRatio,
    modality: body.data.modality,
    productImageUrls: body.data.productImageUrls,
    generatedAt: new Date().toISOString(),
  });

  try {
    const [inserted] = await db
      .insert(briefSubmissions)
      .values({
        clientId: client.id,
        email: user.email,
        contentType: body.data.contentType,
        description: summary || body.data.description || 'Brief estructurado recibido desde el portal.',
        objective: body.data.objective || null,
        hook: body.data.usageContext || null,
        style: body.data.style || null,
        audience: body.data.audience || null,
        cta: body.data.cta || null,
        optimizedBrief,
        chatHistory: null,
        status: 'new',
        source: 'client-portal-form',
        sourcePage: '/client/new-brief',
        createdAt: new Date(),
       updatedAt: new Date(),
     })
     .returning({ id: briefSubmissions.id });

    // Log client activity for new brief
    try {
      await db.insert(schema.clientActivities).values({
        id: crypto.randomUUID(),
        clientId: client.id,
        type: 'brief_submitted',
        content: `Brief recibido: ${summary ? summary.slice(0, 80) : 'Brief estructurado desde portal'}`,
        metadata: JSON.stringify({ briefId: inserted?.id, source: 'client-portal-form' }),
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('[BriefAssistant] Failed to log activity:', e);
    }

    return c.json({
      ok: true,
      briefId: inserted?.id ?? null,
      message: 'Brief guardado en tu cuenta. El equipo ya tiene el contexto actualizado.',
    });
  } catch (error) {
    console.error('[BriefAssistant] Error saving structured brief:', error);
    return c.json({ error: 'Failed to save brief' }, 500);
  }
});

assistant.post('/chat', async (c) => {
  const { client, user, response } = await resolveClientContext(c);
  if (response || !client || !user) {
    return response;
  }

  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const history = normalizeHistory(body.history);
  const currentStage = BRIEFING_STAGES[history.length];
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!currentStage) {
    return c.json({
      message: 'El brief ya está completo.',
      stage: 'COMPLETE',
      isComplete: true,
    });
  }

  if (!message) {
    return c.json({
      message: STAGE_PROMPTS[currentStage],
      stage: currentStage,
      isComplete: false,
    });
  }

  const fullHistory = [
    ...history,
    {
      stage: currentStage,
      answer: extractAnswer(currentStage, message),
    },
  ];

  const answers = fullHistory.reduce<Record<string, string>>((acc, item) => {
    acc[item.stage.toLowerCase()] = item.answer;
    return acc;
  }, {});

  if (fullHistory.length >= BRIEFING_STAGES.length) {
    const optimizedBrief = generateOptimizedBrief(answers);
    const summary = [
      answers.objective,
      answers.hook,
      answers.style,
      answers.audience,
      answers.cta,
    ]
      .filter(Boolean)
      .join(' · ');

    try {
      const [inserted] = await db
        .insert(briefSubmissions)
        .values({
          clientId: client.id,
          email: user.email,
          description: summary || 'Brief conversacional recibido desde el portal.',
          objective: answers.objective || null,
          hook: answers.hook || null,
          style: answers.style || null,
          audience: answers.audience || null,
          cta: answers.cta || null,
          optimizedBrief,
          chatHistory: JSON.stringify(fullHistory),
          status: 'new',
          source: 'ai-assistant',
          sourcePage: '/client/new-brief',
          createdAt: new Date(),
         updatedAt: new Date(),
       })
       .returning({ id: briefSubmissions.id });

      // Log client activity for chat brief
      try {
        await db.insert(schema.clientActivities).values({
          id: crypto.randomUUID(),
          clientId: client.id,
          type: 'brief_submitted',
          content: `Brief conversacional recibido: ${summary ? summary.slice(0, 80) : 'Brief desde asistente'}`,
          metadata: JSON.stringify({ briefId: inserted?.id, source: 'ai-assistant' }),
          createdAt: new Date(),
        });
      } catch (e) {
        console.error('[BriefAssistant] Failed to log activity:', e);
      }

      return c.json({
        message:
          'Brief guardado en tu cuenta. El equipo ya tiene el contexto actualizado para el siguiente trabajo.',
        stage: 'COMPLETE',
        isComplete: true,
        briefId: inserted?.id ?? null,
      });
    } catch (error) {
      console.error('[BriefAssistant] Error saving brief:', error);
      return c.json({ error: 'Failed to save brief' }, 500);
    }
  }

  const nextStage = BRIEFING_STAGES[fullHistory.length];
  if (!nextStage) {
    return c.json({ error: 'Invalid assistant state' }, 500);
  }

  return c.json({
    message: STAGE_PROMPTS[nextStage],
    stage: nextStage,
    isComplete: false,
  });
});

assistant.get('/briefs/:clientId', async (c) => {
  const { client, response } = await resolveClientContext(c);
  if (response || !client) {
    return response;
  }

  const { clientId } = c.req.param();
  if (clientId !== client.id) {
    return c.json({ error: 'Client access only' }, 403);
  }

  try {
    const db = c.get('db');
    const briefs = await db
      .select()
      .from(briefSubmissions)
      .where(eq(briefSubmissions.clientId, client.id))
      .orderBy(desc(briefSubmissions.createdAt));

    return c.json({ briefs });
  } catch (error) {
    console.error('[BriefAssistant] Error fetching briefs:', error);
    return c.json({ error: 'Failed to fetch briefs' }, 500);
  }
});

assistant.get('/briefs/:clientId/:id', async (c) => {
  const { client, response } = await resolveClientContext(c);
  if (response || !client) {
    return response;
  }

  const { clientId, id } = c.req.param();
  if (clientId !== client.id) {
    return c.json({ error: 'Client access only' }, 403);
  }

  try {
    const db = c.get('db');
    const [brief] = await db
      .select()
      .from(briefSubmissions)
      .where(and(eq(briefSubmissions.id, id), eq(briefSubmissions.clientId, client.id)))
      .limit(1);

    if (!brief) {
      return c.json({ error: 'Brief not found' }, 404);
    }

    return c.json({ brief });
  } catch (error) {
    console.error('[BriefAssistant] Error fetching brief:', error);
    return c.json({ error: 'Failed to fetch brief' }, 500);
  }
});

export { assistant as assistantRoutes };
