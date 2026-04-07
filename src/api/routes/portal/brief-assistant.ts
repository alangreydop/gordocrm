import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { schema } from '../../../../db/index.js';
const { briefSubmissions } = schema;
import type { AppContext } from '../../../types/index.js';

const assistant = new Hono<AppContext>();

const BRIEFING_STAGES = {
  OBJECTIVE: 'OBJECTIVE',
  HOOK: 'HOOK',
  STYLE: 'STYLE',
  AUDIENCE: 'AUDIENCE',
  CTA: 'CTA',
  FINALIZING: 'FINALIZING',
};

const STAGE_PROMPTS = {
  [BRIEFING_STAGES.OBJECTIVE]:
    '¡Hola! Vamos a conceptualizar tu próximo contenido. Para empezar, ¿cuál es el objetivo principal de este video? (Ej: Ventas, Awareness, Tutorial, Branding)',
  [BRIEFING_STAGES.HOOK]:
    "Entendido. Ahora, hablemos del 'Hook'. ¿Tienes alguna idea para los primeros 3 segundos que detengan el scroll, o prefieres que te sugiera algunas opciones basadas en tu objetivo?",
  [BRIEFING_STAGES.STYLE]:
    'Perfecto. En cuanto al estilo visual: ¿Buscas algo más cinematográfico, dinámico con muchos cortes (estilo Alex Hormozi), o algo más natural y orgánico?',
  [BRIEFING_STAGES.AUDIENCE]:
    'Tomo nota. ¿A quién nos dirigimos exactamente? Describe a tu cliente ideal o el segmento que queremos impactar.',
  [BRIEFING_STAGES.CTA]:
    'Por último, el Call to Action. ¿Qué quieres que haga la gente al terminar el video? (Ej: Ir al link de la bio, enviar un DM, comentar una palabra clave)',
};

function extractAnswer(stage: string, message: string): string {
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

assistant.post('/chat', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const { message, history, clientId, sessionKey } = body;

  const currentStage =
    history.length === 0
      ? BRIEFING_STAGES.OBJECTIVE
      : history.length === 1
        ? BRIEFING_STAGES.HOOK
        : history.length === 2
          ? BRIEFING_STAGES.STYLE
          : history.length === 3
            ? BRIEFING_STAGES.AUDIENCE
            : history.length === 4
              ? BRIEFING_STAGES.CTA
              : BRIEFING_STAGES.FINALIZING;

  const answers: Record<string, string> = {};
  history.forEach((item: { stage: string; answer: string }, idx: number) => {
    const stageKey = item.stage.toLowerCase();
    answers[stageKey] = item.answer;
  });

  let response = '';
  let nextStage = currentStage;
  let briefData: Partial<typeof briefSubmissions.$inferInsert> | null = null;

  if (currentStage === BRIEFING_STAGES.FINALIZING) {
    const optimizedBrief = generateOptimizedBrief(answers);
    const chatHistory = JSON.stringify(
      history.map((h: { stage: string; answer: string }) => ({
        stage: h.stage,
        answer: h.answer,
      })),
    );

    briefData = {
      clientId: clientId || null,
      email: body.userEmail || 'unknown@example.com',
      objective: answers.objective,
      hook: answers.hook,
      style: answers.style,
      audience: answers.audience,
      cta: answers.cta,
      optimizedBrief,
      chatHistory,
      status: 'in_progress',
      source: 'ai-assistant',
    };

    try {
      const inserted = await db.insert(briefSubmissions).values(briefData).returning();
      briefData = { id: inserted[0].id };

      response =
        '¡Brief generado y guardado! Tu brief técnico ha sido optimizado y enviado al equipo de producción. Te contactaremos pronto con los siguientes pasos.';
    } catch (error) {
      console.error('[BriefAssistant] Error saving brief:', error);
      response =
        'He generado tu brief, pero hubo un error al guardarlo. Un miembro del equipo te contactará para completar los detalles.';
    }

    return c.json({
      message: response,
      stage: 'COMPLETE',
      isComplete: true,
      briefId: briefData?.id,
    });
  }

  response = STAGE_PROMPTS[currentStage as keyof typeof STAGE_PROMPTS];
  nextStage = currentStage === BRIEFING_STAGES.CTA ? BRIEFING_STAGES.FINALIZING : currentStage;

  const stageKey = currentStage.toLowerCase();
  if (message) {
    answers[stageKey] = extractAnswer(currentStage, message);
  }

  if (currentStage === BRIEFING_STAGES.OBJECTIVE) {
    nextStage = BRIEFING_STAGES.HOOK;
  } else if (currentStage === BRIEFING_STAGES.HOOK) {
    nextStage = BRIEFING_STAGES.STYLE;
  } else if (currentStage === BRIEFING_STAGES.STYLE) {
    nextStage = BRIEFING_STAGES.AUDIENCE;
  } else if (currentStage === BRIEFING_STAGES.AUDIENCE) {
    nextStage = BRIEFING_STAGES.CTA;
  } else if (currentStage === BRIEFING_STAGES.CTA) {
    nextStage = BRIEFING_STAGES.FINALIZING;
  }

  return c.json({
    message: response,
    stage: nextStage,
    isComplete: false,
  });
});

assistant.get('/briefs/:clientId', async (c) => {
  const db = c.get('db');
  const { clientId } = c.req.param();

  try {
    const briefs = await db
      .select()
      .from(briefSubmissions)
      .where(eq(briefSubmissions.clientId, clientId))
      .orderBy(briefSubmissions.createdAt);

    return c.json({ briefs });
  } catch (error) {
    console.error('[BriefAssistant] Error fetching briefs:', error);
    return c.json({ error: 'Failed to fetch briefs' }, 500);
  }
});

assistant.get('/briefs/:clientId/:id', async (c) => {
  const db = c.get('db');
  const { clientId, id } = c.req.param();

  try {
    const brief = await db
      .select()
      .from(briefSubmissions)
      .where(eq(briefSubmissions.id, id))
      .limit(1);

    if (!brief.length) {
      return c.json({ error: 'Brief not found' }, 404);
    }

    return c.json({ brief: brief[0] });
  } catch (error) {
    console.error('[BriefAssistant] Error fetching brief:', error);
    return c.json({ error: 'Failed to fetch brief' }, 500);
  }
});

export { assistant as assistantRoutes };
