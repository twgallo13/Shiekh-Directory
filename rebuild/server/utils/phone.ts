import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';

export function normalizePhoneNumber(phone: string, country: CountryCode = 'US'): string | null {
  if (!phone) return null;
  
  try {
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    if (!isValidPhoneNumber(cleaned, country)) {
      if (!isValidPhoneNumber(`+1${cleaned}`, country) && 
          !isValidPhoneNumber(cleaned)) {
        return null;
      }
    }
    
    const parsed = parsePhoneNumber(cleaned, country);
    if (parsed) {
      return parsed.format('E.164');
    }
    
    return null;
  } catch {
    return null;
  }
}

export function formatPhoneNumber(phone: string, country: CountryCode = 'US'): string {
  if (!phone) return '';
  
  try {
    const parsed = parsePhoneNumber(phone, country);
    if (parsed) {
      return parsed.formatNational();
    }
    return phone;
  } catch {
    return phone;
  }
}

export function normalizePhoneForSearch(phone: string | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/[^\d]/g, '');
}
