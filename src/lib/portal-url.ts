import type { AppBindings } from '../types/index.js';

const DEFAULT_PORTAL_BASE_URL = 'https://crm.grandeandgordo.com';

export function normalizePortalBaseUrl(value?: string | null): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return (trimmed || DEFAULT_PORTAL_BASE_URL).replace(/\/+$/, '');
}

export function getPortalBaseUrl(env?: Pick<AppBindings, 'PORTAL_URL'> | null): string {
  return normalizePortalBaseUrl(env?.PORTAL_URL);
}

export function getPortalLoginUrl(env?: Pick<AppBindings, 'PORTAL_URL'> | null): string {
  return `${getPortalBaseUrl(env)}/login/`;
}

export function getClientHomeUrl(portalUrl?: string | null): string {
  return `${normalizePortalBaseUrl(portalUrl)}/client`;
}

export function getClientActivationUrl(portalUrl?: string | null): string {
  return `${normalizePortalBaseUrl(portalUrl)}/client/onboarding`;
}
