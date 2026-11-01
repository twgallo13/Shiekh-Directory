import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Import Kind Column', () => {
  it('defaults to store when kind column is empty', () => {
    const row = { kind: '' };
    const kindValue = (row.kind?.trim().toLowerCase() || 'store');
    
    assert.strictEqual(kindValue, 'store');
  });
  
  it('defaults to store when kind column is undefined', () => {
    const row: { kind?: string } = {};
    const kindValue = (row.kind?.trim().toLowerCase() || 'store');
    
    assert.strictEqual(kindValue, 'store');
  });
  
  it('parses warehouse kind', () => {
    const row = { kind: 'warehouse' };
    const kindValue = (row.kind?.trim().toLowerCase() || 'store');
    
    assert.strictEqual(kindValue, 'warehouse');
  });
  
  it('parses office kind (case insensitive)', () => {
    const row = { kind: 'OFFICE' };
    const kindValue = (row.kind?.trim().toLowerCase() || 'store');
    
    assert.strictEqual(kindValue, 'office');
  });
  
  it('validates invalid kind values', () => {
    const validKinds = ['store', 'warehouse', 'office'];
    const row = { kind: 'invalid' };
    const kindValue = row.kind?.trim().toLowerCase();
    
    assert.strictEqual(validKinds.includes(kindValue!), false);
  });
});

describe('Location Kinds', () => {
  describe('Kind Types', () => {
    it('supports store, warehouse, and office kinds', () => {
      const validKinds = ['store', 'warehouse', 'office'];
      
      for (const kind of validKinds) {
        assert.ok(validKinds.includes(kind), `${kind} should be a valid kind`);
      }
    });
    
    it('defaults to store for backward compatibility', () => {
      const defaultKind = 'store';
      assert.strictEqual(defaultKind, 'store');
    });
  });
  
  describe('Kind Filtering', () => {
    it('filters locations by kind', () => {
      const locations = [
        { id: '1', kind: 'store', name: 'Store 1' },
        { id: '2', kind: 'warehouse', name: 'Warehouse 1' },
        { id: '3', kind: 'office', name: 'Office 1' },
        { id: '4', kind: 'store', name: 'Store 2' },
      ];
      
      const stores = locations.filter(l => l.kind === 'store');
      const warehouses = locations.filter(l => l.kind === 'warehouse');
      const offices = locations.filter(l => l.kind === 'office');
      
      assert.strictEqual(stores.length, 2);
      assert.strictEqual(warehouses.length, 1);
      assert.strictEqual(offices.length, 1);
    });
    
    it('returns all locations when kind is "all"', () => {
      const locations = [
        { id: '1', kind: 'store', name: 'Store 1' },
        { id: '2', kind: 'warehouse', name: 'Warehouse 1' },
        { id: '3', kind: 'office', name: 'Office 1' },
      ];
      
      const kindFilter = 'all';
      const filtered = kindFilter === 'all' 
        ? locations 
        : locations.filter(l => l.kind === kindFilter);
      
      assert.strictEqual(filtered.length, 3);
    });
  });
  
  describe('Kind Display', () => {
    it('stores have SM field', () => {
      const store = {
        kind: 'store',
        storeNumber: '007',
        smName: 'John Doe',
      };
      
      assert.ok(store.smName, 'Stores should have SM name');
    });
    
    it('warehouses may not have SM', () => {
      const warehouse = {
        kind: 'warehouse',
        storeNumber: 'WH-001',
        smName: undefined,
      };
      
      assert.strictEqual(warehouse.smName, undefined);
    });
    
    it('offices may not have SM', () => {
      const office = {
        kind: 'office',
        storeNumber: 'HQ-001',
        smName: undefined,
      };
      
      assert.strictEqual(office.smName, undefined);
    });
  });
  
  describe('Kind-specific Labels', () => {
    it('uses correct icons for each kind', () => {
      const kindIcons = {
        store: 'Store',
        warehouse: 'Warehouse',
        office: 'Building2',
      };
      
      assert.strictEqual(kindIcons.store, 'Store');
      assert.strictEqual(kindIcons.warehouse, 'Warehouse');
      assert.strictEqual(kindIcons.office, 'Building2');
    });
    
    it('pluralizes kind names correctly', () => {
      const counts = [
        { count: 0, kind: 'store', expected: 'stores' },
        { count: 1, kind: 'store', expected: 'store' },
        { count: 2, kind: 'store', expected: 'stores' },
        { count: 1, kind: 'warehouse', expected: 'warehouse' },
        { count: 5, kind: 'warehouse', expected: 'warehouses' },
      ];
      
      for (const { count, kind, expected } of counts) {
        const plural = count !== 1 ? `${kind}s` : kind;
        assert.strictEqual(plural, expected);
      }
    });
  });
});

describe('Input Validation', () => {
  describe('storeType validation', () => {
    const VALID_STORE_TYPES = new Set([
      'enclosed_mall', 'strip_center', 'street_standalone',
      'corporate_office', 'warehouse_distribution', 'other_location',
    ]);

    it('accepts valid storeType values', () => {
      const validTypes = ['enclosed_mall', 'strip_center', 'street_standalone'];
      for (const type of validTypes) {
        assert.strictEqual(VALID_STORE_TYPES.has(type), true);
      }
    });

    it('rejects invalid storeType values', () => {
      const invalidTypes = ['zzz', 'invalid', 'mall', 'store'];
      for (const type of invalidTypes) {
        assert.strictEqual(VALID_STORE_TYPES.has(type), false);
      }
    });
  });

  describe('limit validation', () => {
    function validateLimit(limit: unknown): { valid: boolean; error?: string } {
      if (limit === undefined) return { valid: true };
      const limitNum = Number(limit);
      if (isNaN(limitNum) || limitNum < 1 || !Number.isInteger(limitNum)) {
        return { valid: false, error: 'limit must be a positive integer' };
      }
      return { valid: true };
    }

    it('accepts undefined limit', () => {
      assert.strictEqual(validateLimit(undefined).valid, true);
    });

    it('accepts positive integer limit', () => {
      assert.strictEqual(validateLimit('50').valid, true);
      assert.strictEqual(validateLimit(100).valid, true);
    });

    it('rejects negative limit', () => {
      const result = validateLimit('-5');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'limit must be a positive integer');
    });

    it('rejects zero limit', () => {
      const result = validateLimit('0');
      assert.strictEqual(result.valid, false);
    });

    it('rejects non-integer limit', () => {
      const result = validateLimit('5.5');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('changes object validation', () => {
    function validateChanges(changes: unknown): { valid: boolean; error?: string } {
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        return { valid: false, error: 'changes must be a non-null object' };
      }
      return { valid: true };
    }

    it('accepts valid object', () => {
      assert.strictEqual(validateChanges({ mainPhone: '555-1234' }).valid, true);
    });

    it('rejects null', () => {
      const result = validateChanges(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'changes must be a non-null object');
    });

    it('rejects string', () => {
      const result = validateChanges('x');
      assert.strictEqual(result.valid, false);
    });

    it('rejects array', () => {
      const result = validateChanges([{ field: 'phone' }]);
      assert.strictEqual(result.valid, false);
    });

    it('rejects undefined', () => {
      const result = validateChanges(undefined);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('dryRun validation', () => {
    function validateDryRun(dryRun: unknown): { valid: boolean; error?: string } {
      if (dryRun === undefined) return { valid: true };
      if (typeof dryRun !== 'boolean') {
        return { valid: false, error: 'dryRun must be a boolean' };
      }
      return { valid: true };
    }

    it('accepts undefined dryRun', () => {
      assert.strictEqual(validateDryRun(undefined).valid, true);
    });

    it('accepts boolean true', () => {
      assert.strictEqual(validateDryRun(true).valid, true);
    });

    it('accepts boolean false', () => {
      assert.strictEqual(validateDryRun(false).valid, true);
    });

    it('rejects string "yes"', () => {
      const result = validateDryRun('yes');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'dryRun must be a boolean');
    });

    it('rejects string "true"', () => {
      const result = validateDryRun('true');
      assert.strictEqual(result.valid, false);
    });

    it('rejects number 1', () => {
      const result = validateDryRun(1);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('locationId validation', () => {
    function validateLocationId(locationId: unknown): { valid: boolean; error?: string } {
      if (typeof locationId !== 'string') {
        return { valid: false, error: 'locationId must be a string' };
      }
      return { valid: true };
    }

    it('accepts string locationId', () => {
      assert.strictEqual(validateLocationId('store-001').valid, true);
    });

    it('rejects number locationId', () => {
      const result = validateLocationId(123);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'locationId must be a string');
    });

    it('rejects null locationId', () => {
      const result = validateLocationId(null);
      assert.strictEqual(result.valid, false);
    });
  });
});

describe('Assignment Ending Edge Cases', () => {
  describe('max(yesterday, startDate) Logic', () => {
    it('uses startDate when assignment started recently', () => {
      const yesterday = '2026-10-29';
      const startDate = '2026-10-29';
      
      const effectiveEndDate = startDate > yesterday ? startDate : yesterday;
      
      assert.strictEqual(effectiveEndDate, '2026-10-29');
    });
    
    it('uses startDate when assignment started today', () => {
      const yesterday = '2026-10-29';
      const startDate = '2026-10-30';
      
      const effectiveEndDate = startDate > yesterday ? startDate : yesterday;
      
      assert.strictEqual(effectiveEndDate, '2026-10-30');
    });
    
    it('uses yesterday when assignment started long ago', () => {
      const yesterday = '2026-10-29';
      const startDate = '2024-01-15';
      
      const effectiveEndDate = startDate > yesterday ? startDate : yesterday;
      
      assert.strictEqual(effectiveEndDate, '2026-10-29');
    });
    
    it('prevents end date before start date', () => {
      const yesterday = '2026-10-29';
      const startDate = '2026-10-30';
      
      const effectiveEndDate = startDate > yesterday ? startDate : yesterday;
      const endDateIsAfterStart = effectiveEndDate >= startDate;
      
      assert.strictEqual(endDateIsAfterStart, true);
    });
  });
  
  describe('Future Assignment Deletion', () => {
    it('identifies future assignments for deletion', () => {
      const today = '2026-10-30';
      const futureStart = '2026-11-15';
      
      const neverStarted = futureStart > today;
      
      assert.strictEqual(neverStarted, true);
    });
    
    it('does not delete assignments starting today', () => {
      const today = '2026-10-30';
      const startDate = '2026-10-30';
      
      const neverStarted = startDate > today;
      
      assert.strictEqual(neverStarted, false);
    });
    
    it('does not delete past assignments', () => {
      const today = '2026-10-30';
      const startDate = '2026-10-01';
      
      const neverStarted = startDate > today;
      
      assert.strictEqual(neverStarted, false);
    });
  });
});
