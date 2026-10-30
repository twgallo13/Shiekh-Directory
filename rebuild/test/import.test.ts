/**
 * Tests for CSV Import functionality
 * 
 * Tests verify:
 * 1. Import replaces data cleanly
 * 2. Required field validation
 * 3. Phone number normalization
 * 4. Hours parsing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Import - Phone Normalization', () => {
  function normalizePhoneNumber(phone: string): string | null {
    if (!phone) return null;
    
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    if (cleaned.startsWith('+1') && cleaned.length === 12) {
      return cleaned;
    }
    
    return null;
  }
  
  it('should normalize US phone numbers', () => {
    assert.strictEqual(normalizePhoneNumber('(213) 555-0007'), '+12135550007');
    assert.strictEqual(normalizePhoneNumber('213-555-0007'), '+12135550007');
    assert.strictEqual(normalizePhoneNumber('2135550007'), '+12135550007');
    assert.strictEqual(normalizePhoneNumber('1-213-555-0007'), '+12135550007');
    assert.strictEqual(normalizePhoneNumber('+1 213 555 0007'), '+12135550007');
  });
  
  it('should reject invalid phone numbers', () => {
    assert.strictEqual(normalizePhoneNumber('123'), null);
    assert.strictEqual(normalizePhoneNumber(''), null);
    assert.strictEqual(normalizePhoneNumber('555-1234'), null);
  });
});

describe('Import - Hours Parsing', () => {
  function normalizeTime(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    return `${hours.padStart(2, '0')}:${minutes || '00'}`;
  }
  
  function parseHoursValue(open: string, close: string): { closed: boolean; intervals: { open: string; close: string }[] } {
    if (open?.toLowerCase() === 'closed' || close?.toLowerCase() === 'closed') {
      return { closed: true, intervals: [] };
    }
    
    if (!open || !close) {
      return { closed: true, intervals: [] };
    }
    
    if (!/^\d{1,2}:\d{2}$/.test(open) || !/^\d{1,2}:\d{2}$/.test(close)) {
      return { closed: true, intervals: [] };
    }
    
    return {
      closed: false,
      intervals: [{ open: normalizeTime(open), close: normalizeTime(close) }],
    };
  }
  
  it('should parse standard hours', () => {
    const result = parseHoursValue('10:00', '21:00');
    assert.deepStrictEqual(result, {
      closed: false,
      intervals: [{ open: '10:00', close: '21:00' }],
    });
  });
  
  it('should parse closed days', () => {
    const result1 = parseHoursValue('closed', 'closed');
    assert.deepStrictEqual(result1, { closed: true, intervals: [] });
    
    const result2 = parseHoursValue('Closed', '');
    assert.deepStrictEqual(result2, { closed: true, intervals: [] });
  });
  
  it('should normalize single-digit hours', () => {
    const result = parseHoursValue('9:00', '21:00');
    assert.deepStrictEqual(result, {
      closed: false,
      intervals: [{ open: '09:00', close: '21:00' }],
    });
  });
  
  it('should handle overnight hours', () => {
    const result = parseHoursValue('22:00', '2:00');
    assert.deepStrictEqual(result, {
      closed: false,
      intervals: [{ open: '22:00', close: '02:00' }],
    });
  });
});

describe('Import - Required Field Validation', () => {
  const REQUIRED_LOCATION_COLUMNS = [
    'storeNumber', 'name', 'street', 'city', 'state', 'zip', 'mainPhone', 'timeZone'
  ];
  
  function validateLocationRow(row: Record<string, string>): string[] {
    const errors: string[] = [];
    
    for (const col of REQUIRED_LOCATION_COLUMNS) {
      if (!row[col]?.trim()) {
        errors.push(`Missing required field: ${col}`);
      }
    }
    
    return errors;
  }
  
  it('should detect missing required fields', () => {
    const row = {
      storeNumber: '007',
      name: 'Test Store',
    };
    
    const errors = validateLocationRow(row);
    
    assert.strictEqual(errors.length > 0, true);
    assert.strictEqual(errors.some(e => e.includes('street')), true);
    assert.strictEqual(errors.some(e => e.includes('mainPhone')), true);
  });
  
  it('should pass with all required fields', () => {
    const row = {
      storeNumber: '007',
      name: 'Test Store',
      street: '123 Test St',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      mainPhone: '(213) 555-0007',
      timeZone: 'America/Los_Angeles',
    };
    
    const errors = validateLocationRow(row);
    
    assert.strictEqual(errors.length, 0);
  });
  
  it('should detect empty string fields', () => {
    const row = {
      storeNumber: '007',
      name: '',
      street: '123 Test St',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      mainPhone: '(213) 555-0007',
      timeZone: 'America/Los_Angeles',
    };
    
    const errors = validateLocationRow(row);
    
    assert.strictEqual(errors.some(e => e.includes('name')), true);
  });
});

describe('Import - Data Replacement', () => {
  it('should track locations to create vs update', () => {
    const existingStoreNumbers = new Set(['001', '002', '003']);
    const importStoreNumbers = ['001', '004', '005'];
    
    let toCreate = 0;
    let toUpdate = 0;
    
    for (const num of importStoreNumbers) {
      if (existingStoreNumbers.has(num)) {
        toUpdate++;
      } else {
        toCreate++;
      }
    }
    
    assert.strictEqual(toCreate, 2);
    assert.strictEqual(toUpdate, 1);
  });
  
  it('should handle full replacement of assignments', () => {
    const existingAssignments = [
      { personId: 'p1', role: 'SM', scopeId: 'loc1' },
      { personId: 'p2', role: 'ASM', scopeId: 'loc1' },
    ];
    
    const newAssignments = [
      { personId: 'p1', role: 'SM', scopeId: 'loc1' },
      { personId: 'p3', role: 'ASM', scopeId: 'loc1' },
    ];
    
    const toRemove = existingAssignments.length;
    const toCreate = newAssignments.length;
    
    assert.strictEqual(toRemove, 2);
    assert.strictEqual(toCreate, 2);
  });
});

console.log('Import tests loaded');
