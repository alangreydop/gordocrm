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

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; error?: unknown }
    | null;

  if (!response.ok || typeof payload?.id !== 'string') {
    console.error('EMAIL_SEND_FAILED', JSON.stringify({
      status: response.status,
      body: payload,
      subject: input.subject,
    }));
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

  const clientLabel = input.clientCompany?.trim()
    || input.clientName?.trim()
    || input.email;
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
