import type { AppBindings } from '../types/index.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Grande & Gordo <web@grandeandgordo.com>';
const DEFAULT_ADMIN_RECIPIENT = 'hola@grandeandgordo.com';
const DEFAULT_SITE_BASE = 'https://www.grandeandgordo.com';

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface BriefNotificationInput {
  email: string;
  tipo: string;
  description: string;
  briefId: string;
  clientName?: string | null;
  clientCompany?: string | null;
  source?: string | null;
  sourcePage?: string | null;
}

interface JobCompletionInput {
  clientEmail: string;
  clientName: string;
  jobBrief: string;
  jobId: string;
  jobPlatform?: string | null;
  jobType?: string | null;
  portalUrl: string;
}

interface FeedbackConfirmationInput {
  clientEmail: string;
  clientName: string;
  jobBrief: string;
  jobId: string;
  feedbackText: string;
  portalUrl: string;
}

interface QuarterlyReviewReminderInput {
  clientEmail: string;
  clientName: string;
  clientCompany?: string | null;
  portalUrl: string;
  reviewDate: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendEmail(
  env: AppBindings,
  input: SendEmailInput,
): Promise<{ ok: boolean; skipped?: boolean; id?: string }> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, skipped: true };
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? DEFAULT_FROM,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    error?: unknown;
  } | null;

  if (!response.ok || typeof payload?.id !== 'string') {
    console.error(
      'EMAIL_SEND_FAILED',
      JSON.stringify({
        status: response.status,
        body: payload,
        subject: input.subject,
      }),
    );
    return { ok: false };
  }

  return { ok: true, id: payload.id };
}

export async function sendBriefNotifications(
  env: AppBindings,
  input: BriefNotificationInput,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    return;
  }

  const clientLabel = input.clientCompany?.trim() || input.clientName?.trim() || input.email;
  const briefTypeLabel = input.tipo === 'ambos' ? 'foto + video' : input.tipo;
  const safeDescription = escapeHtml(input.description.trim());
  const safeClientLabel = escapeHtml(clientLabel);
  const safeEmail = escapeHtml(input.email);
  const safeSource = escapeHtml(input.source?.trim() || 'website');
  const safeSourcePage = input.sourcePage?.trim() ? escapeHtml(input.sourcePage.trim()) : null;
  const portalUrl = `${DEFAULT_SITE_BASE}/portal`;
  const onboardingUrl = `${DEFAULT_SITE_BASE}/onboarding`;

  const adminHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827">
      <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280">Nuevo brief web</p>
      <h1 style="font-size:24px;line-height:1.2;margin:12px 0 16px">${safeClientLabel}</h1>
      <p style="margin:0 0 8px"><strong>Email:</strong> ${safeEmail}</p>
      <p style="margin:0 0 8px"><strong>Tipo:</strong> ${escapeHtml(briefTypeLabel)}</p>
      <p style="margin:0 0 8px"><strong>Fuente:</strong> ${safeSource}</p>
      ${safeSourcePage ? `<p style="margin:0 0 16px"><strong>Origen:</strong> <a href="${safeSourcePage}">${safeSourcePage}</a></p>` : ''}
      <div style="margin-top:16px;padding:16px;border-radius:12px;background:#f3f4f6;white-space:pre-wrap">${safeDescription}</div>
      <p style="margin-top:16px;font-size:13px;color:#4b5563">Brief ID: ${escapeHtml(input.briefId)}</p>
    </div>
  `.trim();

  const clientHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827">
      <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280">Brief recibido</p>
      <h1 style="font-size:24px;line-height:1.2;margin:12px 0 16px">Ya tenemos tu contexto</h1>
      <p style="margin:0 0 12px">
        Hemos recibido tu brief de ${escapeHtml(briefTypeLabel)} y lo revisaremos en 24-48h laborables.
      </p>
      <p style="margin:0 0 12px">
        Si es tu primer brief o implica un cambio importante de direccion, te escribiremos
        para cerrar una llamada corta antes de mover produccion.
      </p>
      <div style="margin:16px 0;padding:16px;border-radius:12px;background:#f3f4f6;white-space:pre-wrap">${safeDescription}</div>
      <p style="margin:16px 0 8px"><a href="${portalUrl}">Centro de cliente</a></p>
      <p style="margin:0"><a href="${onboardingUrl}">Revisar onboarding</a></p>
    </div>
  `.trim();

  await Promise.allSettled([
    sendEmail(env, {
      to: DEFAULT_ADMIN_RECIPIENT,
      subject: `Nuevo brief web: ${clientLabel}`,
      html: adminHtml,
      text: `Nuevo brief web\n\nCliente: ${clientLabel}\nEmail: ${input.email}\nTipo: ${briefTypeLabel}\nFuente: ${input.source ?? 'website'}\n\n${input.description}`,
      replyTo: input.email,
    }),
    sendEmail(env, {
      to: input.email,
      subject: 'Brief recibido por Grande & Gordo',
      html: clientHtml,
      text: `Hemos recibido tu brief de ${briefTypeLabel}. Lo revisaremos en 24-48h laborables. Puedes revisar onboarding en ${onboardingUrl} o entrar al centro de cliente en ${portalUrl}.`,
    }),
  ]);
}

export async function sendJobCompletionEmail(
  env: AppBindings,
  input: JobCompletionInput,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, skipped: true };
  }

  const safeClientName = escapeHtml(input.clientName);
  const safeBrief = escapeHtml(input.jobBrief?.slice(0, 100) || 'Trabajo');
  const jobDetailUrl = `${input.portalUrl}/client/jobs/detail?id=${input.jobId}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827">
      <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280">Trabajo completado</p>
      <h1 style="font-size:24px;line-height:1.2;margin:12px 0 16px">Tus assets estan listos</h1>
      <p style="margin:0 0 12px">
        Hola ${safeClientName},
      </p>
      <p style="margin:0 0 12px">
        Hemos completado tu trabajo "${safeBrief}" y los assets ya estan disponibles para su descarga.
      </p>
      <p style="margin:16px 0">
        <a href="${jobDetailUrl}" style="display:inline-block;padding:12px 24px;background:#C4165A;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Ver assets y descargar</a>
      </p>
      <p style="margin:0 0 12px">
        Si necesitas algun ajuste o cambio, puedes enviarnos feedback directamente desde la pagina del trabajo.
      </p>
      <p style="margin:16px 0 8px;font-size:13px;color:#6b7280">
        Grande & Gordo · hola@grandeandgordo.com
      </p>
    </div>
  `.trim();

  const result = await sendEmail(env, {
    to: input.clientEmail,
    subject: `Trabajo completado: ${safeBrief}`,
    html,
    text: `Hola ${input.clientName},\n\nHemos completado tu trabajo "${input.jobBrief?.slice(0, 100) || 'Trabajo'}" y los assets ya estan disponibles.\n\nVer y descargar: ${jobDetailUrl}\n\nSi necesitas algun ajuste, puedes enviarnos feedback desde la pagina del trabajo.\n\nGrande & Gordo · hola@grandeandgordo.com`,
  });

  return { ok: result.ok ?? false, skipped: result.skipped ?? false };
}

export async function sendFeedbackConfirmationEmail(
  env: AppBindings,
  input: FeedbackConfirmationInput,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, skipped: true };
  }

  const safeClientName = escapeHtml(input.clientName);
  const safeBrief = escapeHtml(input.jobBrief?.slice(0, 100) || 'Trabajo');
  const safeFeedback = escapeHtml(input.feedbackText);
  const jobDetailUrl = `${input.portalUrl}/client/jobs/detail?id=${input.jobId}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827">
      <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280">Feedback recibido</p>
      <h1 style="font-size:24px;line-height:1.2;margin:12px 0 16px">Tu feedback ha llegado al equipo</h1>
      <p style="margin:0 0 12px">
        Hola ${safeClientName},
      </p>
      <p style="margin:0 0 12px">
        Hemos recibido tu feedback sobre "${safeBrief}". Nuestro equipo de producción lo revisará y se pondrá en contacto si necesita más información.
      </p>
      <div style="margin:16px 0;padding:16px;border-radius:12px;background:#f3f4f6;white-space:pre-wrap;font-size:14px">${safeFeedback}</div>
      <p style="margin:16px 0">
        Puedes ver el estado de tu trabajo y cualquier actualización en la página del proyecto.
      </p>
      <p style="margin:16px 0">
        <a href="${jobDetailUrl}" style="display:inline-block;padding:12px 24px;background:#C4165A;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Ver trabajo</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280">
        Grande & Gordo · hola@grandeandgordo.com
      </p>
    </div>
  `.trim();

  const result = await sendEmail(env, {
    to: input.clientEmail,
    subject: `Feedback recibido: ${safeBrief}`,
    html,
    text: `Hola ${input.clientName},\n\nHemos recibido tu feedback sobre "${input.jobBrief?.slice(0, 100) || 'Trabajo'}". Nuestro equipo lo revisará pronto.\n\nVer trabajo: ${jobDetailUrl}\n\nGrande & Gordo · hola@grandeandgordo.com`,
  });

  return { ok: result.ok ?? false, skipped: result.skipped ?? false };
}

export async function sendQuarterlyReviewReminderEmail(
  env: AppBindings,
  input: QuarterlyReviewReminderInput,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, skipped: true };
  }

  const safeClientName = escapeHtml(input.clientName);
  const safeCompany = escapeHtml(input.clientCompany?.trim() || '');
  const safeReviewDate = escapeHtml(input.reviewDate);
  const portalUrl = input.portalUrl;
  const hubUrl = `${portalUrl}/client/hub`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827">
      <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280">Recordatorio trimestral</p>
      <h1 style="font-size:24px;line-height:1.2;margin:12px 0 16px">Es hora de tu review trimestral</h1>
      <p style="margin:0 0 12px">
        Hola ${safeClientName}${safeCompany ? ` de ${safeCompany}` : ''},
      </p>
      <p style="margin:0 0 12px">
        Ha llegado el momento de hacer tu review trimestral de cuenta. En esta sesión repasaremos:
      </p>
      <ul style="margin:0 0 16px;padding-left:20px">
        <li>Rendimiento de assets producidos</li>
        <li>Nuevos objetivos y necesidades</li>
        <li>Optimización de presupuesto</li>
        <li>Planificación del próximo trimestre</li>
      </ul>
      <p style="margin:16px 0">
        Puedes agendar tu sesión directamente desde tu portal de cliente o respondiendo a este email.
      </p>
      <p style="margin:16px 0">
        <a href="${hubUrl}" style="display:inline-block;padding:12px 24px;background:#C4165A;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Ir al portal</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280">
        Grande & Gordo · hola@grandeandgordo.com
      </p>
    </div>
  `.trim();

  const result = await sendEmail(env, {
    to: input.clientEmail,
    subject: 'Recordatorio: Review trimestral de cuenta',
    html,
    text: `Hola ${input.clientName},\n\nHa llegado el momento de hacer tu review trimestral de cuenta. Repasaremos rendimiento de assets, nuevos objetivos y planificación del próximo trimestre.\n\nPuedes agendar desde tu portal: ${hubUrl}\n\nGrande & Gordo · hola@grandeandgordo.com`,
  });

  return { ok: result.ok ?? false, skipped: result.skipped ?? false };
}
