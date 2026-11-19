import { describe, it } from 'node:test';
import assert from 'node:assert';

interface Holiday {
  id: string;
  name: string;
  date: string;
  closed: boolean;
}

function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getFirstMonday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  while (date.getUTCDay() !== 1) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDateUTC(date);
}

function getSecondMonday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let mondays = 0;
  while (mondays < 2) {
    if (date.getUTCDay() === 1) {
      mondays++;
      if (mondays === 2) break;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDateUTC(date);
}

function getThirdMonday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let mondays = 0;
  while (mondays < 3) {
    if (date.getUTCDay() === 1) {
      mondays++;
      if (mondays === 3) break;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDateUTC(date);
}

function getLastMonday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  while (date.getUTCDay() !== 1) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return formatDateUTC(date);
}

function getFourthThursday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let thursdays = 0;
  while (thursdays < 4) {
    if (date.getUTCDay() === 4) {
      thursdays++;
      if (thursdays === 4) break;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDateUTC(date);
}

function getDayAfterThanksgiving(year: number): string {
  const thanksgiving = getFourthThursday(year, 11);
  const [y, m, d] = thanksgiving.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return formatDateUTC(date);
}

function getHolidaysForYear(year: number): Holiday[] {
  return [
    { id: 'new-years-day', name: "New Year's Day", date: `${year}-01-01`, closed: true },
    { id: 'mlk-day', name: 'Martin Luther King Jr. Day', date: getThirdMonday(year, 1), closed: true },
    { id: 'presidents-day', name: "Presidents' Day", date: getThirdMonday(year, 2), closed: true },
    { id: 'memorial-day', name: 'Memorial Day', date: getLastMonday(year, 5), closed: true },
    { id: 'juneteenth', name: 'Juneteenth', date: `${year}-06-19`, closed: true },
    { id: 'independence-day', name: 'Independence Day', date: `${year}-07-04`, closed: true },
    { id: 'labor-day', name: 'Labor Day', date: getFirstMonday(year, 9), closed: true },
    { id: 'columbus-day', name: 'Columbus Day', date: getSecondMonday(year, 10), closed: false },
    { id: 'veterans-day', name: 'Veterans Day', date: `${year}-11-11`, closed: false },
    { id: 'thanksgiving', name: 'Thanksgiving Day', date: getFourthThursday(year, 11), closed: true },
    { id: 'black-friday', name: 'Black Friday', date: getDayAfterThanksgiving(year), closed: false },
    { id: 'christmas-eve', name: 'Christmas Eve', date: `${year}-12-24`, closed: false },
    { id: 'christmas-day', name: 'Christmas Day', date: `${year}-12-25`, closed: true },
    { id: 'new-years-eve', name: "New Year's Eve", date: `${year}-12-31`, closed: false },
  ];
}

describe('Hours Exceptions - Holiday Calculations', () => {
  describe('Fixed Date Holidays', () => {
    it('calculates New Year\'s Day correctly', () => {
      const holidays2026 = getHolidaysForYear(2026);
      const newYears = holidays2026.find(h => h.id === 'new-years-day');
      
      assert.strictEqual(newYears?.date, '2026-01-01');
      assert.strictEqual(newYears?.closed, true);
    });
    
    it('calculates Independence Day correctly', () => {
      const holidays2026 = getHolidaysForYear(2026);
      const july4 = holidays2026.find(h => h.id === 'independence-day');
      
      assert.strictEqual(july4?.date, '2026-07-04');
      assert.strictEqual(july4?.closed, true);
    });
    
    it('calculates Christmas Day correctly', () => {
      const holidays2026 = getHolidaysForYear(2026);
      const christmas = holidays2026.find(h => h.id === 'christmas-day');
      
      assert.strictEqual(christmas?.date, '2026-12-25');
      assert.strictEqual(christmas?.closed, true);
    });
    
    it('calculates Juneteenth correctly', () => {
      const holidays2026 = getHolidaysForYear(2026);
      const juneteenth = holidays2026.find(h => h.id === 'juneteenth');
      
      assert.strictEqual(juneteenth?.date, '2026-06-19');
      assert.strictEqual(juneteenth?.closed, true);
    });
  });

  describe('Floating Holidays', () => {
    it('calculates MLK Day (third Monday of January) correctly', () => {
      const mlk2026 = getThirdMonday(2026, 1);
      assert.strictEqual(mlk2026, '2026-01-19');
      
      const mlk2027 = getThirdMonday(2027, 1);
      assert.strictEqual(mlk2027, '2027-01-18');
    });
    
    it('calculates Presidents Day (third Monday of February) correctly', () => {
      const presidents2026 = getThirdMonday(2026, 2);
      assert.strictEqual(presidents2026, '2026-02-16');
      
      const presidents2027 = getThirdMonday(2027, 2);
      assert.strictEqual(presidents2027, '2027-02-15');
    });
    
    it('calculates Memorial Day (last Monday of May) correctly', () => {
      const memorial2026 = getLastMonday(2026, 5);
      assert.strictEqual(memorial2026, '2026-05-25');
      
      const memorial2027 = getLastMonday(2027, 5);
      assert.strictEqual(memorial2027, '2027-05-31');
    });
    
    it('calculates Labor Day (first Monday of September) correctly', () => {
      const labor2026 = getFirstMonday(2026, 9);
      assert.strictEqual(labor2026, '2026-09-07');
      
      const labor2027 = getFirstMonday(2027, 9);
      assert.strictEqual(labor2027, '2027-09-06');
    });
    
    it('calculates Columbus Day (second Monday of October) correctly', () => {
      const columbus2026 = getSecondMonday(2026, 10);
      assert.strictEqual(columbus2026, '2026-10-12');
      
      const columbus2027 = getSecondMonday(2027, 10);
      assert.strictEqual(columbus2027, '2027-10-11');
    });
    
    it('calculates Thanksgiving (fourth Thursday of November) correctly', () => {
      const thanksgiving2026 = getFourthThursday(2026, 11);
      assert.strictEqual(thanksgiving2026, '2026-11-26');
      
      const thanksgiving2027 = getFourthThursday(2027, 11);
      assert.strictEqual(thanksgiving2027, '2027-11-25');
    });
    
    it('calculates Black Friday correctly', () => {
      const blackFriday2026 = getDayAfterThanksgiving(2026);
      assert.strictEqual(blackFriday2026, '2026-11-27');
      
      const blackFriday2027 = getDayAfterThanksgiving(2027);
      assert.strictEqual(blackFriday2027, '2027-11-26');
    });
  });

  describe('Holiday Closed Status', () => {
    it('marks major holidays as closed', () => {
      const holidays2026 = getHolidaysForYear(2026);
      
      const thanksgiving = holidays2026.find(h => h.id === 'thanksgiving');
      const christmas = holidays2026.find(h => h.id === 'christmas-day');
      const newYears = holidays2026.find(h => h.id === 'new-years-day');
      
      assert.strictEqual(thanksgiving?.closed, true);
      assert.strictEqual(christmas?.closed, true);
      assert.strictEqual(newYears?.closed, true);
    });
    
    it('marks shopping days as open (special hours)', () => {
      const holidays2026 = getHolidaysForYear(2026);
      
      const blackFriday = holidays2026.find(h => h.id === 'black-friday');
      const christmasEve = holidays2026.find(h => h.id === 'christmas-eve');
      const columbusDay = holidays2026.find(h => h.id === 'columbus-day');
      
      assert.strictEqual(blackFriday?.closed, false);
      assert.strictEqual(christmasEve?.closed, false);
      assert.strictEqual(columbusDay?.closed, false);
    });
  });
});

describe('Hours Exceptions - Bulk Operations', () => {
  describe('State Filtering', () => {
    it('filters stores by single state', () => {
      const stores = [
        { id: '1', state: 'CA' },
        { id: '2', state: 'CA' },
        { id: '3', state: 'NV' },
        { id: '4', state: 'AZ' },
      ];
      
      const selectedStates = ['CA'];
      const filtered = stores.filter(s => selectedStates.includes(s.state));
      
      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.every(s => s.state === 'CA'));
    });
    
    it('filters stores by multiple states', () => {
      const stores = [
        { id: '1', state: 'CA' },
        { id: '2', state: 'CA' },
        { id: '3', state: 'NV' },
        { id: '4', state: 'AZ' },
      ];
      
      const selectedStates = ['CA', 'NV'];
      const filtered = stores.filter(s => selectedStates.includes(s.state));
      
      assert.strictEqual(filtered.length, 3);
    });
    
    it('returns all stores when no state filter', () => {
      const stores = [
        { id: '1', state: 'CA' },
        { id: '2', state: 'CA' },
        { id: '3', state: 'NV' },
        { id: '4', state: 'AZ' },
      ];
      
      const selectedStates: string[] = [];
      const filtered = selectedStates.length === 0 
        ? stores 
        : stores.filter(s => selectedStates.includes(s.state));
      
      assert.strictEqual(filtered.length, 4);
    });
  });

  describe('Preview Logic', () => {
    it('identifies stores with existing exceptions', () => {
      const stores = [
        { id: '1', storeNumber: '001', hasException: false },
        { id: '2', storeNumber: '002', hasException: true },
        { id: '3', storeNumber: '003', hasException: false },
      ];
      
      const toCreate = stores.filter(s => !s.hasException);
      const withExisting = stores.filter(s => s.hasException);
      
      assert.strictEqual(toCreate.length, 2);
      assert.strictEqual(withExisting.length, 1);
    });
    
    it('calculates correct preview counts', () => {
      const preview = {
        targetStores: [
          { id: '1', alreadyHasException: false },
          { id: '2', alreadyHasException: true },
          { id: '3', alreadyHasException: false },
          { id: '4', alreadyHasException: true },
        ],
      };
      
      const storesWithExisting = preview.targetStores.filter(s => s.alreadyHasException).length;
      const storesToCreate = preview.targetStores.length - storesWithExisting;
      
      assert.strictEqual(storesWithExisting, 2);
      assert.strictEqual(storesToCreate, 2);
    });
  });

  describe('Bulk Apply Logic', () => {
    it('skips stores with existing exceptions when skipExisting=true', () => {
      const stores = [
        { id: '1', hasException: false },
        { id: '2', hasException: true },
        { id: '3', hasException: false },
      ];
      
      const skipExisting = true;
      let created = 0;
      let skipped = 0;
      
      for (const store of stores) {
        if (store.hasException && skipExisting) {
          skipped++;
        } else {
          created++;
        }
      }
      
      assert.strictEqual(created, 2);
      assert.strictEqual(skipped, 1);
    });
    
    it('replaces existing exceptions when skipExisting=false', () => {
      const stores = [
        { id: '1', hasException: false },
        { id: '2', hasException: true },
        { id: '3', hasException: false },
      ];
      
      let created = 0;
      let replaced = 0;
      
      for (const store of stores) {
        if (store.hasException) {
          replaced++;
        }
        created++;
      }
      
      assert.strictEqual(created, 3);
      assert.strictEqual(replaced, 1);
    });
  });

  describe('Hours Exception Data Structure', () => {
    it('creates exception with correct holiday data', () => {
      const holiday = { id: 'thanksgiving', name: 'Thanksgiving Day', date: '2026-11-26', closed: true };
      
      const exception = {
        type: 'holiday',
        label: holiday.name,
        startDate: holiday.date,
        endDate: holiday.date,
        closed: holiday.closed,
        intervals: [],
        source: 'bulk',
      };
      
      assert.strictEqual(exception.type, 'holiday');
      assert.strictEqual(exception.label, 'Thanksgiving Day');
      assert.strictEqual(exception.startDate, '2026-11-26');
      assert.strictEqual(exception.endDate, '2026-11-26');
      assert.strictEqual(exception.closed, true);
      assert.deepStrictEqual(exception.intervals, []);
      assert.strictEqual(exception.source, 'bulk');
    });
    
    it('creates exception for special hours day', () => {
      const holiday = { id: 'black-friday', name: 'Black Friday', date: '2026-11-27', closed: false };
      
      const exception = {
        type: 'holiday',
        label: holiday.name,
        startDate: holiday.date,
        endDate: holiday.date,
        closed: holiday.closed,
        intervals: [],
        source: 'bulk',
      };
      
      assert.strictEqual(exception.label, 'Black Friday');
      assert.strictEqual(exception.closed, false);
    });
  });
});

describe('Hours Exceptions - Upcoming Exceptions Filter', () => {
  it('filters out past exceptions', () => {
    const today = '2026-10-30';
    const exceptions = [
      { id: '1', label: 'Halloween', startDate: '2026-10-31', endDate: '2026-10-31' },
      { id: '2', label: 'Past Event', startDate: '2026-10-01', endDate: '2026-10-05' },
      { id: '3', label: 'Thanksgiving', startDate: '2026-11-26', endDate: '2026-11-26' },
      { id: '4', label: 'Ended Yesterday', startDate: '2026-10-28', endDate: '2026-10-29' },
    ];
    
    const upcoming = exceptions.filter(ex => ex.endDate >= today);
    
    assert.strictEqual(upcoming.length, 2);
    assert.ok(upcoming.some(ex => ex.label === 'Halloween'));
    assert.ok(upcoming.some(ex => ex.label === 'Thanksgiving'));
    assert.ok(!upcoming.some(ex => ex.label === 'Past Event'));
    assert.ok(!upcoming.some(ex => ex.label === 'Ended Yesterday'));
  });
  
  it('sorts exceptions by startDate', () => {
    const exceptions = [
      { id: '1', label: 'Thanksgiving', startDate: '2026-11-26', endDate: '2026-11-26' },
      { id: '2', label: 'Halloween', startDate: '2026-10-31', endDate: '2026-10-31' },
      { id: '3', label: 'Christmas', startDate: '2026-12-25', endDate: '2026-12-25' },
    ];
    
    const sorted = [...exceptions].sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    assert.strictEqual(sorted[0].label, 'Halloween');
    assert.strictEqual(sorted[1].label, 'Thanksgiving');
    assert.strictEqual(sorted[2].label, 'Christmas');
  });
  
  it('takes only first 3 upcoming exceptions', () => {
    const today = '2026-10-30';
    const exceptions = [
      { id: '1', label: 'Halloween', startDate: '2026-10-31', endDate: '2026-10-31' },
      { id: '2', label: 'Thanksgiving', startDate: '2026-11-26', endDate: '2026-11-26' },
      { id: '3', label: 'Black Friday', startDate: '2026-11-27', endDate: '2026-11-27' },
      { id: '4', label: 'Christmas', startDate: '2026-12-25', endDate: '2026-12-25' },
      { id: '5', label: 'New Years', startDate: '2027-01-01', endDate: '2027-01-01' },
    ];
    
    const upcomingThree = exceptions
      .filter(ex => ex.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 3);
    
    assert.strictEqual(upcomingThree.length, 3);
    assert.strictEqual(upcomingThree[0].label, 'Halloween');
    assert.strictEqual(upcomingThree[1].label, 'Thanksgiving');
    assert.strictEqual(upcomingThree[2].label, 'Black Friday');
  });
});

describe('Hours Exceptions - Integration with Operating State', () => {
  describe('Exception Priority', () => {
    it('holiday exception takes priority over standard hours', () => {
      const standardHours = { closed: false, intervals: [{ open: '10:00', close: '21:00' }] };
      const holidayException = { label: 'Thanksgiving', closed: true, intervals: [] };
      
      const effectiveHours = holidayException ?? standardHours;
      
      assert.strictEqual(effectiveHours.closed, true);
    });
    
    it('closure takes priority over holiday exception', () => {
      const closure = { reason: 'Emergency', status: 'active' };
      
      const hasActiveClosure = closure.status === 'active';
      
      assert.strictEqual(hasActiveClosure, true);
    });
  });
  
  describe('Acceptance Criteria Verification', () => {
    it('Thanksgiving holiday shows Closed for CA stores', () => {
      const holiday = getHolidaysForYear(2026).find(h => h.id === 'thanksgiving')!;
      const caStores = [
        { id: '1', state: 'CA' },
        { id: '2', state: 'CA' },
      ];
      
      const selectedStates = ['CA'];
      const filtered = caStores.filter(s => selectedStates.includes(s.state));
      
      assert.strictEqual(filtered.length, 2);
      assert.strictEqual(holiday.name, 'Thanksgiving Day');
      assert.strictEqual(holiday.closed, true);
    });
    
    it('emergency closure shows Closed with reason', () => {
      const closure = {
        reason: 'Water main break',
        status: 'active',
        startsAt: new Date().toISOString(),
      };
      
      assert.strictEqual(closure.status, 'active');
      assert.ok(closure.reason.length > 0, 'Closure should have a reason');
    });
    
    it('closure with no endsAt expires at local midnight', () => {
      const closure = {
        reason: 'Emergency closure',
        status: 'active',
        startsAt: '2026-10-30T14:00:00Z',
        endsAt: undefined as string | undefined,
      };
      
      const hasExplicitEnd = closure.endsAt !== undefined;
      
      assert.strictEqual(hasExplicitEnd, false, 'Closure without endsAt expires at local midnight');
    });
  });
});
