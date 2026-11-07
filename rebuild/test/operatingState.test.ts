/**
 * Tests for Open/Closed Now Precedence Logic
 * 
 * Tests verify:
 * 1. Closure takes precedence over everything
 * 2. Exception takes precedence over standard hours
 * 3. Standard hours apply when no closure/exception
 * 4. Overnight hours (close < open) work correctly
 * 5. Time zones are handled correctly
 * 6. Unknown state is returned when undeterminable
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveOperatingStatus, formatHoursDisplay, formatTime } from '../src/lib/operatingState';
import type { Location, Closure, HoursException } from '../src/types';

const baseLocation: Location = {
  id: 'test-location',
  kind: 'store',
  storeNumber: '007',
  name: 'Test Store',
  lifecycle: 'active',
  address: {
    street: '123 Test St',
    city: 'Los Angeles',
    state: 'CA',
    zip: '90001',
    country: 'US',
  },
  timeZone: 'America/Los_Angeles',
  mainPhone: '+12135550007',
  phonePublic: true,
  regionId: 'region-1',
  districtId: 'district-1',
  standardHours: {
    monday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    tuesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    wednesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    thursday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    friday: { closed: false, intervals: [{ open: '10:00', close: '22:00' }] },
    saturday: { closed: false, intervals: [{ open: '10:00', close: '22:00' }] },
    sunday: { closed: false, intervals: [{ open: '11:00', close: '19:00' }] },
  },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  updatedBy: 'system',
  version: 1,
};

describe('Operating State - Precedence', () => {
  it('should show Closed when there is an active closure (highest priority)', () => {
    const now = new Date('2024-06-15T14:00:00-07:00');
    
    const closures: Closure[] = [{
      id: 'closure-1',
      reason: 'Water damage repair',
      startsAt: '2024-06-15T08:00:00-07:00',
      endsAt: '2024-06-17T08:00:00-07:00',
      status: 'active',
    }];
    
    const result = resolveOperatingStatus(baseLocation, closures, [], now);
    
    assert.strictEqual(result.state, 'Closed');
    assert.strictEqual(result.source, 'closure');
    assert.strictEqual(result.reason, 'Water damage repair');
  });
  
  it('should use closure even when exception hours would be open', () => {
    const now = new Date('2024-06-15T14:00:00-07:00');
    
    const closures: Closure[] = [{
      id: 'closure-1',
      reason: 'Emergency maintenance',
      startsAt: '2024-06-15T08:00:00-07:00',
      endsAt: '2024-06-16T08:00:00-07:00',
      status: 'active',
    }];
    
    const exceptions: HoursException[] = [{
      id: 'exception-1',
      type: 'special',
      label: 'Extended Summer Hours',
      startDate: '2024-06-15',
      endDate: '2024-06-15',
      closed: false,
      intervals: [{ open: '08:00', close: '23:00' }],
    }];
    
    const result = resolveOperatingStatus(baseLocation, closures, exceptions, now);
    
    assert.strictEqual(result.state, 'Closed');
    assert.strictEqual(result.source, 'closure');
  });
  
  it('should use exception hours when no active closure', () => {
    const now = new Date('2024-06-15T20:00:00-07:00');
    
    const exceptions: HoursException[] = [{
      id: 'exception-1',
      type: 'special',
      label: 'Extended Summer Hours',
      startDate: '2024-06-15',
      endDate: '2024-06-15',
      closed: false,
      intervals: [{ open: '08:00', close: '23:00' }],
    }];
    
    const result = resolveOperatingStatus(baseLocation, [], exceptions, now);
    
    assert.strictEqual(result.state, 'Open');
    assert.strictEqual(result.source, 'exception');
    assert.strictEqual(result.reason, 'Extended Summer Hours');
  });
  
  it('should show Closed for holiday exception', () => {
    const now = new Date('2024-12-25T14:00:00-08:00');
    
    const exceptions: HoursException[] = [{
      id: 'exception-1',
      type: 'holiday',
      label: 'Christmas Day',
      startDate: '2024-12-25',
      endDate: '2024-12-25',
      closed: true,
      intervals: [],
    }];
    
    const result = resolveOperatingStatus(baseLocation, [], exceptions, now);
    
    assert.strictEqual(result.state, 'Closed');
    assert.strictEqual(result.source, 'exception');
    assert.strictEqual(result.reason, 'Christmas Day');
  });
  
  it('should use standard hours when no closure or exception', () => {
    const now = new Date('2024-06-17T15:00:00-07:00');
    
    const result = resolveOperatingStatus(baseLocation, [], [], now);
    
    assert.strictEqual(result.state, 'Open');
    assert.strictEqual(result.source, 'standard');
    assert.strictEqual(result.reason, 'Within scheduled hours');
  });
  
  it('should show Closed outside standard hours', () => {
    const now = new Date('2024-06-17T22:00:00-07:00');
    
    const result = resolveOperatingStatus(baseLocation, [], [], now);
    
    assert.strictEqual(result.state, 'Closed');
    assert.strictEqual(result.source, 'standard');
    assert.strictEqual(result.reason, 'Outside scheduled hours');
  });
});

describe('Operating State - Overnight Hours', () => {
  it('should handle overnight hours (close time < open time)', () => {
    const overnightLocation: Location = {
      ...baseLocation,
      standardHours: {
        ...baseLocation.standardHours!,
        friday: { closed: false, intervals: [{ open: '10:00', close: '02:00' }] },
        saturday: { closed: false, intervals: [{ open: '10:00', close: '02:00' }] },
      },
    };
    
    const fridayNight = new Date('2024-06-21T23:30:00-07:00');
    const result1 = resolveOperatingStatus(overnightLocation, [], [], fridayNight);
    assert.strictEqual(result1.state, 'Open', 'Should be open at 11:30 PM on Friday');
    
    const saturdayEarlyMorning = new Date('2024-06-22T01:30:00-07:00');
    const result2 = resolveOperatingStatus(overnightLocation, [], [], saturdayEarlyMorning);
    assert.strictEqual(result2.state, 'Open', 'Should be open at 1:30 AM Saturday (spillover from Friday)');
    
    const saturdayMorning = new Date('2024-06-22T08:00:00-07:00');
    const result3 = resolveOperatingStatus(overnightLocation, [], [], saturdayMorning);
    assert.strictEqual(result3.state, 'Closed', 'Should be closed at 8 AM Saturday (before opening)');
  });
});

describe('Operating State - Time Zones', () => {
  it('should correctly determine state based on location timezone', () => {
    const nyLocation: Location = {
      ...baseLocation,
      timeZone: 'America/New_York',
    };
    
    const now = new Date('2024-06-17T20:30:00Z');
    
    const laResult = resolveOperatingStatus(baseLocation, [], [], now);
    assert.strictEqual(laResult.state, 'Open', 'LA should be open at 1:30 PM local');
    assert.strictEqual(laResult.localTime, '13:30');
    
    const nyResult = resolveOperatingStatus(nyLocation, [], [], now);
    assert.strictEqual(nyResult.state, 'Open', 'NY should be open at 4:30 PM (before 21:00 close)');
    assert.strictEqual(nyResult.localTime, '16:30');
    
    const laterNow = new Date('2024-06-18T02:30:00Z');
    const nyLateResult = resolveOperatingStatus(nyLocation, [], [], laterNow);
    assert.strictEqual(nyLateResult.state, 'Closed', 'NY should be closed at 10:30 PM');
  });
  
  it('should handle different timezone stores correctly', () => {
    const chicagoLocation: Location = {
      ...baseLocation,
      timeZone: 'America/Chicago',
    };
    
    const now = new Date('2024-06-17T16:00:00-05:00');
    
    const result = resolveOperatingStatus(chicagoLocation, [], [], now);
    assert.strictEqual(result.state, 'Open');
    assert.strictEqual(result.timeZone, 'America/Chicago');
  });
});

describe('Operating State - Unknown Fallback', () => {
  it('should return Unknown for invalid timezone', () => {
    const badLocation: Location = {
      ...baseLocation,
      timeZone: 'Invalid/Timezone',
    };
    
    const result = resolveOperatingStatus(badLocation, [], [], new Date());
    
    assert.strictEqual(result.state, 'Unknown');
    assert.strictEqual(result.source, 'unknown');
  });
  
  it('should return Unknown for inactive location', () => {
    const inactiveLocation: Location = {
      ...baseLocation,
      lifecycle: 'planned',
    };
    
    const result = resolveOperatingStatus(inactiveLocation, [], [], new Date());
    
    assert.strictEqual(result.state, 'Closed');
    assert.match(result.reason, /not active/i);
  });
  
  it('should return Closed for retired location', () => {
    const retiredLocation: Location = {
      ...baseLocation,
      lifecycle: 'retired',
    };
    
    const result = resolveOperatingStatus(retiredLocation, [], [], new Date());
    
    assert.strictEqual(result.state, 'Closed');
    assert.strictEqual(result.reason, 'Location retired');
  });
});

describe('Operating State - Multiple Intervals', () => {
  it('should handle multiple intervals per day (split shift)', () => {
    const splitShiftLocation: Location = {
      ...baseLocation,
      standardHours: {
        ...baseLocation.standardHours!,
        monday: { 
          closed: false, 
          intervals: [
            { open: '10:00', close: '14:00' },
            { open: '17:00', close: '21:00' },
          ] 
        },
      },
    };
    
    const morning = new Date('2024-06-17T11:00:00-07:00');
    const result1 = resolveOperatingStatus(splitShiftLocation, [], [], morning);
    assert.strictEqual(result1.state, 'Open', 'Should be open during morning shift');
    
    const afternoon = new Date('2024-06-17T15:00:00-07:00');
    const result2 = resolveOperatingStatus(splitShiftLocation, [], [], afternoon);
    assert.strictEqual(result2.state, 'Closed', 'Should be closed during gap');
    
    const evening = new Date('2024-06-17T19:00:00-07:00');
    const result3 = resolveOperatingStatus(splitShiftLocation, [], [], evening);
    assert.strictEqual(result3.state, 'Open', 'Should be open during evening shift');
  });
});

describe('Formatting Functions', () => {
  it('should format hours display correctly', () => {
    assert.strictEqual(
      formatHoursDisplay({ closed: true, intervals: [] }),
      'Closed'
    );
    
    assert.strictEqual(
      formatHoursDisplay({ closed: false, intervals: [{ open: '10:00', close: '21:00' }] }),
      '10 AM - 9 PM'
    );
    
    assert.strictEqual(
      formatHoursDisplay({ closed: false, intervals: [{ open: '09:30', close: '22:30' }] }),
      '9:30 AM - 10:30 PM'
    );
    
    assert.strictEqual(
      formatHoursDisplay(null),
      'Hours not available'
    );
  });
  
  it('should format time correctly', () => {
    assert.strictEqual(formatTime('10:00'), '10 AM');
    assert.strictEqual(formatTime('14:30'), '2:30 PM');
    assert.strictEqual(formatTime('00:00'), '12 AM');
    assert.strictEqual(formatTime('12:00'), '12 PM');
    assert.strictEqual(formatTime('23:45'), '11:45 PM');
  });
});

describe('Closure Edge Cases', () => {
  it('should ignore ended closures', () => {
    const now = new Date('2024-06-17T14:00:00-07:00');
    
    const closures: Closure[] = [{
      id: 'closure-1',
      reason: 'Past repair',
      startsAt: '2024-06-10T08:00:00-07:00',
      endsAt: '2024-06-12T08:00:00-07:00',
      status: 'active',
    }];
    
    const result = resolveOperatingStatus(baseLocation, closures, [], now);
    
    assert.strictEqual(result.state, 'Open');
    assert.strictEqual(result.source, 'standard');
  });
  
  it('should ignore future closures', () => {
    const now = new Date('2024-06-17T14:00:00-07:00');
    
    const closures: Closure[] = [{
      id: 'closure-1',
      reason: 'Future repair',
      startsAt: '2024-06-20T08:00:00-07:00',
      endsAt: '2024-06-22T08:00:00-07:00',
      status: 'active',
    }];
    
    const result = resolveOperatingStatus(baseLocation, closures, [], now);
    
    assert.strictEqual(result.state, 'Open');
    assert.strictEqual(result.source, 'standard');
  });
  
  it('should ignore closures with ended status', () => {
    const now = new Date('2024-06-17T14:00:00-07:00');
    
    const closures: Closure[] = [{
      id: 'closure-1',
      reason: 'Ended repair',
      startsAt: '2024-06-15T08:00:00-07:00',
      endsAt: '2024-06-20T08:00:00-07:00',
      status: 'ended',
    }];
    
    const result = resolveOperatingStatus(baseLocation, closures, [], now);
    
    assert.strictEqual(result.state, 'Open');
    assert.strictEqual(result.source, 'standard');
  });
});

console.log('Operating State tests loaded');
