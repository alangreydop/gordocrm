const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const siteBase = stripTrailingSlash(
  import.meta.env.PUBLIC_SITE_URL ?? 'https://grandeandgordo.com',
);

const crmBase = stripTrailingSlash(
  import.meta.env.PUBLIC_CRM_URL ??
    'https://gordocrm-api-production.alangreydop.workers.dev',
);

const supportEmail = 'hola@grandeandgordo.com';

export const siteLinks = {
  home: siteBase,
  portalHub: `${siteBase}/portal`,
  brief: `${siteBase}/brief`,
  onboarding: `${siteBase}/onboarding`,
  pricing: `${siteBase}/precios`,
  cases: `${siteBase}/casos`,
  crmBase,
  crmLogin: `${crmBase}/login/`,
  supportEmail,
  supportMailto: `mailto:${supportEmail}`,
};
