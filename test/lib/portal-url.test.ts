import { describe, expect, it } from 'vitest';
import {
  getClientActivationUrl,
  getClientHomeUrl,
  getPortalBaseUrl,
  getPortalLoginUrl,
  normalizePortalBaseUrl,
} from '../../src/lib/portal-url';

describe('portal URL helpers', () => {
  it('falls back to the canonical custom domain', () => {
    expect(getPortalBaseUrl()).toBe('https://crm.grandeandgordo.com');
    expect(getPortalLoginUrl()).toBe('https://crm.grandeandgordo.com/login/');
  });

  it('normalizes trailing slashes from configured URLs', () => {
    expect(normalizePortalBaseUrl('https://crm.grandeandgordo.com///')).toBe(
      'https://crm.grandeandgordo.com',
    );
    expect(getPortalBaseUrl({ PORTAL_URL: 'https://ops.example.com/' } as any)).toBe(
      'https://ops.example.com',
    );
  });

  it('builds client routes from a portal base URL', () => {
    expect(getClientHomeUrl('https://crm.grandeandgordo.com/')).toBe(
      'https://crm.grandeandgordo.com/client',
    );
    expect(getClientActivationUrl('https://crm.grandeandgordo.com')).toBe(
      'https://crm.grandeandgordo.com/client/onboarding',
    );
  });
});
