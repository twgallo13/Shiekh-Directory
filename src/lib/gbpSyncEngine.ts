import { LocationRecord, GbpSyncLogEntry } from '../types';

/**
 * Parses time strings like "10:00 AM", "9:00 PM", "10:00", "21:00" into 24-hour hours and minutes.
 */
export function parseTime24(timeStr: string): { hours: number; minutes: number } | null {
  if (!timeStr || timeStr.toLowerCase().includes('closed') || timeStr === '—') return null;
  const clean = timeStr.trim();
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return { hours: h, minutes: m };
  }

  const h24Match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    return { hours: parseInt(h24Match[1], 10), minutes: parseInt(h24Match[2], 10) };
  }

  return null;
}

export function formatTime24(timeObj: { hours: number; minutes: number } | null): string {
  if (!timeObj) return '';
  const hh = String(timeObj.hours).padStart(2, '0');
  const mm = String(timeObj.minutes).padStart(2, '0');
  return `${hh}:${mm}`;
}

export type GbpOpenedState = 'OPEN' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';

/**
 * Translates internal Shiekh Operational Status into Google Business Profile OPENED_STATE
 * Blueprint Sec 14 & DISPATCH-006 Sec 3
 */
export function translateOperationalStatusToGbp(status: LocationRecord['operationalStatus']): {
  status: GbpOpenedState;
  canReopen: boolean;
  description: string;
} {
  switch (status) {
    case 'Open — Normal Operations':
    case 'Opening Soon':
    case 'Modified Hours':
      return {
        status: 'OPEN',
        canReopen: true,
        description: 'Google Maps flag: OPEN (Store is actively serving customers)',
      };
    case 'Temporarily Closed':
    case 'Under Remodel':
    case 'Maintenance / Repair Issue':
    case 'Relocating':
      return {
        status: 'CLOSED_TEMPORARILY',
        canReopen: true,
        description: 'Google Maps flag: CLOSED_TEMPORARILY (Store marked temporarily closed; will retain SEO/reviews)',
      };
    case 'Closing':
    case 'Permanently Closed':
      return {
        status: 'CLOSED_PERMANENTLY',
        canReopen: false,
        description: 'Google Maps flag: CLOSED_PERMANENTLY (Store decommissioned)',
      };
    default:
      return {
        status: 'OPEN',
        canReopen: true,
        description: 'Google Maps flag: OPEN',
      };
  }
}

/**
 * Translates internal LocationRecord to Google Business Profile API v1 resource payload
 * Endpoint: PATCH https://mybusinessbusinessinformation.googleapis.com/v1/locations/{locationId}?updateMask=...
 */
export function translateLocationToGbpSchema(loc: LocationRecord, gbpLocationId?: string): Record<string, any> {
  const daysMap: Array<{ key: keyof LocationRecord['standardHours']; dayOfWeek: string }> = [
    { key: 'monday', dayOfWeek: 'MONDAY' },
    { key: 'tuesday', dayOfWeek: 'TUESDAY' },
    { key: 'wednesday', dayOfWeek: 'WEDNESDAY' },
    { key: 'thursday', dayOfWeek: 'THURSDAY' },
    { key: 'friday', dayOfWeek: 'FRIDAY' },
    { key: 'saturday', dayOfWeek: 'SATURDAY' },
    { key: 'sunday', dayOfWeek: 'SUNDAY' },
  ];

  const periods: Array<{
    openDay: string;
    openTime: { hours: number; minutes: number };
    closeDay: string;
    closeTime: { hours: number; minutes: number };
  }> = [];

  daysMap.forEach(({ key, dayOfWeek }) => {
    const daySchedule = loc.standardHours[key];
    if (daySchedule && !daySchedule.isClosed && daySchedule.open !== 'Closed') {
      const openT = parseTime24(daySchedule.open);
      const closeT = parseTime24(daySchedule.close);
      if (openT && closeT) {
        periods.push({
          openDay: dayOfWeek,
          openTime: openT,
          closeDay: dayOfWeek,
          closeTime: closeT,
        });
      }
    }
  });

  // Special & Holiday Hours Periods
  const specialHourPeriods: Array<{
    startDate: { year: number; month: number; day: number };
    endDate?: { year: number; month: number; day: number };
    isClosed?: boolean;
    openTime?: { hours: number; minutes: number };
    closeTime?: { hours: number; minutes: number };
  }> = [];

  // Holiday hours
  (loc.holidayHours || []).forEach(h => {
    const parts = h.date.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (h.hours.isClosed || h.hours.open === 'Closed') {
        specialHourPeriods.push({
          startDate: { year, month, day },
          isClosed: true,
        });
      } else {
        const o = parseTime24(h.hours.open);
        const c = parseTime24(h.hours.close);
        if (o && c) {
          specialHourPeriods.push({
            startDate: { year, month, day },
            openTime: o,
            closeTime: c,
          });
        }
      }
    }
  });

  // Special hours overrides
  (loc.specialHours || []).forEach(s => {
    const parts = s.startDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (s.hours.isClosed || s.hours.open === 'Closed') {
        specialHourPeriods.push({
          startDate: { year, month, day },
          isClosed: true,
        });
      } else {
        const o = parseTime24(s.hours.open);
        const c = parseTime24(s.hours.close);
        if (o && c) {
          specialHourPeriods.push({
            startDate: { year, month, day },
            openTime: o,
            closeTime: c,
          });
        }
      }
    }
  });

  const openInfo = translateOperationalStatusToGbp(loc.operationalStatus);

  const suite = loc.mallContact?.suiteNumber ? `, Ste ${loc.mallContact.suiteNumber}` : '';
  const addressLine1 = `${loc.address}${suite}`;

  return {
    name: gbpLocationId || loc.gbpLocationId || `locations/1083921839281938/loc-gbp-${loc.storeNumber}`,
    title: `Shiekh`,
    storeCode: loc.storeNumber,
    storefrontAddress: {
      addressLines: [addressLine1],
      locality: loc.city,
      administrativeArea: loc.state,
      postalCode: loc.zipCode,
      regionCode: 'US',
    },
    phoneNumbers: {
      primaryPhone: loc.phone,
    },
    regularHours: {
      periods,
    },
    specialHours: {
      specialHourPeriods,
    },
    openInfo: {
      status: openInfo.status,
      canReopen: openInfo.canReopen,
    },
    websiteUri: `https://www.shiekh.com/stores/${loc.storeNumber.toLowerCase()}`,
    metadata: {
      placeId: loc.gbpPlaceId || 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      mapsUri: loc.gbpMapsUrl || `https://maps.google.com/?cid=1083921839281938${loc.storeNumber.padStart(3, '0')}`,
    },
    serviceMetadata: {
      authoritativeSource: 'Shiekh Shoes Master Directory SoR (Single Source of Truth)',
      syncTimestamp: new Date().toISOString(),
      direction: 'ONE_WAY_PUSH_FROM_SOR_TO_GOOGLE',
    },
  };
}

/**
 * Validates whether a location has all mandatory fields required by Google Business Profile API
 */
export function validateLocationForGbp(loc: LocationRecord): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!loc.storeNumber) errors.push('Store number is required for storeCode mapping.');
  if (!loc.address || loc.address.trim().length < 5) errors.push('Street address is invalid or missing.');
  if (!loc.city) errors.push('City is required.');
  if (!loc.state) errors.push('State is required.');
  if (!loc.zipCode || !/^\d{5}(-\d{4})?$/.test(loc.zipCode.trim())) {
    errors.push(`Postal code '${loc.zipCode}' is not a valid 5-digit US ZIP code.`);
  }
  if (!loc.phone || loc.phone.replace(/\D/g, '').length < 10) {
    errors.push(`Main phone '${loc.phone}' is invalid (minimum 10 digits required).`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generates an executive summary of differences between SoR data and what will be sent to Google Maps
 */
export function generateGbpDiffSummary(loc: LocationRecord): string {
  const openInfo = translateOperationalStatusToGbp(loc.operationalStatus);
  const diffs: string[] = [];

  diffs.push(`Listing: Shiekh (Store #${loc.storeNumber})`);
  diffs.push(`Address: ${loc.address}, ${loc.city}, ${loc.state} ${loc.zipCode}`);
  diffs.push(`Primary Phone: ${loc.phone}`);
  diffs.push(`Operational Status: ${loc.operationalStatus} -> Google OPENED_STATE: ${openInfo.status}`);
  
  const monday = loc.standardHours.monday;
  diffs.push(`Mon Hours: ${monday.isClosed ? 'Closed' : `${monday.open} - ${monday.close}`}`);

  if (loc.holidayHours && loc.holidayHours.length > 0) {
    diffs.push(`Holiday Exceptions: ${loc.holidayHours.length} active period(s)`);
  }

  return diffs.join(' • ');
}
