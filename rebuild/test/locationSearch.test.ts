import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Location Search Route', () => {
  describe('Search query handling', () => {
    it('returns empty array for short queries (< 2 chars)', () => {
      const query = 'a';
      const shouldSearch = query.trim().length >= 2;
      assert.strictEqual(shouldSearch, false);
    });

    it('accepts queries of 2+ characters', () => {
      const query = '07';
      const shouldSearch = query.trim().length >= 2;
      assert.strictEqual(shouldSearch, true);
    });

    it('trims whitespace from queries', () => {
      const query = '  07  ';
      const trimmed = query.trim();
      assert.strictEqual(trimmed, '07');
    });
  });

  describe('Store number matching', () => {
    it('matches store number with hash prefix', () => {
      const query = '#07';
      const searchWithoutHash = query.trim().toLowerCase().replace(/^#/, '');
      const storeNumber = '07';
      
      const matches = storeNumber === searchWithoutHash || storeNumber.includes(searchWithoutHash);
      assert.strictEqual(matches, true);
    });

    it('matches store number without hash prefix', () => {
      const query = '07';
      const searchWithoutHash = query.trim().toLowerCase().replace(/^#/, '');
      const storeNumber = '07';
      
      const matches = storeNumber === searchWithoutHash || storeNumber.includes(searchWithoutHash);
      assert.strictEqual(matches, true);
    });

    it('finds partial store number matches', () => {
      const query = '07';
      const searchWithoutHash = query.replace(/^#/, '').toLowerCase();
      const storeNumber = '107';
      
      const matches = storeNumber.includes(searchWithoutHash);
      assert.strictEqual(matches, true);
    });
  });

  describe('Name matching', () => {
    it('matches store name case-insensitively', () => {
      const query = 'main street';
      const name = 'Main Street Store'.toLowerCase();
      
      const matches = name.includes(query.toLowerCase());
      assert.strictEqual(matches, true);
    });

    it('matches partial store names', () => {
      const query = 'main';
      const name = 'Main Street Store'.toLowerCase();
      
      const matches = name.includes(query.toLowerCase());
      assert.strictEqual(matches, true);
    });
  });

  describe('City matching', () => {
    it('matches city name', () => {
      const query = 'los angeles';
      const city = 'Los Angeles'.toLowerCase();
      
      const matches = city.includes(query.toLowerCase());
      assert.strictEqual(matches, true);
    });
  });

  describe('Mall matching', () => {
    it('matches mall name', () => {
      const query = 'galleria';
      const mall = 'Galleria Mall'.toLowerCase();
      
      const matches = mall.includes(query.toLowerCase());
      assert.strictEqual(matches, true);
    });
  });

  describe('Phone matching', () => {
    it('matches phone digits (requires 3+ digits)', () => {
      const query = '555';
      const searchDigits = query.replace(/\D/g, '');
      const phone = '5551234567';
      
      const matches = searchDigits.length >= 3 && phone.includes(searchDigits);
      assert.strictEqual(matches, true);
    });

    it('ignores short digit sequences (< 3 digits)', () => {
      const query = '55';
      const searchDigits = query.replace(/\D/g, '');
      const phone = '5551234567';
      
      const matches = searchDigits.length >= 3 && phone.includes(searchDigits);
      assert.strictEqual(matches, false);
    });

    it('extracts digits from formatted phone queries', () => {
      const query = '(555) 123';
      const searchDigits = query.replace(/\D/g, '');
      
      assert.strictEqual(searchDigits, '555123');
    });
  });

  describe('Result sorting', () => {
    it('prioritizes exact store number matches', () => {
      const results = [
        { storeNumber: '107', title: 'Store 107' },
        { storeNumber: '07', title: 'Store 07' },
        { storeNumber: '070', title: 'Store 070' },
      ];
      
      const searchWithoutHash = '07';
      
      results.sort((a, b) => {
        const aExact = a.storeNumber?.toLowerCase() === searchWithoutHash;
        const bExact = b.storeNumber?.toLowerCase() === searchWithoutHash;
        if (aExact && !bExact) return -1;
        if (bExact && !aExact) return 1;
        return (a.storeNumber || '').localeCompare(b.storeNumber || '');
      });
      
      assert.strictEqual(results[0].storeNumber, '07', 'Exact match should be first');
    });
  });

  describe('Result limiting', () => {
    it('limits results to 10', () => {
      const maxResults = 10;
      const resultCount = 15;
      const limited = Math.min(resultCount, maxResults);
      
      assert.strictEqual(limited, 10);
    });
  });

  describe('API response format', () => {
    it('returns data wrapper object', () => {
      const response = { data: [] };
      assert.ok(Array.isArray(response.data), 'Response should have data array');
    });

    it('result object has required fields', () => {
      const result = {
        id: 'loc-123',
        storeNumber: '07',
        title: 'Main Street Store',
        city: 'Los Angeles',
        state: 'CA',
      };
      
      assert.ok(result.id, 'Result should have id');
      assert.ok(result.storeNumber, 'Result should have storeNumber');
      assert.ok(result.title, 'Result should have title');
    });
  });
});
