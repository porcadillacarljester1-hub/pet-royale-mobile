import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/* A short list of the places clinic clients are most likely to be
   dialling from, not every country. Add a row to extend it. */
export type Country = { iso: string; name: string; dial: string };

export const COUNTRIES: Country[] = [
  { iso: 'PH', name: 'Philippines', dial: '63' },
  { iso: 'US', name: 'United States', dial: '1' },
  { iso: 'CA', name: 'Canada', dial: '1' },
  { iso: 'GB', name: 'United Kingdom', dial: '44' },
  { iso: 'AU', name: 'Australia', dial: '61' },
  { iso: 'NZ', name: 'New Zealand', dial: '64' },
  { iso: 'SG', name: 'Singapore', dial: '65' },
  { iso: 'MY', name: 'Malaysia', dial: '60' },
  { iso: 'ID', name: 'Indonesia', dial: '62' },
  { iso: 'TH', name: 'Thailand', dial: '66' },
  { iso: 'VN', name: 'Vietnam', dial: '84' },
  { iso: 'JP', name: 'Japan', dial: '81' },
  { iso: 'KR', name: 'South Korea', dial: '82' },
  { iso: 'CN', name: 'China', dial: '86' },
  { iso: 'HK', name: 'Hong Kong', dial: '852' },
  { iso: 'TW', name: 'Taiwan', dial: '886' },
  { iso: 'IN', name: 'India', dial: '91' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966' },
  { iso: 'QA', name: 'Qatar', dial: '974' },
  { iso: 'KW', name: 'Kuwait', dial: '965' },
  { iso: 'BH', name: 'Bahrain', dial: '973' },
  { iso: 'OM', name: 'Oman', dial: '968' },
  { iso: 'IL', name: 'Israel', dial: '972' },
  { iso: 'DE', name: 'Germany', dial: '49' },
  { iso: 'FR', name: 'France', dial: '33' },
  { iso: 'IT', name: 'Italy', dial: '39' },
  { iso: 'ES', name: 'Spain', dial: '34' },
  { iso: 'NL', name: 'Netherlands', dial: '31' },
  { iso: 'CH', name: 'Switzerland', dial: '41' },
  { iso: 'SE', name: 'Sweden', dial: '46' },
  { iso: 'NO', name: 'Norway', dial: '47' },
  { iso: 'DK', name: 'Denmark', dial: '45' },
  { iso: 'IE', name: 'Ireland', dial: '353' },
  { iso: 'MX', name: 'Mexico', dial: '52' },
  { iso: 'BR', name: 'Brazil', dial: '55' },
  { iso: 'ZA', name: 'South Africa', dial: '27' },
  { iso: 'NG', name: 'Nigeria', dial: '234' },
];

export const DEFAULT_ISO = 'PH';

const COUNTRIES_BY_DIAL_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export const getCountry = (iso: string): Country =>
  COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];

/* Flag emoji from the two-letter code. */
export const flagOf = (iso: string) =>
  iso.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));

/* Longest national number the input accepts per country. Philippine
   mobile numbers are exactly 10 digits once the leading 0 is dropped. */
export const maxNationalLength = (iso: string) => (iso === 'PH' ? 10 : 12);

/**
 * Turns whatever was typed or pasted into the national digits only:
 * strips non-digits, drops a pasted country code (+63 950… or 63950…)
 * and the leading 0 people type out of habit (0950… -> 950…).
 */
export function sanitizeNational(value: string, iso: string): string {
  const country = getCountry(iso);
  const max = maxNationalLength(iso);
  let digits = value.replace(/\D/g, '');
  if (digits.length > max && digits.startsWith(country.dial)) {
    digits = digits.slice(country.dial.length);
  }
  return digits.replace(/^0+/, '').slice(0, max);
}

/**
 * Checks the number against the selected country's real numbering plan
 * (assigned prefixes, valid lengths) using libphonenumber metadata.
 *
 * This proves the number COULD exist in that country, not that it is in
 * use or belongs to this person — only an SMS code can prove that.
 *
 * Landlines, toll-free and premium-rate numbers are rejected because the
 * clinic sends reminders by SMS. When the library can't classify a valid
 * number's type, it is accepted rather than wrongly rejected.
 */
export function isValidMobile(country: Country, digits: string): boolean {
  if (!digits) return false;
  const parsed = parsePhoneNumberFromString(`+${country.dial}${digits}`);
  if (!parsed || !parsed.isValid()) return false;
  const type = parsed.getType();
  return !type || type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE';
}

/* The one format saved to the database: +639171234567 */
export const toE164 = (country: Country, digits: string) => `+${country.dial}${digits}`;

/**
 * Splits whatever is stored in clients.phone into country + national
 * number. Handles the "+639XXXXXXXXX" form and the older "09XXXXXXXXX" /
 * "9XXXXXXXXX" forms saved before the country picker existed.
 */
export function parsePhone(raw: string | null | undefined): { iso: string; national: string } {
  const value = (raw || '').trim();
  const digits = value.replace(/\D/g, '');
  if (!digits) return { iso: DEFAULT_ISO, national: '' };

  if (value.startsWith('+')) {
    const match = COUNTRIES_BY_DIAL_LENGTH.find((c) => digits.startsWith(c.dial));
    if (match) return { iso: match.iso, national: digits.slice(match.dial.length) };
  }
  if (digits.startsWith('63') && digits.length === 12) {
    return { iso: 'PH', national: digits.slice(2) };
  }
  return { iso: DEFAULT_ISO, national: digits.replace(/^0+/, '') };
}