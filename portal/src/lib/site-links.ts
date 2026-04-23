const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const siteBase = stripTrailingSlash(
  import.meta.env.PUBLIC_SITE_URL ?? 'https://grandeandgordo.com',
);

const portalBase = stripTrailingSlash(
  import.meta.env.PUBLIC_PORTAL_URL ?? 'https://crm.grandeandgordo.com',
);

const supportEmail = 'hola@grandeandgordo.com';

export const siteLinks = {
  home: siteBase,
  portalHub: '/client',
  brief: '/client/brief-assistant',
  onboarding: '/client/onboarding',
  pricing: `${siteBase}/precios`,
  pricingInternal: '/client',
  cases: '/client/cases',
  faq: '/client/faq',
  crmBase: portalBase,
  crmLogin: `${portalBase}/login/`,
  supportEmail,
  supportMailto: `mailto:${supportEmail}`,
};
