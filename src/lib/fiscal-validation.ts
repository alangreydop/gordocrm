/**
 * Spanish fiscal ID validation — canonical copy lives here (gordocrm).
 * gordoleads may show display-only hints; authoritative validation is server-side here.
 *
 * Formats:
 *   NIF: 8 digits + letter         (individuals)
 *   NIE: X/Y/Z + 7 digits + letter (foreign nationals)
 *   CIF: letter + 7 digits + letter or digit (companies)
 */

const NIF_REGEX = /^\d{8}[A-Z]$/i;
const NIE_REGEX = /^[XYZ]\d{7}[A-Z]$/i;
const CIF_REGEX = /^[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-Z0-9]$/i;

export type TaxIdType = 'NIF' | 'NIE' | 'CIF';

export interface TaxIdValidation {
  valid: boolean;
  type: TaxIdType | null;
  normalized: string;
}

/**
 * Validates and detects the type of a Spanish fiscal ID.
 * Normalises to uppercase and strips whitespace before checking.
 */
export function validateTaxId(raw: string): TaxIdValidation {
  const normalized = raw.trim().toUpperCase();

  if (NIF_REGEX.test(normalized)) return { valid: true, type: 'NIF', normalized };
  if (NIE_REGEX.test(normalized)) return { valid: true, type: 'NIE', normalized };
  if (CIF_REGEX.test(normalized)) return { valid: true, type: 'CIF', normalized };

  return { valid: false, type: null, normalized };
}

/**
 * Auto-detect tax ID type from a valid normalized string.
 * Returns null if the string does not match any known format.
 */
export function detectTaxIdType(normalized: string): TaxIdType | null {
  if (NIF_REGEX.test(normalized)) return 'NIF';
  if (NIE_REGEX.test(normalized)) return 'NIE';
  if (CIF_REGEX.test(normalized)) return 'CIF';
  return null;
}
